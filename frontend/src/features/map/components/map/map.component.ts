import { BaseComponent } from '../../../../core/component-base.js';
import { MapService } from '../../services/map.service.js';
import { MapConfig } from '../../types/map.types.js';

export class MapComponent extends BaseComponent {
    private mapService: MapService | null = null;
    private config: MapConfig;

    constructor(containerId: string, config: MapConfig) {
        super(containerId);
        this.config = config;
    }

    protected render(): void {
        // Контейнер уже должен быть в HTML
        this.element.innerHTML = `
            <div class="map-container">
                <div id="${this.config.containerId}" class="map-element"></div>
            </div>
        `;
    }

    protected bindEvents(): void {
        // Инициализация карты после рендеринга
        setTimeout(() => {
            this.initializeMap();
        }, 0);
    }

    private initializeMap(): void {
        try {
            this.mapService = new MapService(this.config);
            console.log('MapComponent: Map service initialized');
        } catch (error) {
            console.error('MapComponent: Failed to initialize map:', error);
        }
    }

    // Публичные методы для работы с картой
    public getMapService(): MapService | null {
        return this.mapService;
    }

    public clearMap(): void {
        this.mapService?.clearMap();
    }

    public override destroy(): void {
        this.mapService?.destroy();
        super.destroy();
    }
}
