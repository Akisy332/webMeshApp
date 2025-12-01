import * as L from 'leaflet';
import { eventBus } from '../../../core/event-bus.js';
import { EventTypes } from '../../../core/constants.js';

import { MarkerService } from './marker.service.js';

export class TraceService {
    private traces: Map<string, L.Polyline> = new Map();
    private map: L.Map | null = null;
    private loadedTraces: Set<string> = new Set();
    private currentSessionId: number | null = null;
    private isLiveMode: boolean = true;
    private traceHistory: Map<string, any[]> = new Map();
    private markerService: MarkerService | null = null;
    private timeRanges: Map<string, { min: number; max: number }> = new Map();

    constructor() {
        this.setupEventListeners();
    }

    public initialize(map: L.Map): void {
        this.map = map;
    }

    public setLiveMode(live: boolean): void {
        this.isLiveMode = live;
        console.log(`TraceService: Live mode ${live ? 'enabled' : 'disabled'}`);

        if (live) {
            this.showFullTraces();
        }
    }

    public setMarkerService(markerService: MarkerService): void {
        this.markerService = markerService;
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
            this.loadTraceData(moduleId);
        } else {
            const trace = this.traces.get(moduleId);
            if (trace) {
                trace.setStyle({ opacity: visible ? 0.7 : 0 });
            }

            if (!visible && this.timeRanges.has(moduleId)) {
                eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, {
                    moduleId: moduleId,
                    checked: false,
                });
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

        const points: [number, number][] = traceData.coords.map((coord: [number, number]) => [coord[0], coord[1]]);

        console.log(`Creating trace for ${moduleId} with ${points.length} points`);

        const trace = L.polyline(points, {
            color: traceData.module_color || '#000000',
            weight: 3,
            opacity: 0.7,
            smoothFactor: 1,
        });

        trace.addTo(this.map);
        this.traces.set(moduleId, trace);
        this.loadedTraces.add(moduleId);

        this.addTraceDataToHistory(moduleId, traceData);

        this.calculateAndEmitTimeRange(moduleId, traceData);
        console.log(`Trace created for ${moduleId} (${traceData.module_name}) with ${points.length} points`);
    }

    private addTraceDataToHistory(moduleId: string, traceData: any): void {
        if (!traceData.coords || !traceData.timestamps || traceData.coords.length !== traceData.timestamps.length) {
            console.warn(`Invalid trace data structure for module ${moduleId}`);
            return;
        }

        this.traceHistory.set(moduleId, []);

        for (let i = 0; i < traceData.coords.length; i++) {
            const position: [number, number] = [traceData.coords[i][0], traceData.coords[i][1]];
            const timestamp = traceData.timestamps[i];

            this.traceHistory.get(moduleId)!.push({
                position: position,
                timestamp: timestamp,
            });
        }

        console.log(`Added ${traceData.coords.length} historical points to traceHistory for ${moduleId}`);
    }

    private calculateAndEmitTimeRange(moduleId: string, traceData: any): void {
        if (!traceData.timestamps || traceData.timestamps.length === 0) {
            console.warn(`No timestamps for module ${moduleId}`);
            return;
        }

        const timestamps = traceData.timestamps;
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);

        this.timeRanges.set(moduleId, { min: minTime, max: maxTime });

        eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, {
            moduleId: moduleId,
            min: minTime,
            max: maxTime,
            checked: true,
        });

        console.log(`Time range for ${moduleId}: ${minTime} - ${maxTime}`);
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

        eventBus.on(EventTypes.MAP.TIME_SLIDER_TOGGLE, (data: any) => {
            this.setLiveMode(!data.enabled);
        });

        eventBus.on(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, (time: number) => {
            this.handleTimeSliderChange(time);
        });
    }

    private handleTimeSliderChange(time: number): void {
        if (this.isLiveMode) return; // Игнорируем в live-режиме

        console.log(`TraceService: Time slider changed to ${time}`);
        this.updateAllTracesToTime(time);
    }

    private updateAllTracesToTime(time: number): void {
        this.traceHistory.forEach((history, moduleId) => {
            this.updateTraceToTime(moduleId, time);
        });
    }

    private updateTraceToTime(moduleId: string, time: number): void {
        const history = this.traceHistory.get(moduleId);
        if (!history || history.length === 0) return;
        console.log('test');
        // Находим все точки до указанного времени
        const pointsUpToTime = history.filter((point) => point.timestamp <= time).map((point) => point.position);

        if (pointsUpToTime.length > 1) {
            // Обновляем трек только точками до выбранного времени
            this.updateTracePoints(moduleId, pointsUpToTime);
        } else if (pointsUpToTime.length === 1) {
            // Если только одна точка - скрываем трек (или показываем маркер)
            this.hideTrace(moduleId);
        } else {
            // Нет точек до этого времени - скрываем
            this.hideTrace(moduleId);
        }

        // Обновляем позицию маркера
        this.updateMarkerPosition(moduleId, time);
    }

    private updateTracePoints(moduleId: string, points: [number, number][]): void {
        const trace = this.traces.get(moduleId);
        if (trace) {
            trace.setLatLngs(points);
            trace.setStyle({ opacity: 0.7 }); // Показываем трек
        }
    }

    private hideTrace(moduleId: string): void {
        const trace = this.traces.get(moduleId);
        if (trace) {
            trace.setStyle({ opacity: 0 }); // Скрываем трек
        }
    }

    private updateMarkerPosition(moduleId: string, time: number): void {
        const history = this.traceHistory.get(moduleId);
        if (!history || !this.markerService) return;

        // Находим последнюю точку до указанного времени
        const pointsBeforeTime = history.filter((point) => point.timestamp <= time);
        if (pointsBeforeTime.length === 0) return;

        const lastPoint = pointsBeforeTime[pointsBeforeTime.length - 1];
        this.markerService.updateMarkerPosition(moduleId, lastPoint.position);
    }

    private showFullTraces(): void {
        // В live-режиме показываем полные треки
        this.traceHistory.forEach((history, moduleId) => {
            const points = history.map((point) => point.position);
            if (points.length > 1) {
                this.updateTracePoints(moduleId, points);
            }
        });
    }

    private handleRealTimeData(data: any): void {
        if (!data?.points) return;

        data.points.forEach((moduleData: any) => {
            if (!moduleData.coords?.lat || !moduleData.coords?.lon) return;

            const position: [number, number] = [moduleData.coords.lat, moduleData.coords.lon];
            const timestamp = moduleData.datetime_unix;

            if (this.loadedTraces.has(moduleData.id_module)) {
                this.addToHistory(moduleData.id_module, position, timestamp);

                // В live-режиме обновляем видимый трек
                if (this.isLiveMode) {
                    this.addPointToTrace(moduleData.id_module, position, moduleData.module_color);
                }
            }
        });
    }

    public addToHistory(moduleId: string, position: [number, number], timestamp: number): void {
        if (!this.traceHistory.has(moduleId)) {
            this.traceHistory.set(moduleId, []);
        }

        this.traceHistory.get(moduleId)!.push({
            position: position,
            timestamp: timestamp,
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
