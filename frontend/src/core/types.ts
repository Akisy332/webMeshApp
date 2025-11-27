export interface ISettingsManager {
    // Только нужные методы для таблицы
    getCheckboxState(sessionId: number, moduleId: string): { marker: boolean; trace: boolean };
    setCheckboxState(sessionId: number, moduleId: string, type: 'marker' | 'trace', checked: boolean): void;
    getAllCheckboxStates(sessionId: number): Record<string, { marker: boolean; trace: boolean }>;
    getSortSettings(): { field: string; direction: 'asc' | 'desc' };
    setSortSettings(field: string, direction: 'asc' | 'desc'): void;
}
