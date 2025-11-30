import * as L from 'leaflet';
import { eventBus } from '../../../core/event-bus.js';
import { EventTypes } from '../../../core/constants.js';

export class TraceService {
    private traces: Map<string, L.Polyline> = new Map();
    private map: L.Map | null = null;
    private loadedTraces: Set<string> = new Set();
    private currentSessionId: number | null = null;

    constructor() {
        this.setupEventListeners();
    }

    public initialize(map: L.Map): void {
        this.map = map;
    }

    public addOrUpdateTrace(moduleId: string, points: [number, number][], color: string = '#ff4444'): void {
        if (!this.map) return;

        if (this.traces.has(moduleId)) {
            // Обновляем существующую трассу
            const trace = this.traces.get(moduleId)!;
            trace.setLatLngs(points);
        } else {
            // Создаем новую трассу
            const trace = L.polyline(points, {
                color: color,
                weight: 3,
                opacity: 0.7,
            });

            trace.addTo(this.map);
            this.traces.set(moduleId, trace);
        }
    }

    public setTraceVisibility(moduleId: string, visible: boolean): void {
        if (visible && !this.loadedTraces.has(moduleId)) {
            // Загружаем исторические данные если включили и их нет
            this.loadTraceData(moduleId);
        } else {
            // Меняем видимость существующего трека
            const trace = this.traces.get(moduleId);
            if (trace) {
                trace.setStyle({ opacity: visible ? 0.7 : 0 });
                console.log(`Trace ${moduleId} visibility: ${visible ? 'visible' : 'hidden'}`);
            }
        }
    }

    private async loadTraceData(moduleId: string): Promise<void> {
        if (!this.currentSessionId) {
            console.warn('No session ID for trace loading');
            return;
        }

        try {
            console.log(`Loading trace for module ${moduleId}, session ${this.currentSessionId}...`);

            const response = await fetch(
                `/api/modules/trace?id_module=${moduleId}&id_session=${this.currentSessionId}`,
                {
                    method: 'GET',
                    credentials: 'include',
                }
            );

            if (!response.ok) throw new Error(`Failed to load trace: ${response.status}`);

            const traceData = await response.json();
            console.log(`Trace data loaded for ${moduleId}:`, traceData);

            this.createTraceFromData(moduleId, traceData);
            this.loadedTraces.add(moduleId);
        } catch (error) {
            console.error(`Error loading trace for ${moduleId}:`, error);
        }
    }

    private createTraceFromData(moduleId: string, traceData: any): void {
        if (!this.map || !traceData.coords || traceData.coords.length === 0) {
            console.warn(`No trace coordinates for module ${moduleId}`, traceData);
            return;
        }

        const points: [number, number][] = traceData.coords.map(
            (coord: [number, number]) => [coord[0], coord[1]] // [lat, lon]
        );

        console.log(`Creating trace for ${moduleId} with ${points.length} points`);

        const trace = L.polyline(points, {
            color: traceData.module_color || '#000000',
            weight: 3,
            opacity: 0.7,
            smoothFactor: 1,
        });

        trace.addTo(this.map);
        this.traces.set(moduleId, trace);

        console.log(
            `Trace created for ${moduleId} (${traceData.module_name}) with ${points.length} points, color: ${traceData.module_color}`
        );
    }

    public removeTrace(moduleId: string): void {
        const trace = this.traces.get(moduleId);
        if (trace && this.map) {
            this.map.removeLayer(trace);
            this.traces.delete(moduleId);
        }
    }

    public clearAllTraces(): void {
        if (!this.map) return;

        this.traces.forEach((trace) => {
            this.map!.removeLayer(trace);
        });
        this.traces.clear();
        this.loadedTraces.clear();
    }

    private setupEventListeners(): void {
        eventBus.on(EventTypes.TABLE.CHECKBOX_TRACE, (data: any) => {
            console.log('TraceService received checkbox event:', data);
            if (data?.id_module) {
                this.setTraceVisibility(data.id_module, data.checked);
            }
        });

        eventBus.on(EventTypes.SESSION.SELECTED, (session: any) => {
            console.log('TraceService: Session changed');
            this.currentSessionId = session?.id || null;
        });

        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data: any) => {
            this.handleRealTimeData(data);
        });
    }

    private handleRealTimeData(data: any): void {
        if (!data?.points) return;

        data.points.forEach((moduleData: any) => {
            if (!moduleData.coords?.lat || !moduleData.coords?.lon) return;

            const position: [number, number] = [moduleData.coords.lat, moduleData.coords.lon];

            this.addPointToTrace(moduleData.id_module, position, moduleData.module_color);
        });
    }

    public addPointToTrace(moduleId: string, point: [number, number], color: string = '#000000'): void {
        const trace = this.traces.get(moduleId);

        if (trace) {
            // Получаем текущие точки из leaflet и добавляем новую
            const currentPoints = trace.getLatLngs() as any[];
            currentPoints.push(L.latLng(point[0], point[1]));
            trace.setLatLngs(currentPoints);
            console.log(`Added point to trace ${moduleId}`);
        }
    }

    public destroy(): void {
        this.clearAllTraces();
        this.map = null;
    }
}
