import { eventBus } from '../core/event-bus.js';
import { EventTypes, TIME_THRESHOLDS } from '../core/constants.js';
import type { ModuleData, Session } from '../types/index.js';

export class TableService {
    private tableData: Map<string, ModuleData> = new Map();
    private currentSession: Session | null = null;
    private updateInterval?: number;

    constructor(private tableId: string = 'table-body') {
        this.init();
    }

    private init(): void {
        console.log('TableService (TypeScript) initializing...');
        
        this.setupEventListeners();
        this.startUpdatingTimes();
    }

    private setupEventListeners(): void {
        // Подписка на события через новый EventBus
        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data: any) => {
            if (!data?.points) return;
            this.updateTable(data.points);
        });

        eventBus.on(EventTypes.SESSION.LOAD_DATA, (sessionData: any) => {
            console.log('TableService: Session data loaded', sessionData);
            this.updateTable(sessionData.modules || []);
        });

        eventBus.on(EventTypes.SESSION.SELECTED, (session: Session) => {
            console.log('TableService: Session selected', session.id);
            if (this.currentSession && this.currentSession.id !== session.id) {
                this.clearTable();
            }
            this.currentSession = session;
        });
    
    }

    public updateTable(messages: ModuleData[] | Record<string, ModuleData>): void {
        const messagesArray = this.normalizeMessages(messages);
        
        messagesArray.forEach(message => {
            if (this.currentSession && message.id_session === this.currentSession.id) {
                this.tableData.set(message.id_module, message);
                this.updateOrCreateTableRow(message);
            }
        });
    }

    private normalizeMessages(messages: ModuleData[] | Record<string, ModuleData>): ModuleData[] {
        if (Array.isArray(messages)) {
            return messages;
        }
        return Object.values(messages);
    }

    private updateOrCreateTableRow(message: ModuleData): void {
        const tbody = document.getElementById(this.tableId);
        if (!tbody) {
            console.warn('Table body not found:', this.tableId);
            return;
        }

        let row = tbody.querySelector(`tr[data-module-id="${message.id_module}"]`) as HTMLTableRowElement;

        if (!row) {
            row = this.createTableRow(message);
            tbody.appendChild(row);
        } else {
            this.updateRowData(row, message);
        }
    }

    private createTableRow(message: ModuleData): HTMLTableRowElement {
        const row = document.createElement('tr');
        row.dataset.moduleId = message.id_module;
        row.dataset.datetime_unix = message.datetime_unix.toString();
        row.dataset.gpsOk = message.gps_ok ? '1' : '0';

        // Статус
        const statusCell = document.createElement('td');
        const statusDot = document.createElement('span');
        statusDot.className = 'status-dot dynamic-dot';
        statusDot.dataset.bsToggle = 'tooltip';
        statusCell.appendChild(statusDot);
        row.appendChild(statusCell);

        // Чекбокс видимости маркера
        const visibleCell = document.createElement('td');
        const visibleCheckbox = document.createElement('input');
        visibleCheckbox.type = 'checkbox';
        visibleCheckbox.checked = true;
        visibleCheckbox.addEventListener('change', (e) => {
            eventBus.emit(EventTypes.TABLE.CHECKBOX_MARKER, {
                id_module: message.id_module,
                flag: (e.target as HTMLInputElement).checked
            });
        });
        visibleCell.appendChild(visibleCheckbox);
        row.appendChild(visibleCell);

        // Чекбокс трассы
        const traceCell = document.createElement('td');
        const traceCheckbox = document.createElement('input');
        traceCheckbox.type = 'checkbox';
        traceCheckbox.checked = false;
        traceCheckbox.addEventListener('change', (e) => {
            eventBus.emit(EventTypes.TABLE.CHECKBOX_TRACE, {
                id_module: message.id_module,
                flag: (e.target as HTMLInputElement).checked
            });
        });
        traceCell.appendChild(traceCheckbox);
        row.appendChild(traceCell);

        // Название модуля
        const nameCell = document.createElement('td');
        nameCell.textContent = message.module_name;
        nameCell.style.color = message.module_color;
        row.appendChild(nameCell);

        // Высота
        const altCell = document.createElement('td');
        const altitude = message.coords?.alt ? Math.round(message.coords.alt) : 0;
        altCell.textContent = `${altitude} м`;
        row.appendChild(altCell);

        // Время
        const timeCell = document.createElement('td');
        timeCell.textContent = this.formatTime(message.datetime_unix);
        timeCell.dataset.originalTime = message.datetime_unix.toString();
        row.appendChild(timeCell);

        // Инициализация статуса
        this.updateDotAndTooltip(statusDot, message.gps_ok, message.datetime_unix);

        return row;
    }

    private updateRowData(row: HTMLTableRowElement, message: ModuleData): void {
        this.tableData.set(message.id_module, message);

        row.dataset.datetime_unix = message.datetime_unix.toString();
        row.dataset.gpsOk = message.gps_ok ? '1' : '0';

        // Обновление точек статуса
        const dot = row.querySelector('.status-dot') as HTMLElement;
        if (dot) {
            this.updateDotAndTooltip(dot, message.gps_ok, message.datetime_unix);
        }

        // Обновление высоты
        const altCell = row.querySelector('td:nth-child(5)') as HTMLTableCellElement;
        if (altCell) {
            const altitude = message.coords?.alt ? Math.round(message.coords.alt) : 0;
            altCell.textContent = `${altitude} м`;
        }

        // Обновление времени
        const timeCell = row.querySelector('td:nth-child(6)') as HTMLTableCellElement;
        if (timeCell) {
            timeCell.textContent = this.formatTime(message.datetime_unix);
            timeCell.dataset.originalTime = message.datetime_unix.toString();
        }

        // Обновление имени
        const nameCell = row.querySelector('td:nth-child(4)') as HTMLTableCellElement;
        if (nameCell) {
            nameCell.textContent = message.module_name;
            nameCell.style.color = message.module_color;
        }
    }

    private updateDotAndTooltip(dot: HTMLElement, gpsOk: boolean, timestamp: number): void {
        if (!dot) return;

        const tooltipText = this.getTooltipText(gpsOk, timestamp);
        const color = this.getStatusColor(gpsOk, timestamp);

        dot.style.backgroundColor = color;
        dot.setAttribute('data-bs-original-title', tooltipText);

        // Инициализация Bootstrap tooltip если нужно
        this.initTooltip(dot);
    }

    private initTooltip(element: HTMLElement): void {
        if (!element || (element as any)._tooltip) return;

        try {
            // @ts-ignore - Bootstrap tooltip
            if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
                new bootstrap.Tooltip(element);
            } else {
                console.debug('Bootstrap not available, tooltip will be initialized later');
            }
        } catch (e) {
            console.warn('Could not initialize tooltip:', e);
        }
    }

    private getStatusColor(gpsOk: boolean, unixTimestamp: number): string {
        const now = Date.now();
        const timestamp = this.normalizeTimestamp(unixTimestamp);
        const diffSeconds = (now - timestamp) / 1000;

        if (gpsOk) {
            if (diffSeconds < TIME_THRESHOLDS.FRESH) return '#4CAF50';
            if (diffSeconds < TIME_THRESHOLDS.WARNING) return '#FFC107';
            return '#F44336';
        } else {
            if (diffSeconds < TIME_THRESHOLDS.FRESH) return '#2196F3';
            if (diffSeconds < TIME_THRESHOLDS.WARNING) return '#FFC107';
            return '#F44336';
        }
    }

    private getTooltipText(gpsOk: boolean, unixTimestamp: number): string {
        const now = Date.now();
        const timestamp = this.normalizeTimestamp(unixTimestamp);
        const diffSeconds = (now - timestamp) / 1000;

        const statusText = gpsOk ? 'Активен' : 'Ошибка GPS';
        
        if (diffSeconds < TIME_THRESHOLDS.FRESH) return `${statusText}\nДанные свежие (<60 сек)`;
        if (diffSeconds < TIME_THRESHOLDS.WARNING) return `${statusText}\nДанные устаревают (60-300 сек)`;
        return `${statusText}\nДанные устарели (>300 сек)`;
    }

    private normalizeTimestamp(timestamp: number): number {
        // Конвертируем секунды в миллисекунды если нужно
        return timestamp < 100000000000 ? timestamp * 1000 : timestamp;
    }

    private formatTime(unixTimestamp: number): string {
        if (!unixTimestamp) return 'Н/Д';

        const timestamp = this.normalizeTimestamp(unixTimestamp);
        const messageTime = new Date(timestamp);
        
        if (isNaN(messageTime.getTime())) {
            console.error('Invalid timestamp:', unixTimestamp);
            return 'Н/Д';
        }

        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - messageTime.getTime()) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    private startUpdatingTimes(): void {
        this.updateInterval = window.setInterval(() => {
            this.updateAllRowTimes();
        }, 1000);
    }

    private updateAllRowTimes(): void {
        const now = new Date();
        const rows = document.querySelectorAll(`#${this.tableId} tr`);

        rows.forEach(row => {
            try {
                const unixTimestamp = row.getAttribute('data-datetime_unix');
                if (!unixTimestamp) return;

                const timestamp = this.normalizeTimestamp(parseInt(unixTimestamp));
                const messageTime = new Date(timestamp);
                
                if (isNaN(messageTime.getTime())) return;

                // Обновление времени
                const elapsedSeconds = Math.floor((now.getTime() - messageTime.getTime()) / 1000);
                const minutes = Math.floor(elapsedSeconds / 60);
                const seconds = elapsedSeconds % 60;
                const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                const timeCell = row.querySelector('td:nth-child(6)') as HTMLTableCellElement;
                if (timeCell) timeCell.textContent = timeText;

                // Обновление статуса
                const dot = row.querySelector('.status-dot') as HTMLElement;
                if (dot) {
                    const gpsOk = row.getAttribute('data-gps-ok') === '1';
                    const color = this.getStatusColor(gpsOk, timestamp);
                    const tooltipText = this.getTooltipText(gpsOk, timestamp);

                    dot.style.backgroundColor = color;
                    dot.setAttribute('data-bs-original-title', tooltipText);
                }
            } catch (e) {
                console.error('Error updating row time:', e);
            }
        });
    }

    public clearTable(): void {
        console.log('🧹 TableService: Clearing table');
        
        const tbody = document.getElementById(this.tableId);
        if (tbody) {
            tbody.innerHTML = '';
        }
        this.tableData.clear();
    }

    public destroy(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        // Отписываемся от событий
        eventBus.off(EventTypes.SOCKET.NEW_DATA_MODULE, this.updateTable);
        eventBus.off(EventTypes.SESSION.LOAD_DATA, this.updateTable);
        eventBus.off(EventTypes.SESSION.SELECTED, this.clearTable);
    }
}