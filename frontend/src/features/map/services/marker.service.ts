import * as L from 'leaflet';
import { eventBus } from '../../../core/event-bus.js';
import { EventTypes } from '../../../core/constants.js';
import { MarkerConfig } from '../types/map.types.js';

export class MarkerService {
    private markers: Map<string, L.Marker> = new Map();
    private map: L.Map | null = null;
    private isLiveMode: boolean = true;

    constructor() {
        this.setupEventListeners();
    }

    public setLiveMode(live: boolean): void {
        this.isLiveMode = live;
        console.log(`MarkerService: Live mode ${live ? 'enabled' : 'disabled'}`);

        // При переключении в live-режим можно сбросить какие-то состояния если нужно
        if (live) {
            // Например, показать все маркеры
            this.markers.forEach((marker, id) => {
                marker.setOpacity(1);
            });
        }
    }

    public updateMarkerPosition(moduleId: string, position: [number, number]): void {
        const marker = this.markers.get(moduleId);
        if (marker) {
            marker.setLatLng(position);
        }
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
                this.setMarkerVisibility(data.id_module, data.checked);
            }
        });

        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data: any) => {
            this.handleRealTimeData(data);
        });
    }

    private handleRealTimeData(data: any): void {
        // В не-live режиме игнорируем новые данные
        if (!this.isLiveMode) {
            console.log(`MarkerService: Ignoring real-time data in playback mode`);
            return;
        }

        if (!data?.points) return;

        data.points.forEach((moduleData: any) => {
            if (!moduleData.coords?.lat || !moduleData.coords?.lon) return;

            const position: [number, number] = [moduleData.coords.lat, moduleData.coords.lon];

            if (this.has(moduleData.id_module)) {
                this.updateMarker(moduleData.id_module, { position });
            } else {
                this.addMarker({
                    id: moduleData.id_module,
                    position: position,
                    title: moduleData.module_name,
                    color: moduleData.module_color || '#007bff',
                });
            }
        });
    }

    public destroy(): void {
        this.clearAllMarkers();
        this.map = null;
    }
}
