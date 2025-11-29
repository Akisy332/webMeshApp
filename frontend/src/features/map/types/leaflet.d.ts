// features/map/types/leaflet.d.ts
declare module 'leaflet' {
    export function map(element: string | HTMLElement, options?: any): Map;

    export function tileLayer(url: string, options?: any): TileLayer;

    export function marker(latlng: [number, number] | any, options?: any): Marker;

    export function polyline(latlngs: any[], options?: any): Polyline;

    export function latLng(lat: number, lng: number): LatLng;

    export namespace control {
        function layers(baseLayers?: any, overlays?: any, options?: any): Control.Layers;
    }

    export function divIcon(options: any): DivIcon;

    export class Map {
        setView(center: [number, number], zoom: number): Map;
        addLayer(layer: any): Map;
        removeLayer(layer: any): Map;
        hasLayer(layer: any): boolean;
        remove(): void;
        setMinZoom(zoom: number): Map;
        setMaxZoom(zoom: number): Map;
        getCenter(): { lat: number; lng: number };
        getZoom(): number;
        on(event: string, handler: Function): Map;
    }

    export class TileLayer {
        addTo(map: Map): TileLayer;
    }

    export class Marker {
        setLatLng(latlng: [number, number] | any): Marker;
        getLatLng(): { lat: number; lng: number };
        setPopupContent(content: string): Marker;
        setIcon(icon: DivIcon): Marker;
        addTo(map: Map): Marker;
        bindPopup(content: string): Marker;
        setOpacity(opacity: number): void;
        on(event: string, handler: Function): Marker;
    }

    export class Polyline {
        setLatLngs(latlngs: any[]): Polyline;
        getLatLngs(): any[];
        setStyle(style: any): Polyline;
        addTo(map: Map): Polyline;
        setOpacity(opacity: number): void;
    }

    export class DivIcon {
        // Marker icon class
    }

    export class LatLng {
        lat: number;
        lng: number;
        constructor(lat: number, lng: number);
    }

    export namespace Control {
        class Layers {
            addTo(map: Map): Layers;
        }
    }
}

// Global Leaflet variable
declare const L: typeof import('leaflet');
