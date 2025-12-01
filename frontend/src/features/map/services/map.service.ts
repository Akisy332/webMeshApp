import * as L from 'leaflet';
import { eventBus } from '../../../core/event-bus.js';
import { EventTypes } from '../../../core/constants.js';
import { ISettingsManager } from '../../../core/types.js';
import { MapConfig, MarkerConfig, TraceConfig } from '../types/map.types.js';
import { MarkerService } from './marker.service.js';
import { TraceService } from './trace.service.js';
import { LayerService } from './layer.service.js';
import { ContextMenuService } from './context-menu.service.js';

import { timeSlider, TimeSliderPlugin } from '../plugins/time-slider.plugin.js';

export class MapService {
    private settingsManager: ISettingsManager;
    private map: L.Map | null = null;
    private config: MapConfig;
    private currentSessionId: number | null = null;

    // Подсервисы
    private markerService: MarkerService;
    private traceService: TraceService;
    private layerService: LayerService;
    private contextMenuService: ContextMenuService;

    private timeSliderPlugin: TimeSliderPlugin | null = null;

    constructor(config: MapConfig, settingsManager?: ISettingsManager) {
        this.config = config;
        this.settingsManager = settingsManager;

        // Инициализация подсервисов
        this.markerService = new MarkerService();
        this.traceService = new TraceService();
        this.layerService = new LayerService();
        this.contextMenuService = new ContextMenuService();

        this.initialize();
    }

    private initialize(): void {
        try {
            this.createMap();
            this.initializeSubServices();
            this.setupEventListeners();
            this.initializeTimeSlider();

            console.log('MapService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize MapService:', error);
        }
    }

    private createMap(): void {
        const container = document.getElementById(this.config.containerId);
        if (!container) {
            throw new Error(`Map container #${this.config.containerId} not found`);
        }

        this.map = L.map(this.config.containerId).setView(this.config.center, this.config.zoom);

        // Настройка ограничений zoom
        if (this.config.minZoom) this.map.setMinZoom(this.config.minZoom);
        if (this.config.maxZoom) this.map.setMaxZoom(this.config.maxZoom);
    }

    private initializeSubServices(): void {
        if (!this.map) return;

        this.markerService.initialize(this.map);
        this.traceService.initialize(this.map);
        this.layerService.initialize(this.map);
        this.contextMenuService.initialize(this.map);

        this.traceService.setMarkerService(this.markerService);
    }

    private initializeTimeSlider(): void {
        if (!this.map) return;
        this.timeSliderPlugin = timeSlider(this.map);
    }

    private setupEventListeners(): void {
        // СОЗДАЕМ маркеры при загрузке данных сессии
        eventBus.on(EventTypes.SESSION.LOAD_DATA, (sessionData: any) => {
            console.log('MapService: Session data loaded, creating markers', sessionData);

            // 1. Позиционируем карту
            this.positionMapFromSessionData(sessionData);

            // 2. Создаем маркеры с восстановлением состояния
            this.createMarkersFromSessionData(sessionData);

            // 3. Восстанавливаем состояние треков из памяти
            this.restoreTracesState();
        });

        // ОЧИЩАЕМ карту при выборе новой сессии (до загрузки данных)
        eventBus.on(EventTypes.SESSION.SELECTED, (session: any) => {
            this.currentSessionId = session?.id || null;
            console.log('MapService: Session selected, clearing map for:', session);
            this.clearMap();
        });
    }

    private positionMapFromSessionData(sessionData: any): void {
        if (!sessionData?.map) {
            console.warn('No map positioning data in session');
            return;
        }

        const mapData = sessionData.map;
        console.log('Positioning map with data:', mapData);

        // Позиционируем карту по данным из сессии
        if (mapData.lat && mapData.lon) {
            const center: [number, number] = [mapData.lat, mapData.lon];
            const zoom = mapData.zoom || 13; // Используем zoom из данных или дефолтный

            this.setView(center, zoom);
            console.log(`Map positioned to: ${center}, zoom: ${zoom}`);
        } else {
            console.warn('Invalid map center coordinates');
        }
    }

    private createMarkersFromSessionData(sessionData: any): void {
        if (!sessionData?.modules) return;

        const checkboxStates = this.settingsManager?.getAllCheckboxStates(this.currentSessionId) || {};

        console.log(`Creating markers for session ${this.currentSessionId} with states:`, checkboxStates);

        sessionData.modules.forEach((moduleData: any) => {
            this.createMarkerForModule(moduleData, checkboxStates);
        });
    }

    private createMarkerForModule(moduleData: any, checkboxStates: Record<string, any>): void {
        if (!moduleData.coords?.lat || !moduleData.coords?.lon) {
            console.warn(`No coordinates for module ${moduleData.id_module}`);
            return;
        }

        const position: [number, number] = [moduleData.coords.lat, moduleData.coords.lon];

        // Получаем сохраненное состояние видимости
        const moduleState = checkboxStates[moduleData.id_module];
        const isVisible = moduleState?.marker ?? true; // По умолчанию видим

        console.log(`Creating marker for ${moduleData.id_module}, visible: ${isVisible}`);

        // Создаем маркер
        this.markerService.addMarker({
            id: moduleData.id_module,
            position: position,
            title: moduleData.module_name,
            color: moduleData.module_color || '#007bff',
        });

        // Устанавливаем начальную видимость
        this.markerService.setMarkerVisibility(moduleData.id_module, isVisible);
    }

    private restoreTracesState(): void {
        const checkboxStates = this.settingsManager?.getAllCheckboxStates(this.currentSessionId) || {};

        console.log(`Restoring traces state for session ${this.currentSessionId}:`, checkboxStates);

        // Включаем треки которые были включены в памяти
        Object.entries(checkboxStates).forEach(([moduleId, state]) => {
            if (state.trace) {
                console.log(`Restoring trace for ${moduleId} (was enabled in memory)`);
                this.traceService.setTraceVisibility(moduleId, true);
            }
        });
    }

    // Публичные методы для слоев
    public setBaseLayer(layerId: string): void {
        this.layerService.setBaseLayer(layerId);
    }

    public getAvailableLayers(): string[] {
        return this.layerService.getAvailableLayers();
    }

    public getCurrentBaseLayer(): string {
        return this.layerService.getCurrentBaseLayer();
    }

    // Публичные методы для работы с контекстным меню
    public showContextMenu(items: any[], position: [number, number]): void {
        this.contextMenuService.showCustomMenu({
            items: items,
            position: position,
        });
    }

    public hideContextMenu(): void {
        // Контекстное меню автоматически скрывается при клике на карту
    }

    // Утилиты
    public clearMap(): void {
        this.markerService.clearAllMarkers();
        this.traceService.clearAllTraces();
    }

    public setView(center: [number, number], zoom: number): void {
        this.map?.setView(center, zoom);
    }

    public getCurrentView(): { center: [number, number]; zoom: number } | null {
        if (!this.map) return null;

        const center = this.map.getCenter();
        return {
            center: [center.lat, center.lng],
            zoom: this.map.getZoom(),
        };
    }

    public destroy(): void {
        this.markerService.destroy();
        this.traceService.destroy();
        this.layerService.destroy();
        this.contextMenuService.destroy();

        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }
}
