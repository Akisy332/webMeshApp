// Универсальный менеджер настроек с сохранением между перезагрузками
type SettingsCategory = 'ui' | 'map' | 'table' | 'user';

export interface SettingsSchema {
    table: {
        checkboxStates: Record<string, Record<string, { marker: boolean; trace: boolean }>>; // ИЗМЕНЕНО
        sortField: string;
        sortDirection: 'asc' | 'desc';
    };
    map: {
        zoomLevel: number;
        center: { lat: number; lon: number };
        activeBaseLayer: string;
        showDebugPanel: boolean;
    };
    ui: {
        theme: 'light' | 'dark';
        language: string;
        debugPanelVisible: boolean;
    };
}

export class SettingsManager {
    private settings: Partial<SettingsSchema> = {};
    private readonly STORAGE_KEY = 'app-settings';

    constructor() {
        this.loadFromStorage();
    }

    // УНИВЕРСАЛЬНЫЙ МЕТОД ДЛЯ ЛЮБЫХ НАСТРОЕК
    set<T extends keyof SettingsSchema>(
        category: T,
        key: keyof SettingsSchema[T],
        value: SettingsSchema[T][keyof SettingsSchema[T]]
    ): void {
        if (!this.settings[category]) {
            this.settings[category] = {} as SettingsSchema[T];
        }

        (this.settings[category] as any)[key] = value;
        this.saveToStorage();
    }

    // УНИВЕРСАЛЬНЫЙ МЕТОД ДЛЯ ПОЛУЧЕНИЯ НАСТРОЕК
    get<T extends keyof SettingsSchema>(
        category: T,
        key: keyof SettingsSchema[T],
        defaultValue?: SettingsSchema[T][keyof SettingsSchema[T]]
    ): SettingsSchema[T][keyof SettingsSchema[T]] | undefined {
        const value = (this.settings[category] as any)?.[key] ?? defaultValue;
        return value;
    }

    setCheckboxState(sessionId: number, moduleId: string, type: 'marker' | 'trace', checked: boolean): void {
        const currentStates = this.get('table', 'checkboxStates', {}) as Record<
            string,
            Record<string, { marker: boolean; trace: boolean }>
        >;

        if (!currentStates[sessionId]) {
            currentStates[sessionId] = {};
        }

        if (!currentStates[sessionId][moduleId]) {
            currentStates[sessionId][moduleId] = { marker: true, trace: false };
        }

        currentStates[sessionId][moduleId][type] = checked;
        this.set('table', 'checkboxStates', currentStates);
    }

    getAllCheckboxStates(sessionId: number): Record<string, { marker: boolean; trace: boolean }> {
        const allStates = this.get('table', 'checkboxStates', {}) as Record<
            string,
            Record<string, { marker: boolean; trace: boolean }>
        >;
        return allStates[sessionId] || {};
    }

    getCheckboxState(sessionId: number, moduleId: string): { marker: boolean; trace: boolean } {
        const allStates = this.getAllCheckboxStates(sessionId);
        return allStates[moduleId] || { marker: true, trace: false };
    }

    // СПЕЦИАЛИЗИРОВАННЫЕ МЕТОДЫ ДЛЯ СОРТИРОВКИ
    setSortSettings(field: string, direction: 'asc' | 'desc'): void {
        this.set('table', 'sortField', field);
        this.set('table', 'sortDirection', direction);
    }

    getSortSettings(): { field: string; direction: 'asc' | 'desc' } {
        return {
            field: this.get('table', 'sortField', 'datetime_unix') as string,
            direction: this.get('table', 'sortDirection', 'desc') as 'asc' | 'desc',
        };
    }

    private saveToStorage(): void {
        try {
            const data = JSON.stringify(this.settings);
            localStorage.setItem(this.STORAGE_KEY, data);
            console.log('💾 SettingsManager: Saved to localStorage');
        } catch (e) {
            console.warn('❌ SettingsManager: Failed to save to storage:', e);
        }
    }

    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                this.settings = JSON.parse(stored);
                console.log('📁 SettingsManager: Loaded from storage:', this.settings);
            } else {
                console.log('📁 SettingsManager: No stored settings found, using defaults');
            }
        } catch (e) {
            console.warn('❌ SettingsManager: Failed to load from storage:', e);
        }
    }

    // СПЕЦИАЛИЗИРОВАННЫЕ МЕТОДЫ ДЛЯ КАРТЫ
    setMapSettings(zoom: number, center: { lat: number; lon: number }, baseLayer: string): void {
        this.set('map', 'zoomLevel', zoom);
        this.set('map', 'center', center);
        this.set('map', 'activeBaseLayer', baseLayer);
    }

    getMapSettings(): { zoom: number; center: { lat: number; lon: number }; baseLayer: string } {
        return {
            zoom: this.get('map', 'zoomLevel', 13) as number,
            center: this.get('map', 'center', { lat: 56.452, lon: 84.9615 }) as { lat: number; lon: number },
            baseLayer: this.get('map', 'activeBaseLayer', 'osm') as string,
        };
    }

    setMapBaseLayer(layer: string): void {
        this.set('map', 'activeBaseLayer', layer);
    }

    getMapBaseLayer(): string {
        return this.get('map', 'activeBaseLayer', 'osm') as string;
    }

    // СБРОС НАСТРОЕК (ДЛЯ ОТЛАДКИ)
    reset(): void {
        this.settings = {};
        localStorage.removeItem(this.STORAGE_KEY);
    }
}

export const settingsManager = new SettingsManager();
