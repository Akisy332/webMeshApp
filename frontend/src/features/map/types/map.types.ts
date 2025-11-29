export interface MapConfig {
    containerId: string;
    center: [number, number];
    zoom: number;
    minZoom?: number;
    maxZoom?: number;
}

export interface MarkerConfig {
    id: string;
    position: [number, number];
    title?: string;
    color?: string;
    opacity?: number;
}

export interface TraceConfig {
    id: string;
    points: [number, number][];
    color?: string;
    weight?: number;
    opacity?: number;
}

export interface LayerConfig {
    id: string;
    name: string;
    url: string;
    attribution: string;
    default?: boolean;
}

export interface MapEventData {
    type: 'marker_click' | 'map_click' | 'zoom_changed';
    data: any;
}
