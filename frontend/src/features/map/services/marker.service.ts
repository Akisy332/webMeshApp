import * as L from 'leaflet';
import { eventBus } from '../../../core/event-bus.js';
import { EventTypes } from '../../../core/constants.js';
import { MarkerConfig } from '../types/map.types.js';

export class MarkerService {
    private markers: Map<string, L.Marker> = new Map();
    private map: L.Map | null = null;

    constructor() {
        this.setupEventListeners();
    }

    public initialize(map: L.Map): void {
        this.map = map;
    }

    public has(id: string): boolean {
        return this.markers.has(id);
    }

    public addMarker(config: MarkerConfig): void {
        if (!this.map) {
            console.warn('Map not initialized for MarkerService');
            return;
        }

        const marker = L.marker(config.position, {
            title: config.title || config.id,
        });

        // Кастомная иконка с цветом
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${config.color || '#007bff'}; 
                              width: 12px; height: 12px; border-radius: 50%; 
                              border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
        });

        marker.setIcon(icon);
        marker.addTo(this.map);

        // Обработчик клика
        marker.on('click', () => {
            eventBus.emit(EventTypes.MAP.MARKER_CLICK, {
                markerId: config.id,
                position: config.position,
            });
        });

        this.markers.set(config.id, marker);
    }

    public updateMarker(id: string, config: Partial<MarkerConfig>): void {
        const marker = this.markers.get(id);
        if (marker && config.position) {
            marker.setLatLng(config.position);
        }
    }

    public removeMarker(id: string): void {
        const marker = this.markers.get(id);
        if (marker && this.map) {
            this.map.removeLayer(marker);
            this.markers.delete(id);
        }
    }

    public setMarkerVisibility(id: string, visible: boolean): void {
        const marker = this.markers.get(id);
        if (marker) {
            marker.setOpacity(visible ? 1 : 0);
        }
    }

    public clearAllMarkers(): void {
        if (!this.map) return;

        this.markers.forEach((marker) => {
            this.map!.removeLayer(marker);
        });
        this.markers.clear();
    }

    public getMarkerPosition(id: string): [number, number] | null {
        const marker = this.markers.get(id);
        if (marker) {
            const latLng = marker.getLatLng();
            return [latLng.lat, latLng.lng];
        }
        return null;
    }

    private setupEventListeners(): void {
        eventBus.on(EventTypes.TABLE.CHECKBOX_MARKER, (data: any) => {
            console.log('MarkerService received checkbox event:', data);
            if (data?.id_module) {
                this.setMarkerVisibility(data.id_module, data.flag);
            }
        });
    }

    public destroy(): void {
        this.clearAllMarkers();
        this.map = null;
    }
}
