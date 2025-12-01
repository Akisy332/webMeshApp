import * as L from 'leaflet';
import { ContextMenuItem, ContextMenuSeparator, ContextMenuElement, ContextMenuConfig } from '../types/map.types.js';
import { eventBus } from '../../../core/event-bus.js';
import { EventTypes } from '../../../core/constants.js';

export class ContextMenuService {
    private map: L.Map | null = null;
    private contextMenu: HTMLElement | null = null;
    private isVisible: boolean = false;
    private currentPosition: [number, number] = [0, 0];
    private timeSliderEnabled: boolean = false;

    private globalClickHandler: ((e: MouseEvent) => void) | null = null;
    private globalTouchHandler: ((e: TouchEvent) => void) | null = null;

    constructor() {
        this.createContextMenu();
    }

    public initialize(map: L.Map): void {
        this.map = map;
        this.setupMapEvents();
    }

    private createContextMenu(): void {
        this.contextMenu = L.DomUtil.create('div', 'leaflet-context-menu');
        this.contextMenu.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            padding: 4px 0;
            min-width: 160px;
            z-index: 1000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
        `;

        // Предотвращаем закрытие карты при клике на меню
        L.DomEvent.disableClickPropagation(this.contextMenu);
        L.DomEvent.on(this.contextMenu, 'contextmenu', L.DomEvent.stopPropagation);
    }

    private setupMapEvents(): void {
        if (!this.map) return;

        // Десктоп: правый клик
        this.map.on('contextmenu', (e: L.LeafletMouseEvent) => {
            this.showContextMenu(e.latlng, e.originalEvent);
        });

        // Телефон: долгое нажатие
        this.map.on('contextmenu', (e: L.LeafletMouseEvent) => {
            this.showContextMenu(e.latlng, e.originalEvent);
        });

        // Закрытие при любом взаимодействии с картой
        this.map.on('click', () => this.hideContextMenu());
        this.map.on('zoomstart', () => this.hideContextMenu());
        this.map.on('movestart', () => this.hideContextMenu()); // НАЧАЛО ПЕРЕМЕЩЕНИЯ
        this.map.on('dragstart', () => this.hideContextMenu()); // НАЧАЛО ПЕРЕТАСКИВАНИЯ

        // ДЛЯ ТЕЛЕФОНА: дополнительные события
        this.map.on('touchstart', () => this.hideContextMenu()); // КАСАНИЕ КАРТЫ
        this.map.on('touchmove', () => this.hideContextMenu()); // ДВИЖЕНИЕ ПО КАРТЕ

        // Добавляем меню в контейнер карты
        const mapContainer = this.map.getContainer();
        mapContainer.appendChild(this.contextMenu);
    }

    private setupGlobalEventListeners(): void {
        // Для десктопа
        this.globalClickHandler = (e: MouseEvent) => {
            if (this.isVisible && this.contextMenu && !this.contextMenu.contains(e.target as Node)) {
                this.hideContextMenu();
            }
        };

        // Для телефона: перехватываем ВСЕ touch события
        this.globalTouchHandler = (e: TouchEvent) => {
            if (this.isVisible && this.contextMenu && !this.contextMenu.contains(e.target as Node)) {
                this.hideContextMenu();
            }
        };

        document.addEventListener('mousedown', this.globalClickHandler, true);
        document.addEventListener('touchstart', this.globalTouchHandler, true); // НОВОЕ
        window.addEventListener('blur', this.hideContextMenu.bind(this));
    }

    private removeGlobalEventListeners(): void {
        if (this.globalClickHandler) {
            document.removeEventListener('mousedown', this.globalClickHandler, true);
            this.globalClickHandler = null;
        }
        if (this.globalTouchHandler) {
            document.removeEventListener('touchstart', this.globalTouchHandler, true); // НОВОЕ
            this.globalTouchHandler = null;
        }
        window.removeEventListener('blur', this.hideContextMenu);
    }

    private showContextMenu(latlng: L.LatLng, originalEvent: MouseEvent): void {
        if (!this.contextMenu || !this.map) return;

        this.currentPosition = [latlng.lat, latlng.lng];

        // Показываем стандартное меню с базовыми опциями
        this.showDefaultMenu();

        // Позиционируем меню
        const point = this.map.latLngToContainerPoint(latlng);
        this.contextMenu.style.left = point.x + 'px';
        this.contextMenu.style.top = point.y + 'px';
        this.contextMenu.style.display = 'block';

        this.isVisible = true;

        // Включаем глобальные обработчики при показе
        this.setupGlobalEventListeners();

        // Предотвращаем стандартное контекстное меню браузера
        originalEvent.preventDefault();

        // Предотвращаем zoom при долгом нажатии на телефоне
        if (originalEvent instanceof TouchEvent) {
            originalEvent.stopPropagation();
        }
    }

    private showDefaultMenu(): void {
        if (!this.contextMenu) return;

        const timeSliderLabel = this.timeSliderEnabled ? 'Выключить временной слайдер' : 'Включить временной слайдер';

        const defaultItems: ContextMenuElement[] = [
            {
                id: 'center-map',
                label: 'Центрировать здесь',
                action: (position) => this.centerMap(position),
            },
            {
                id: 'get-coordinates',
                label: 'Координаты',
                action: (position) => this.showCoordinates(position),
            },
            {
                id: 'separator-1',
                separator: true,
            },
            {
                id: 'toggle-time-slider',
                label: timeSliderLabel,
                action: (position) => this.toggleTimeSlider(),
            },
            {
                id: 'separator-2',
                separator: true,
            },
            {
                id: 'copy-coordinates',
                label: 'Копировать координаты',
                action: (position) => this.copyCoordinates(position),
            },
        ];

        this.renderMenu(defaultItems);
    }

    private toggleTimeSlider(): void {
        this.timeSliderEnabled = !this.timeSliderEnabled;

        // Отправляем событие о переключении слайдера
        eventBus.emit(EventTypes.MAP.TIME_SLIDER_TOGGLE, {
            enabled: this.timeSliderEnabled,
            position: this.currentPosition,
        });
    }

    public showCustomMenu(config: ContextMenuConfig): void {
        if (!this.contextMenu || !this.map) return;

        this.renderMenu(config.items);

        if (config.position) {
            const latlng = L.latLng(config.position[0], config.position[1]);
            const point = this.map.latLngToContainerPoint(latlng);
            this.contextMenu.style.left = point.x + 'px';
            this.contextMenu.style.top = point.y + 'px';
            this.contextMenu.style.display = 'block';
            this.isVisible = true;
        }
    }

    private renderMenu(items: ContextMenuElement[]): void {
        if (!this.contextMenu) return;

        this.contextMenu.innerHTML = '';

        items.forEach((item) => {
            if ('separator' in item && item.separator) {
                const separator = document.createElement('div');
                separator.style.cssText = `
                height: 1px;
                background: #e0e0e0;
                margin: 4px 0;
            `;
                this.contextMenu!.appendChild(separator);
            } else {
                const menuItem = item as ContextMenuItem;
                const menuElement = document.createElement('div');
                menuElement.className = 'context-menu-item';

                // Добавляем класс active для активных пунктов
                if (menuItem.id === 'toggle-time-slider' && this.timeSliderEnabled) {
                    menuElement.classList.add('active');
                }

                menuElement.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background-color 0.2s;
            `;

                menuElement.innerHTML = `
                ${menuItem.icon ? `<span class="context-menu-icon">${menuItem.icon}</span>` : ''}
                <span class="context-menu-label">${menuItem.label}</span>
            `;

                menuElement.addEventListener('mouseenter', () => {
                    menuElement.style.backgroundColor = '#f5f5f5';
                });

                menuElement.addEventListener('mouseleave', () => {
                    menuElement.style.backgroundColor = '';
                });

                menuElement.addEventListener('click', () => {
                    menuItem.action(this.currentPosition);
                    this.hideContextMenu();
                });

                this.contextMenu!.appendChild(menuElement);
            }
        });
    }

    private hideContextMenu(): void {
        if (!this.contextMenu) return;

        this.contextMenu.style.display = 'none';
        this.isVisible = false;

        // Отключаем глобальные обработчики при скрытии
        this.removeGlobalEventListeners();
    }

    private centerMap(position: [number, number]): void {
        if (!this.map) return;

        this.map.setView(position, this.map.getZoom());
    }

    private showCoordinates(position: [number, number]): void {
        const message = `Широта: ${position[0].toFixed(6)}\nДолгота: ${position[1].toFixed(6)}`;
        alert(message);
    }

    private copyCoordinates(position: [number, number]): void {
        const text = `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`;

        navigator.clipboard.writeText(text).catch(() => {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        });
    }

    public isMenuVisible(): boolean {
        return this.isVisible;
    }

    public destroy(): void {
        this.removeGlobalEventListeners();

        if (this.contextMenu && this.contextMenu.parentNode) {
            this.contextMenu.parentNode.removeChild(this.contextMenu);
        }
        this.contextMenu = null;
        this.map = null;
    }
}
