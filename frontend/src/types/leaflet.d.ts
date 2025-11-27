// Declarations for Leaflet library
declare module 'leaflet' {
    export function map(element: string | HTMLElement, options?: any): Map;

    export function tileLayer(url: string, options?: any): TileLayer;

    export function marker(latlng: [number, number] | any, options?: any): Marker;

    export function polyline(latlngs: any[], options?: any): Polyline;

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
    }

    export class TileLayer {
        addTo(map: Map): TileLayer;
    }

    export class Marker {
        setLatLng(latlng: [number, number] | any): Marker;
        setPopupContent(content: string): Marker;
        setIcon(icon: DivIcon): Marker;
        addTo(map: Map): Marker;
        bindPopup(content: string): Marker;
        setOpacity(opacity: number): void;
    }

    export class Polyline {
        setLatLngs(latlngs: any[]): Polyline;
        setStyle(style: any): Polyline;
        addTo(map: Map): Polyline;
    }

    export class DivIcon {
        // Marker icon class
    }

    export namespace Control {
        class Layers {
            addTo(map: Map): Layers;
        }
    }
}

// Global Leaflet variable
declare const L: typeof import('leaflet');
