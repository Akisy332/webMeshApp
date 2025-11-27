// session-data-table/session-data-table-component.ts
import { BaseTableComponent } from '../base-table/base-table-component';
import { TableConfig, TableColumn } from '../base-table/base-table-types';
import { ModuleData } from '../../types/index.js';
import { eventBus } from '../../core/event-bus.js';
import { EventTypes } from '../../core/constants.js';
import { ISettingsManager } from '../../core/types.js';

export class SessionDataTableComponent extends BaseTableComponent<ModuleData> {
    private settingsManager: ISettingsManager;

    private currentSessionId: number | null = null;
    private timeUpdateInterval: number | null = null;

    constructor(containerId: string, settingsManager: ISettingsManager) {
        const config: TableConfig = {
            columns: SessionDataTableComponent.getTableColumns(),
            features: {
                infiniteScroll: false, // Пока отключим, добавим позже
                rowSelection: false,
                sorting: true,
                filtering: false,
            },
            styles: {
                striped: true,
                hover: true,
                compact: false,
                bordered: false,
                height: '100%',
            },
            classes: {
                table: 'session-data-table',
                header: 'session-data-header',
                body: 'session-data-body',
                row: 'session-data-row',
                cell: 'session-data-cell',
            },
        };

        super(containerId, config);
        this.settingsManager = settingsManager;

        this.setupTimeUpdates();
        this.setupEventListeners();
        this.restoreTableState();
    }

    private restoreTableState(): void {
        // Восстанавливаем только при наличии текущей сессии
        if (this.currentSessionId) {
            console.log('Restore checkboxes and sort');
            // 1. Восстановление чекбоксов
            const checkboxStates = this.settingsManager.getAllCheckboxStates(this.currentSessionId);
            this.applyCheckboxStates(checkboxStates);

            // 2. Восстановление сортировки
            const sortSettings = this.settingsManager.getSortSettings();
            if (sortSettings.field) {
                this.setSort(sortSettings.field, sortSettings.direction);
            }
        }
    }

    private static getTableColumns(): TableColumn[] {
        return [
            {
                key: 'status',
                label: 'Статус',
                sortable: false,
                width: '60px',
                cellRenderer: (value, rowData) => this.renderStatusCell(rowData),
            },
            {
                key: 'visible_marker',
                label: 'Маркер',
                sortable: false,
                width: '80px',
                cellRenderer: (value, rowData) => this.renderCheckboxCell('marker', rowData),
            },
            {
                key: 'visible_trace',
                label: 'Трасса',
                sortable: false,
                width: '80px',
                cellRenderer: (value, rowData) => this.renderCheckboxCell('trace', rowData),
            },
            {
                key: 'module_name',
                label: 'Модуль',
                sortable: true,
                width: '150px',
                cellRenderer: (value, rowData) => this.renderModuleNameCell(rowData),
            },
            {
                key: 'coords.alt',
                label: 'Высота',
                sortable: true,
                width: '100px',
                cellRenderer: (value, rowData) => this.renderAltitudeCell(rowData),
            },
            {
                key: 'datetime_unix',
                label: 'Время',
                sortable: true,
                width: '100px',
                cellRenderer: (value, rowData) => this.renderTimeCell(rowData),
            },
        ];
    }

    protected bindEvents(): void {
        super.bindEvents(); // 🔹 ВАЖНО: вызываем базовые обработчики

        // Дополнительные специфичные обработчики для сессий
        this.element.addEventListener('dblclick', this.handleRowDoubleClick.bind(this));
    }

    // 🔹 АБСТРАКТНЫЕ МЕТОДЫ БАЗОВОГО КЛАССА
    protected renderRow(moduleData: ModuleData, index: number): string {
        // Базовый класс уже использует cellRenderer из колонок,
        // но мы можем переопределить полный рендеринг строки если нужно
        return this.config.columns
            .map((column) =>
                column.cellRenderer
                    ? column.cellRenderer(this.getCellValue(moduleData, column.key), moduleData, column)
                    : this.renderDefaultCell(moduleData, column)
            )
            .join('');
    }

    protected getRowId(moduleData: ModuleData): string {
        return moduleData.id_module;
    }

    // 🔹 ВИРТУАЛЬНЫЕ МЕТОДЫ - переопределяем обработчики
    protected handleRowClick(moduleData: ModuleData, event: Event): void {
        // Кастомная логика при клике на строку сессии
        console.log('Session table row clicked:', moduleData.id_module);
        eventBus.emit('session:module_selected', moduleData);

        // Вызываем родительский обработчик
        super.handleRowClick(moduleData, event);
    }

    protected handleRowDoubleClick(moduleData: ModuleData, event: Event): void {
        // Кастомная логика при двойном клике
        console.log('Session table row double clicked:', moduleData.id_module);

        super.handleRowDoubleClick(moduleData, event);
    }

    protected onSortChange(field: string, direction: 'asc' | 'desc'): void {
        // Кастомная логика при сортировке
        this.settingsManager.setSortSettings(field, direction);
        console.log('Session table sorted by:', field, direction);
    }

    private applyCheckboxStates(checkboxStates: Record<string, { marker: boolean; trace: boolean }>): void {
        // Обновляем ЧЕКБОКСЫ в таблице
        Object.entries(checkboxStates).forEach(([moduleId, state]) => {
            const markerCheckbox = this.element.querySelector(
                `input[data-type="marker"][data-id="${moduleId}"]`
            ) as HTMLInputElement;
            const traceCheckbox = this.element.querySelector(
                `input[data-type="trace"][data-id="${moduleId}"]`
            ) as HTMLInputElement;

            if (markerCheckbox) markerCheckbox.checked = state.marker;
            if (traceCheckbox) traceCheckbox.checked = state.trace;
        });
    }

    protected onCheckboxChange(type: 'marker' | 'trace', moduleId: string, checked: boolean, event: Event): void {
        console.log(`Checkbox ${type} changed for ${moduleId}:`, checked);

        if (this.currentSessionId) {
            this.settingsManager.setCheckboxState(this.currentSessionId, moduleId, type, checked);
        }

        // Специфичная логика для сессий
        const eventType = type === 'marker' ? EventTypes.TABLE.CHECKBOX_MARKER : EventTypes.TABLE.CHECKBOX_TRACE;

        eventBus.emit(eventType, {
            id_module: moduleId,
            flag: checked,
        });

        // Можно остановить всплытие если нужно
        // event.stopPropagation();
    }

    protected onButtonClick(action: string | null, id: string | null, event: Event): void {
        console.log('Button clicked:', action, id);
    }

    // 🔹 КАСТОМНЫЕ РЕНДЕРЕРЫ ЯЧЕЕК
    private static renderStatusCell(moduleData: ModuleData): string {
        const color = SessionDataTableComponent.getStatusColor(moduleData);
        const tooltip = SessionDataTableComponent.getStatusTooltip(moduleData);

        return `
            <td class="session-status-cell">
                <span class="status-dot dynamic-dot" 
                      style="background-color: ${color}"
                      title="${tooltip}"
                      data-bs-toggle="tooltip">
                </span>
            </td>
        `;
    }

    private static renderCheckboxCell(type: 'marker' | 'trace', moduleData: ModuleData): string {
        const checked = type === 'marker'; // По умолчанию маркеры включены

        return `
            <td class="session-checkbox-cell">
                <input type="checkbox" 
                       class="${type}-checkbox" 
                       data-type="${type}"
                       data-id="${moduleData.id_module}"
                       ${checked ? 'checked' : ''}>
            </td>
        `;
    }

    private static renderModuleNameCell(moduleData: ModuleData): string {
        return `
            <td class="session-module-name-cell" style="color: ${moduleData.module_color || '#000000'}">
                ${SessionDataTableComponent.escapeHtml(moduleData.module_name)}
            </td>
        `;
    }

    private static renderAltitudeCell(moduleData: ModuleData): string {
        const altitude = moduleData.coords?.alt ? Math.round(moduleData.coords.alt) : 0;
        return `
            <td class="session-altitude-cell">
                ${altitude} м
            </td>
        `;
    }

    private static renderTimeCell(moduleData: ModuleData): string {
        const timeText = SessionDataTableComponent.formatTime(moduleData.datetime_unix);
        return `
            <td class="session-time-cell" 
                data-timestamp="${moduleData.datetime_unix}"
                data-original-time="${moduleData.datetime_unix}">
                ${timeText}
            </td>
        `;
    }

    private renderDefaultCell(moduleData: ModuleData, column: TableColumn): string {
        const value = this.getCellValue(moduleData, column.key);
        return `
            <td class="session-default-cell" data-column="${column.key}">
                ${SessionDataTableComponent.escapeHtml(String(value))}
            </td>
        `;
    }

    // 🔹 ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    private getCellValue(moduleData: ModuleData, key: string): any {
        switch (key) {
            case 'coords.alt':
                return moduleData.coords?.alt || 0;
            case 'status':
                return moduleData.gps_ok ? 'active' : 'error';
            default:
                return (moduleData as any)[key];
        }
    }

    private static getStatusColor(moduleData: ModuleData): string {
        const now = Date.now();
        const timestamp =
            moduleData.datetime_unix < 100000000000 ? moduleData.datetime_unix * 1000 : moduleData.datetime_unix;
        const diffSeconds = (now - timestamp) / 1000;

        if (moduleData.gps_ok) {
            if (diffSeconds < 60) return '#4CAF50';
            if (diffSeconds < 300) return '#FFC107';
            return '#F44336';
        } else {
            if (diffSeconds < 60) return '#2196F3';
            if (diffSeconds < 300) return '#FFC107';
            return '#F44336';
        }
    }

    private static getStatusTooltip(moduleData: ModuleData): string {
        const now = Date.now();
        const timestamp =
            moduleData.datetime_unix < 100000000000 ? moduleData.datetime_unix * 1000 : moduleData.datetime_unix;
        const diffSeconds = (now - timestamp) / 1000;

        const statusText = moduleData.gps_ok ? 'Активен' : 'Ошибка GPS';

        if (diffSeconds < 60) return `${statusText}\nДанные свежие (<60 сек)`;
        if (diffSeconds < 300) return `${statusText}\nДанные устаревают (60-300 сек)`;
        return `${statusText}\nДанные устарели (>300 сек)`;
    }

    private static formatTime(unixTimestamp: number): string {
        if (!unixTimestamp) return 'Н/Д';

        const timestamp = unixTimestamp < 100000000000 ? unixTimestamp * 1000 : unixTimestamp;
        const messageTime = new Date(timestamp);

        if (isNaN(messageTime.getTime())) {
            return 'Н/Д';
        }

        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - messageTime.getTime()) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    private static escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 🔹 ОБНОВЛЕНИЕ ВРЕМЕНИ В РЕАЛЬНОМ ВРЕМЕНИ
    private setupTimeUpdates(): void {
        this.timeUpdateInterval = window.setInterval(() => {
            this.updateTimeCells();
        }, 1000);
    }

    private updateTimeCells(): void {
        const timeCells = this.element.querySelectorAll('.session-time-cell');
        timeCells.forEach((cell) => {
            const timestamp = cell.getAttribute('data-original-time');
            if (timestamp) {
                const unixTimestamp = parseInt(timestamp);
                const newTime = SessionDataTableComponent.formatTime(unixTimestamp);
                if (cell.textContent !== newTime) {
                    cell.textContent = newTime;
                }
            }
        });
    }

    // Обработка загрузки данных сессии
    private handleSessionDataLoad(modules: ModuleData[]): void {
        console.log('📊 Setting session data:', modules.length, 'modules');

        this.setData(modules, () => {
            console.log('✅ Data set complete, restoring state');
            this.restoreTableState();
        });
    }

    // 🔹 ОБРАБОТЧИКИ СОБЫТИЙ
    private setupEventListeners(): void {
        // Существующие
        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data: any) => {
            console.log('📡 SessionDataTable received module data:', data);
            if (data?.points) {
                this.handleNewModuleData(data.points);
            }
        });

        eventBus.on(EventTypes.SESSION.SELECTED, (session: any) => {
            console.log('🎯 Session selected:', session);
            this.handleSessionChange(session);
        });

        eventBus.on(EventTypes.TABLE.CLEAR, () => {
            console.log('🧹 Clearing table data');
            this.clearData();
        });

        // Загрузка данных сессии
        eventBus.on(EventTypes.SESSION.LOAD_DATA, (sessionData: any) => {
            console.log('📂 Loading session data:', sessionData);
            if (sessionData?.modules) {
                this.handleSessionDataLoad(sessionData.modules);
            }
        });
    }

    // 🔹 ПУБЛИЧНЫЕ МЕТОДЫ API
    public handleCheckboxChange(type: 'marker' | 'trace', moduleId: string, checked: boolean): void {
        const eventType = type === 'marker' ? EventTypes.TABLE.CHECKBOX_MARKER : EventTypes.TABLE.CHECKBOX_TRACE;

        eventBus.emit(eventType, {
            id_module: moduleId,
            flag: checked,
        });

        console.log(`Checkbox ${type} changed for ${moduleId}:`, checked);
    }

    public handleNewModuleData(messages: ModuleData[]): void {
        // Обновляем данные в таблице
        const newData = Array.isArray(messages) ? messages : Object.values(messages);
        this.appendData(newData as ModuleData[]);
    }

    // Улучшенная обработка смены сессии
    private handleSessionChange(session: any): void {
        console.log('🔄 Session changed in table:', session);
        this.currentSessionId = session?.id || null;

        // Очищаем таблицу при смене сессии
        this.clearData();

        // Если передан объект сессии с данными, загружаем их
        if (session?.modules) {
            this.handleSessionDataLoad(session.modules);
        }
    }

    public setSessionData(sessionData: ModuleData[]): void {
        this.setData(sessionData);
    }

    // 🔹 ОЧИСТКА РЕСУРСОВ
    public override destroy(): void {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        // Отписываемся от событий
        eventBus.off(EventTypes.SOCKET.NEW_DATA_MODULE, this.handleNewModuleData);
        eventBus.off(EventTypes.SESSION.SELECTED, this.handleSessionChange);
        eventBus.off(EventTypes.TABLE.CLEAR, this.clearData);

        super.destroy();
    }
}

// Глобальная ссылка для обработчиков в HTML
declare global {
    interface Window {
        sessionTable: SessionDataTableComponent;
    }
}
