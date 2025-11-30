// frontend/src/components/session-data-table/session-data-table-component.ts
import { GridApi, GridOptions, createGrid } from 'ag-grid-community';
import { ModuleData } from '../../types/index.js';
import { eventBus } from '../../core/event-bus.js';
import { EventTypes } from '../../core/constants.js';
import { ISettingsManager } from '../../core/types.js';

interface GridModuleData extends ModuleData {
    visible_marker: boolean;
    visible_trace: boolean;
    'coords.alt'?: number;
}

// Компонент таблицы данных сессии - отображает модули и управляет видимостью на карте
export class SessionDataTableComponent {
    private gridApi!: GridApi; // API для управления таблицей
    private settingsManager: ISettingsManager; // Хранилище настроек
    private currentSessionId: number | null = null; // ID текущей сессии
    private timeUpdateInterval: number | null = null; // Таймер обновления времени

    // Инициализирует таблицу, подписывается на события, запускает таймеры
    constructor(containerId: string, settingsManager: ISettingsManager) {
        this.settingsManager = settingsManager;
        this.initializeGrid(containerId);
        this.setupEventListeners();
        this.setupTimeUpdates();
    }

    // Создает AG Grid таблицу с колонками статуса, чекбоксов, времени
    private initializeGrid(containerId: string): void {
        const gridOptions: GridOptions = {
            columnDefs: [
                {
                    field: 'status',
                    headerName: 'Статус',
                    width: 70,
                    cellRenderer: this.statusCellRenderer.bind(this),
                    comparator: this.statusComparator.bind(this),
                },
                {
                    field: 'visible_marker',
                    headerName: 'Маркер',
                    width: 80,
                    cellRenderer: this.checkboxCellRenderer.bind(this),
                    cellRendererParams: { type: 'marker' },
                },
                {
                    field: 'visible_trace',
                    headerName: 'Трасса',
                    width: 80,
                    cellRenderer: this.checkboxCellRenderer.bind(this),
                    cellRendererParams: { type: 'trace' },
                },
                {
                    field: 'module_name',
                    headerName: 'Модуль',
                    width: 150,
                    cellRenderer: this.moduleNameCellRenderer.bind(this),
                },
                {
                    field: 'coords.alt',
                    headerName: 'Высота',
                    width: 100,
                    comparator: (valueA: number, valueB: number) => {
                        // Сортируем как числа
                        return (valueA || 0) - (valueB || 0);
                    },
                    cellRenderer: (params: any) => {
                        if (params.value === undefined || params.value === null) return '-';
                        const altitude = Math.round(params.value);
                        return `${altitude} м`;
                    },
                },
                {
                    field: 'datetime_unix',
                    headerName: 'Время',
                    width: 100,
                    cellRenderer: this.timeCellRenderer.bind(this),
                },
            ],

            getRowId: (params) => params.data.id_module,

            accentedSort: false,
            onGridReady: (params) => {
                this.gridApi = params.api;
                console.log('AG Grid ready');
            },
            onCellClicked: this.handleCellClick.bind(this),
        };

        const gridDiv = document.getElementById(containerId);
        if (gridDiv) {
            gridDiv.classList.add('ag-theme-alpine');
            this.gridApi = createGrid(gridDiv, gridOptions);
        }
    }

    // Отображает название модуля с цветным квадратом
    private moduleNameCellRenderer(params: any): string {
        const moduleData = params.data;
        const moduleName = moduleData.module_name || 'Н/Д';
        const moduleColor = moduleData.module_color || '#000000';

        return `
            <div class="module-name-cell" style="display: flex; align-items: center; gap: 8px;">
                <div class="module-color-square" 
                     style="width: 12px; height: 12px; background-color: ${moduleColor}; border: 1px solid #ccc; border-radius: 2px;">
                </div>
                <span class="module-name-text">${this.escapeHtml(moduleName)}</span>
            </div>
        `;
    }

    // Защита от XSS - экранирует HTML символы
    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Создает чекбоксы для управления видимостью маркеров и трасс
    private checkboxCellRenderer(params: any): string {
        const data = params.data;
        const type = params.type || 'marker';
        const checked = type === 'marker' ? data.visible_marker : data.visible_trace;
        const moduleId = data.id_module;

        return `
            <div class="checkbox-container">
                <input 
                    type="checkbox" 
                    ${checked ? 'checked' : ''}
                    data-module-id="${moduleId}"
                    data-type="${type}"
                    class="module-checkbox"
                />
            </div>
        `;
    }

    // Форматирует время в "минуты:секунды" с момента получения данных
    private timeCellRenderer(params: any): string {
        const value = params.value;

        const timestamp = value < 100000000000 ? value * 1000 : value;
        const messageTime = new Date(timestamp);

        if (isNaN(messageTime.getTime())) return 'Н/Д';

        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - messageTime.getTime()) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Запускает периодическое обновление времени каждую секунду
    private setupTimeUpdates(): void {
        this.timeUpdateInterval = window.setInterval(() => {
            this.refreshTimeCells();
        }, 1000);
    }

    // Обновляет все видимые ячейки времени
    private refreshTimeCells(): void {
        if (!this.gridApi) return;

        // Форсируем перерисовку ВСЕХ видимых ячеек времени
        this.gridApi.refreshCells({
            columns: ['datetime_unix', 'status'], // Только колонку времени
            force: true, // Форсируем перерисовку даже если данные не изменились
        });
    }

    // Рендерит цветную точку статуса (зеленая/синяя/желтая/красная)
    private statusCellRenderer(params: any): string {
        const data = params.data;
        const color = this.getStatusColor(data);
        const tooltip = this.getStatusTooltip(data);

        return `
            <div class="status-dot dynamic-dot" 
                 style="background-color: ${color}"
                 title="${tooltip}"
                 data-bs-toggle="tooltip">
            </div>
        `;
    }

    // Сортирует модули по приоритету статуса (свежесть данных + GPS)
    private statusComparator(valueA: any, valueB: any, nodeA: any, nodeB: any): number {
        // Получаем приоритет цвета для сортировки
        const priorityA = this.getStatusPriority(nodeA.data);
        const priorityB = this.getStatusPriority(nodeB.data);

        return priorityA - priorityB;
    }

    // Определяет приоритет статуса для сортировки (1-4)
    private getStatusPriority(moduleData: ModuleData): number {
        const now = Date.now();
        const timestamp =
            moduleData.datetime_unix < 100000000000 ? moduleData.datetime_unix * 1000 : moduleData.datetime_unix;
        const diffSeconds = (now - timestamp) / 1000;

        if (moduleData.gps_ok) {
            if (diffSeconds < 60) return 1; // зеленый - высший приоритет
            if (diffSeconds < 300) return 3; // желтый
            return 4; // красный
        } else {
            if (diffSeconds < 60) return 2; // синий
            if (diffSeconds < 300) return 3; // желтый
            return 4; // красный
        }
    }

    // Возвращает цвет точки на основе статуса модуля
    private getStatusColor(moduleData: ModuleData): string {
        const priority = this.getStatusPriority(moduleData);

        switch (priority) {
            case 1:
                return '#4CAF50'; // зеленый
            case 2:
                return '#2196F3'; // синий
            case 3:
                return '#FFC107'; // желтый
            case 4:
                return '#F44336'; // красный
            default:
                return '#6c757d'; // серый по умолчанию
        }
    }

    // Создает всплывающую подсказку с информацией о статусе
    private getStatusTooltip(moduleData: ModuleData): string {
        const now = Date.now();
        const timestamp =
            moduleData.datetime_unix < 100000000000 ? moduleData.datetime_unix * 1000 : moduleData.datetime_unix;
        const diffSeconds = (now - timestamp) / 1000;

        const statusText = moduleData.gps_ok ? 'Активен' : 'Ошибка GPS';

        if (diffSeconds < 60) return `${statusText}\nДанные свежие (<60 сек)`;
        if (diffSeconds < 300) return `${statusText}\nДанные устаревают (60-300 сек)`;
        return `${statusText}\nДанные устарели (>300 сек)`;
    }

    // Обрабатывает клики по ячейкам (только чекбоксы)
    private handleCellClick(params: any): void {
        // Обрабатываем клики только по чекбоксам
        if (params.colDef.field !== 'visible_marker' && params.colDef.field !== 'visible_trace') {
            return;
        }

        const target = params.event.target as HTMLInputElement;
        if (target && target.type === 'checkbox') {
            this.handleCheckboxChange(target, params.data);
        }
    }

    // Обновляет состояние чекбокса и сохраняет в настройках
    private handleCheckboxChange(checkbox: HTMLInputElement, moduleData: GridModuleData): void {
        const moduleId = moduleData.id_module;
        const type = checkbox.getAttribute('data-type') as 'marker' | 'trace';
        const checked = checkbox.checked;

        // Обновляем данные в таблице
        if (type === 'marker') {
            moduleData.visible_marker = checked;
        } else {
            moduleData.visible_trace = checked;
        }

        // Сохраняем состояние в настройках
        this.settingsManager.setCheckboxState(this.currentSessionId, moduleId, type, checked);

        // Обновляем строку в таблице
        this.gridApi.applyTransaction({ update: [moduleData] });

        // Отправляем событие через EventBus
        this.emitCheckboxEvent(type, moduleId, checked, moduleData);
    }

    // Отправляет событие об изменении видимости маркера/трассы
    private emitCheckboxEvent(
        type: 'marker' | 'trace',
        id_module: string,
        checked: boolean,
        moduleData: GridModuleData
    ): void {
        const eventType = type === 'marker' ? EventTypes.TABLE.CHECKBOX_MARKER : EventTypes.TABLE.CHECKBOX_TRACE;

        eventBus.emit(eventType, {
            id_module,
            checked,
            moduleData,
            sessionId: this.currentSessionId,
        });
    }

    // Подписывается на события смены сессии, загрузки данных, реального времени
    private setupEventListeners(): void {
        eventBus.on(EventTypes.SESSION.SELECTED, (session: any) => {
            this.handleSessionChange(session);
        });

        eventBus.on(EventTypes.SESSION.LOAD_DATA, (sessionData: any) => {
            if (sessionData?.modules) {
                this.handleSessionDataLoad(sessionData.modules);
            }
        });

        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data: any) => {
            this.handleRealTimeData(data);
        });
    }

    // Загружает данные модулей в таблицу при выборе сессии
    private handleSessionDataLoad(modules: ModuleData[]): void {
        // используем SettingsManager для начального состояния
        const enrichedData = modules.map((data) => this.enrichModuleData(data));

        if (this.gridApi) {
            this.gridApi.setGridOption('rowData', enrichedData);
        }
    }

    // Обновляет данные в реальном времени при получении новых точек
    private handleRealTimeData(data: any): void {
        if (!this.gridApi || !this.currentSessionId) return;

        const newData = data.points || data.modules || [data];
        if (!Array.isArray(newData) || newData.length === 0) return;

        const updates: GridModuleData[] = [];
        const additions: GridModuleData[] = [];

        newData.forEach((moduleData: ModuleData) => {
            const rowNode = this.gridApi.getRowNode(moduleData.id_module);

            if (rowNode && rowNode.data) {
                // сохраняем текущие состояния чекбоксов
                const updatedData = {
                    ...moduleData,
                    visible_marker: rowNode.data.visible_marker, // текущее состояние
                    visible_trace: rowNode.data.visible_trace, // текущее состояние
                    'coords.alt': moduleData.coords?.alt,
                    _lastUpdate: Date.now(),
                };
                updates.push(updatedData);
            } else {
                // используем значения по умолчанию
                const newRowData = {
                    ...moduleData,
                    visible_marker: true, // по умолчанию
                    visible_trace: false, // по умолчанию
                    'coords.alt': moduleData.coords?.alt,
                };
                additions.push(newRowData);
            }
        });

        if (updates.length > 0 || additions.length > 0) {
            this.gridApi.applyTransaction({ update: updates, add: additions });
            this.refreshStatusCells();
        }
    }

    // Обновляет только ячейки статуса после получения новых данных
    private refreshStatusCells(): void {
        if (!this.gridApi) return;

        // Обновляем только статусы сразу после получения данных
        this.gridApi.refreshCells({
            columns: ['status'],
            force: true,
        });
    }

    // Обогащает данные модулей состояниями чекбоксов из настроек
    private enrichModuleData(moduleData: ModuleData): GridModuleData {
        // Загружаем сохраненные состояния чекбоксов
        const checkboxState = this.currentSessionId
            ? this.settingsManager.getCheckboxState(this.currentSessionId, moduleData.id_module)
            : { marker: true, trace: false };

        return {
            ...moduleData,
            visible_marker: checkboxState.marker,
            visible_trace: checkboxState.trace,
            'coords.alt': moduleData.coords?.alt,
        };
    }

    // Обрабатывает смену активной сессии - очищает или загружает данные
    private handleSessionChange(session: any): void {
        this.currentSessionId = session?.id || null;

        if (this.gridApi) {
            this.gridApi.setGridOption('rowData', []);
        }
    }

    // Очищает таймеры, отписывается от событий, уничтожает таблицу
    public destroy(): void {
        // Очищаем таймер
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        // Отписываемся от EventBus
        eventBus.off(EventTypes.SOCKET.NEW_DATA_MODULE, this.handleRealTimeData);
        eventBus.off(EventTypes.SESSION.SELECTED, this.handleSessionChange);
        eventBus.off(EventTypes.SESSION.LOAD_DATA, this.handleSessionDataLoad);

        // Уничтожаем grid
        this.gridApi?.destroy();
    }
}
