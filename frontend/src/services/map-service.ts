import { eventBus } from '../core/event-bus.js';
import { EventTypes } from '../core/constants.js';
import type { ModuleData, Session } from '../types/index.js';

// Интерфейс для координат
interface Coordinates {
    lat: number;
    lon: number;
    alt?: number;
}

// Интерфейс для точки пути
interface PathPoint {
    latlng: [number, number] | { lat: number; lng: number };
    timestamp: number;
}

// Интерфейс для сегментированного пути
interface SegmentedPathInfo {
    timeRange: {
        min: number;
        max: number;
    };
    visible: boolean;
    segmentCount: number;
    pointCount: number;
}

// Declare Leaflet types we use
interface LeafletMap {
    setView(center: [number, number], zoom: number): LeafletMap;
    addLayer(layer: any): LeafletMap;
    removeLayer(layer: any): LeafletMap;
    hasLayer(layer: any): boolean;
    remove(): void;
}

interface LeafletTileLayer {
    addTo(map: LeafletMap): LeafletTileLayer;
}

interface LeafletMarker {
    setLatLng(latlng: [number, number] | any): LeafletMarker;
    setPopupContent(content: string): LeafletMarker;
    setIcon(icon: any): LeafletMarker;
    addTo(map: LeafletMap): LeafletMarker;
    bindPopup(content: string): LeafletMarker;
    setOpacity(opacity: number): void;
}

interface LeafletPolyline {
    setLatLngs(latlngs: any[]): LeafletPolyline;
    setStyle(style: any): LeafletPolyline;
    addTo(map: LeafletMap): LeafletPolyline;
}

interface LeafletControl {
    layers(baseLayers?: any, overlays?: any, options?: any): any;
}

interface LeafletDivIcon {
    // Marker icon
}

class SegmentedPath {
    private map: LeafletMap;
    private color: string;
    private maxPointsPerSegment: number;
    public isLiveMode: boolean;
    private markerVisible: boolean;
    public traceVisible: boolean;
    private allPoints: PathPoint[];
    private visiblePoints: PathPoint[];
    private segments: PathPoint[][];
    private segmentPaths: LeafletPolyline[];
    private marker: LeafletMarker | null;
    private visible: boolean;
    private options: any;
    private lastSegmentIndex: number;
    private lastPointIndex: number;
    private maxSegmentLength: number;

    constructor(map: LeafletMap, color: string, maxPointsPerSegment: number = 10000) {
        this.map = map;
        this.color = color;
        this.maxPointsPerSegment = maxPointsPerSegment;
        this.isLiveMode = true;
        this.markerVisible = true;
        this.traceVisible = true;
        this.allPoints = [];
        this.visiblePoints = [];
        this.segments = [];
        this.segmentPaths = [];
        this.marker = null;
        this.visible = true;
        this.options = {
            color: color,
            weight: 3,
            opacity: 1
        };
        this.lastSegmentIndex = 0;
        this.lastPointIndex = 0;
        this.maxSegmentLength = 0;

        this.init();
    }

    private init(): void {
        this.createPaths();
        this.createMarker();
    }

    private segmentPath(): void {
        this.segments = [];
        if (this.allPoints.length === 0) return;

        if (this.allPoints.length <= this.maxPointsPerSegment) {
            this.segments.push(this.allPoints);
            this.maxSegmentLength = this.allPoints.length;
            return;
        }

        for (let i = 0; i < this.allPoints.length; i += this.maxPointsPerSegment - 1) {
            const endIndex = Math.min(i + this.maxPointsPerSegment, this.allPoints.length);
            const segment = this.allPoints.slice(i, endIndex);
            this.segments.push(segment);

            if (segment.length > this.maxSegmentLength) {
                this.maxSegmentLength = segment.length;
            }

            if (endIndex >= this.allPoints.length) break;
        }
    }

    private createPaths(): void {
        this.segmentPaths.forEach(path => this.map.removeLayer(path));
        this.segmentPaths = [];

        for (let i = 0; i < this.segments.length; i++) {
            const path = (window as any).L.polyline([], {
                color: this.color,
                weight: 3,
                opacity: 1
            });

            if (this.visible) {
                path.addTo(this.map);
            }

            this.segmentPaths.push(path);
        }
    }

    private createMarker(): void {
        if (this.marker) {
            this.map.removeLayer(this.marker);
        }

        this.marker = (window as any).L.marker([0, 0], {
            icon: (window as any).L.divIcon({
                className: 'custom-marker',
                html: `<svg width="48" height="48" viewBox="0 0 24 24">
                    <path fill="${this.color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>`,
                iconSize: [48, 48],
                iconAnchor: [24, 48],
                popupAnchor: [0, -48]
            }),
            opacity: this.visible ? 1 : 0
        }).addTo(this.map);
    }

    public update(currentTime: number): void {
        if (this.allPoints.length === 0) {
            return;
        }

        let newIndex = -1;
        let left = 0;
        let right = this.allPoints.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);

            if (this.allPoints[mid].timestamp <= currentTime) {
                newIndex = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        this.visiblePoints = newIndex >= 0 ? this.allPoints.slice(0, newIndex + 1) : [];
        this.updateSegmentsDisplay();
    }

    public setStyle(style: any): this {
        this.options = { ...this.options, ...style };

        // Применяем стиль ко всем сегментам
        for (let segIdx = 0; segIdx < this.segmentPaths.length; segIdx++) {
            this.segmentPaths[segIdx].setStyle(this.options);
        }

        return this;
    }

    public updateSegmentsDisplay(): void {
        let pointsProcessed = 0;
        const pointsToShow = this.isLiveMode ? this.allPoints : this.visiblePoints;
        const shouldShowTrace = this.traceVisible && this.markerVisible && this.visible;

        for (let segIdx = 0; segIdx < this.segments.length; segIdx++) {
            const segment = this.segments[segIdx];
            const segmentEndIndex = pointsProcessed + segment.length - 1;

            if (segmentEndIndex < pointsToShow.length) {
                this.segmentPaths[segIdx].setLatLngs(segment.map((p: PathPoint) => p.latlng));
                this.segmentPaths[segIdx].setStyle({
                    opacity: shouldShowTrace ? 1 : 0,
                    weight: shouldShowTrace ? 3 : 0
                });
            } else if (pointsProcessed < pointsToShow.length) {
                const visibleInSegment = pointsToShow.slice(pointsProcessed, pointsToShow.length);
                this.segmentPaths[segIdx].setLatLngs(visibleInSegment.map((p: PathPoint) => p.latlng));
                this.segmentPaths[segIdx].setStyle({
                    opacity: shouldShowTrace ? 1 : 0,
                    weight: shouldShowTrace ? 3 : 0
                });
                break;
            } else {
                this.segmentPaths[segIdx].setStyle({
                    opacity: 0,
                    weight: 0
                });
            }

            pointsProcessed += segment.length;
        }

        const shouldShowMarker = this.markerVisible && this.visible;
        if (pointsToShow.length > 0 && this.marker) {
            const lastPoint = pointsToShow[pointsToShow.length - 1];
            this.marker.setLatLng(lastPoint.latlng);
            this.marker.setOpacity(shouldShowMarker ? 1 : 0);
        } else if (this.marker) {
            this.marker.setOpacity(0);
        }
    }

    public setMarkerVisible(visible: boolean): void {
        this.markerVisible = visible;
        this.updateSegmentsDisplay();
    }

    public setTraceVisible(visible: boolean): void {
        this.traceVisible = visible;
        this.updateSegmentsDisplay();
    }

    public addLatLng(latlng: [number, number] | { lat: number; lng: number }, timestamp: number | null = null, currentTime: number | null = null): this {
        const newPoint: PathPoint = {
            latlng: latlng,
            timestamp: timestamp || 0
        };

        this.allPoints.push(newPoint);

        if (this.segments.length === 0 || this.segments[this.segments.length - 1].length >= this.maxPointsPerSegment) {
            this.segmentPath();
            this.createPaths();
        } else {
            this.segments[this.segments.length - 1].push(newPoint);
        }

        if (this.isLiveMode) {
            this.visiblePoints.push(newPoint);
            this.updateSegmentsDisplay();
        } else if (currentTime !== null) {
            if (newPoint.timestamp <= currentTime) {
                this.visiblePoints.push(newPoint);
                this.updateSegmentsDisplay();
            }
        }

        return this;
    }

    public setLatLngs(latLngs: any[], timestamps: number[] | null = null, currentTime: number | null = null): this {
        this.allPoints = [];

        for (let i = 0; i < latLngs.length; i++) {
            const timestamp = timestamps && i < timestamps.length ? timestamps[i] : 0;
            if (latLngs[i].length === 2) {
                this.allPoints.push({
                    latlng: Array.isArray(latLngs[i]) ? latLngs[i] : [latLngs[i].lat, latLngs[i].lng],
                    timestamp: timestamp
                });
            }
        }

        this.segmentPath();
        this.createPaths();

        if (this.isLiveMode) {
            this.visiblePoints = [...this.allPoints];
            this.updateSegmentsDisplay();
        } else if (currentTime !== null) {
            this.update(currentTime);
        }

        return this;
    }

    public clearLayers(): this {
        this.allPoints = [];
        this.visiblePoints = [];
        this.segmentPath();
        this.createPaths();
        if (this.marker) {
            this.marker.setOpacity(0);
        }
        return this;
    }

    public getInfo(): SegmentedPathInfo {
        if (this.allPoints.length === 0) {
            return {
                timeRange: { min: 0, max: 0 },
                visible: this.visible,
                segmentCount: 0,
                pointCount: 0
            };
        }

        return {
            timeRange: {
                min: this.allPoints[0].timestamp,
                max: this.allPoints[this.allPoints.length - 1].timestamp
            },
            visible: this.visible,
            segmentCount: this.segments.length,
            pointCount: this.allPoints.length
        };
    }

    public remove(): this {
        this.segmentPaths.forEach(path => this.map.removeLayer(path));
        if (this.marker) {
            this.map.removeLayer(this.marker);
        }
        return this;
    }
}

export class MapService {
    private map: any;
    private osmLayer: any;
    private GoogleSatteliteLayer: any;
    private baseLayers: any;
    private layers: Record<string, any>;
    private markers: Map<string, any>;
    private paths: Map<string, SegmentedPath>;
    private currentSession: Session | null;
    private isLiveMode: boolean;

    constructor(private mapId: string) {
        this.layers = {};
        this.markers = new Map();
        this.paths = new Map();
        this.currentSession = null;
        this.isLiveMode = true;

        this.init();
    }

    private init(): void {
        console.log('MapService initializing...');

        if (!eventBus) {
            console.error('EventBus not initialized');
            return;
        }

        this.initializeMap();
        this.setupEventListeners();
        
        console.log('MapService initialized');
    }

    private initializeMap(): void {
        const map_config = {
            lat: 56.4520,
            lon: 84.9615,
            zoom: 13
        };

        this.map = (L as any).map(this.mapId).setView(
            [map_config.lat, map_config.lon],
            map_config.zoom
        );

        this.osmLayer = (L as any).tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        this.GoogleSatteliteLayer = (L as any).tileLayer('https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}&s=Ga', {
            attribution: '© GoogleSattelite',
            maxZoom: 19
        });

        this.baseLayers = {
            "OpenStreetMap": this.osmLayer,
            "GoogleSattelite": this.GoogleSatteliteLayer
        };
        (L as any).control.layers(this.baseLayers).addTo(this.map);
    }

    private setupEventListeners(): void {
        eventBus.on(EventTypes.TABLE.CHECKBOX_MARKER, (data: any) => {
            this.setMarkerVisible(data.id_module, data.flag);
        });

        eventBus.on(EventTypes.TABLE.CHECKBOX_TRACE, (data: any) => {
            this.setTraceVisible(data.id_module, data.flag);
        });

        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data: any) => {
            if (!data?.points) return;

            for (const [moduleId, moduleData] of Object.entries(data.points)) {
                const module = moduleData as ModuleData;
                if (!module?.coords?.lat || !module?.coords?.lon) {
                    console.warn(`Invalid coordinates for module ${moduleId}`);
                    continue;
                }

                if (module?.id_session === this.currentSession?.id) {
                    const path = this.paths.get(module.id_module);
                    if (path) {
                        this.updateTrace(module);
                    } else {
                        this.addOrUpdateMarker(module);
                    }
                }
            }
        });

        eventBus.on(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, (currentUnixTime: number) => {
            this.paths.forEach((path) => {
                if (path.getInfo().visible) path.update(currentUnixTime);
            });
        });

        eventBus.on(EventTypes.ROUTE_SLIDER.TIME_SLIDER_TOGGLE, (checked: boolean) => {
            this.isLiveMode = !checked;
            this.paths.forEach((path) => {
                path.isLiveMode = !checked;
                path.updateSegmentsDisplay();
            });
        });

        eventBus.on(EventTypes.SESSION.LOAD_DATA, (sessionData: any) => {
            console.log("MapService: Event LOAD_DATA", sessionData.map);
            this.setPosition(sessionData.map);

            sessionData.modules.forEach((data: ModuleData) => {
                this.addOrUpdateMarker(data);
            });
        });

        eventBus.on(EventTypes.SESSION.SELECTED, (session: Session) => {
            if (this.currentSession && this.currentSession.id !== session.id) {
                this.clearMap();
            }
            this.currentSession = session;
        });
    }

    public addOrUpdateMarker(data: ModuleData): void {
        if (!data || !data.id_module) return;

        if (this.paths.get(data.id_module)) {
            return;
        }

        let marker = this.markers.get(data.id_module);
        if (data.coords && data.coords.lat != null && data.coords.lon != null) {
            const latlng: [number, number] = [data.coords.lat, data.coords.lon];

            if (marker) {
                marker.setLatLng(latlng);
                marker.setPopupContent(data.module_name || data.id_module);
                marker.setIcon(this.createCustomIcon(data.module_color || '#FF0000'));
            } else {
                console.log("MapService: Create marker", data.id_module);
                marker = (L as any).marker(latlng, {
                    icon: this.createCustomIcon(data.module_color || '#FF0000')
                }).bindPopup(data.module_name || data.id_module);

                marker.addTo(this.map);
                this.markers.set(data.id_module, marker);
            }
        }
    }

    public setPosition(data: any): void {
        this.map.setView([data.lat, data.lon], data.zoom);
    }

    private removeMainMarker(id_module: string): void {
        const mainMarker = this.markers.get(id_module);
        if (mainMarker) {
            this.map.removeLayer(mainMarker);
            this.markers.delete(id_module);
        }
    }

    public setMarkerVisible(id_module: string, flag: boolean): void {
        const path = this.paths.get(id_module);
        if (path) {
            path.setMarkerVisible(flag);
        } else {
            const mainMarker = this.markers.get(id_module);
            if (mainMarker) {
                if (flag && !this.map.hasLayer(mainMarker)) {
                    mainMarker.addTo(this.map);
                } else if (!flag && this.map.hasLayer(mainMarker)) {
                    this.map.removeLayer(mainMarker);
                }
            }
        }
    }

    public clearMap(): void {
        this.markers.forEach((marker, id_module) => {
            this.map.removeLayer(marker);
        });
        this.markers.clear();

        this.paths.forEach((path, id_module) => {
            path.remove();
        });
        this.paths.clear();

        console.log("MapService: Map cleared");
    }

    public async setTraceVisible(id_module: string, flag: boolean): Promise<void> {
        let path = this.paths.get(id_module);

        if (!path && flag) {
            await this.loadAndCreateTrace(id_module);
            path = this.paths.get(id_module);
        } else if (path) {
            path.setTraceVisible(flag);
        }

        await this.setTimeRange();
    }

    private async loadAndCreateTrace(id_module: string): Promise<void> {
        try {
            const response = await this.getTraceModule(id_module, this.currentSession!.id, 0);
            this.createOrUpdateTrace(response);
        } catch (error) {
            console.error('MapService: Error when uploading a track:', error);
        }
    }

    private createCustomIcon(color: string): any {
        return (L as any).divIcon({
            className: 'custom-marker',
            html: `<svg width="48" height="48" viewBox="0 0 24 24">
                <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>`,
            iconSize: [48, 48],
            iconAnchor: [24, 48],
            popupAnchor: [0, -48]
        });
    }

    private createOrUpdateTrace(data: any): void {
        if (!data || !data.id_module || !data.coords) return;

        let path = this.paths.get(data.id_module);

        const coords = Array.isArray(data.coords[0]) &&
            (typeof data.coords[0][0] === 'number' || Array.isArray(data.coords[0][0]))
            ? data.coords
            : [data.coords];

        if (!path) {
            console.log("MapService: Create Trace for marker", data.id_module);
            path = new SegmentedPath(this.map, data.module_color || '#FF0000');
            path.isLiveMode = this.isLiveMode;
            path.setLatLngs(coords, data.timestamps);

            this.removeMainMarker(data.id_module);
            this.paths.set(data.id_module, path);
        } else {
            path.setLatLngs(coords, data.timestamps);
            path.setStyle({
                color: data.module_color || '#FF0000'
            });
        }
    }

    private async setTimeRange(): Promise<void> {
        let min = 9999999999;
        let max = 0;
        let hasVisiblePaths = false;

        this.paths.forEach((path) => {
            const dataPath = path.getInfo();
            if (dataPath.visible && path.traceVisible && dataPath.timeRange.min && dataPath.timeRange.max) {
                if (dataPath.timeRange.min < min) min = dataPath.timeRange.min;
                if (dataPath.timeRange.max > max) max = dataPath.timeRange.max;
                hasVisiblePaths = true;
            }
        });

        if (!hasVisiblePaths) {
            min = 0;
            max = 0;
        } else if (min === 9999999999) {
            min = 0;
        }

        eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, { min, max });
    }

    private updateTrace(data: ModuleData): void {
        if (!data || !data.id_module || !data.coords) return;

        const path = this.paths.get(data.id_module);
        if (!path) return;

        const coords: [number, number] = [data.coords.lat, data.coords.lon];
        const timestamp = data.datetime_unix || Date.now() / 1000;

        path.addLatLng(coords, timestamp);

        if (path.traceVisible) {
            this.setTimeRange();
        }
    }

    private async getTraceModule(id_Module: string, id_Session: number, id_Message_Type: number): Promise<any> {
        try {
            const url = `/api/modules/trace?id_module=${id_Module}&id_session=${id_Session}&id_message_type=${id_Message_Type}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            console.debug('MapService: Received track data', data);
            return data;
        } catch (error) {
            console.warn('MapService: Error when requesting track', error);
            throw error;
        }
    }

    public destroy(): void {
        this.clearMap();
        if (this.map) {
            this.map.remove();
        }
    }
}