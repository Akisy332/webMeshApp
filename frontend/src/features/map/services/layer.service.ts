import * as L from 'leaflet';
import { LayerConfig } from '../types/map.types.js';

export class LayerService {
    private layers: Map<string, L.TileLayer> = new Map();
    private map: L.Map | null = null;
    private currentBaseLayer: string = '';

    public initialize(map: L.Map): void {
        this.map = map;
        this.setupDefaultLayers();
    }

    private setupDefaultLayers(): void {
        const baseLayers: LayerConfig[] = [
            {
                id: 'osm',
                name: 'OpenStreetMap',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '&copy; OpenStreetMap contributors',
                default: true,
            },
            {
                id: 'satellite',
                name: 'Satellite',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: '&copy; Esri',
                default: false,
            },
        ];

        baseLayers.forEach((layerConfig) => {
            this.addLayer(layerConfig);
            if (layerConfig.default) {
                this.setBaseLayer(layerConfig.id);
            }
        });
    }

    public addLayer(config: LayerConfig): void {
        if (!this.map) return;

        const layer = L.tileLayer(config.url, {
            attribution: config.attribution,
        });

        this.layers.set(config.id, layer);
    }

    public setBaseLayer(layerId: string): void {
        if (!this.map || !this.layers.has(layerId)) return;

        // Удаляем текущий базовый слой
        if (this.currentBaseLayer && this.layers.has(this.currentBaseLayer)) {
            this.map.removeLayer(this.layers.get(this.currentBaseLayer)!);
        }

        // Добавляем новый базовый слой
        const newLayer = this.layers.get(layerId)!;
        newLayer.addTo(this.map);
        this.currentBaseLayer = layerId;
    }

    public getAvailableLayers(): string[] {
        return Array.from(this.layers.keys());
    }

    public getCurrentBaseLayer(): string {
        return this.currentBaseLayer;
    }

    public destroy(): void {
        this.layers.clear();
        this.map = null;
    }
}
