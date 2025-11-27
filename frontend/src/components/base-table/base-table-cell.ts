// base-table-cell.ts
import { BaseComponent } from '../../core/component-base';
import { TableColumn } from './base-table-types';

export interface CellConfig<T> {
    rowData: T;
    column: TableColumn;
    value: any;
    rowIndex: number;
    onCellClick?: (rowData: T, column: TableColumn, event: Event) => void;
    onCellDoubleClick?: (rowData: T, column: TableColumn, event: Event) => void;
}

export class BaseTableCell<T> extends BaseComponent {
    private config: CellConfig<T>;

    constructor(containerId: string, config: CellConfig<T>) {
        super(containerId);
        this.config = config;
    }

    protected render(): void {
        const cellContent = this.config.column.cellRenderer
            ? this.config.column.cellRenderer(this.config.value, this.config.rowData, this.config.column)
            : this.formatValue(this.config.value);

        this.element.innerHTML = cellContent;
        this.element.className = 'base-table-cell';
        this.element.setAttribute('data-column', this.config.column.key);
        this.element.setAttribute('data-value', String(this.config.value));

        if (this.config.column.width) {
            this.element.style.width = this.config.column.width;
        }
    }

    protected bindEvents(): void {
        this.element.addEventListener('click', (e) => {
            this.config.onCellClick?.(this.config.rowData, this.config.column, e);
        });

        this.element.addEventListener('dblclick', (e) => {
            this.config.onCellDoubleClick?.(this.config.rowData, this.config.column, e);
        });
    }

    private formatValue(value: any): string {
        if (value === null || value === undefined) return '<span class="cell-null">-</span>';

        switch (typeof value) {
            case 'boolean':
                return `<span class="cell-boolean ${value ? 'cell-true' : 'cell-false'}">${value ? '✓' : '✗'}</span>`;

            case 'number':
                return `<span class="cell-number">${value.toLocaleString()}</span>`;

            case 'string':
                if (this.isDateString(value)) {
                    return `<span class="cell-date">${this.formatDate(value)}</span>`;
                }
                if (this.isUrl(value)) {
                    return `<a href="${value}" target="_blank" class="cell-url">${value}</a>`;
                }
                return `<span class="cell-string">${this.escapeHtml(value)}</span>`;

            case 'object':
                if (value instanceof Date) {
                    return `<span class="cell-date">${this.formatDate(value)}</span>`;
                }
                return `<span class="cell-object">${this.escapeHtml(JSON.stringify(value))}</span>`;

            default:
                return `<span class="cell-default">${this.escapeHtml(String(value))}</span>`;
        }
    }

    private isDateString(value: string): boolean {
        return !isNaN(Date.parse(value));
    }

    private isUrl(value: string): boolean {
        try {
            new URL(value);
            return true;
        } catch {
            return false;
        }
    }

    private formatDate(value: string | Date): string {
        const date = typeof value === 'string' ? new Date(value) : value;
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Публичные методы
    public updateValue(newValue: any, newRowData?: T): void {
        if (newRowData) {
            this.config.rowData = newRowData;
        }
        this.config.value = newValue;
        this.render();
    }

    public getValue(): any {
        return this.config.value;
    }

    public getColumn(): TableColumn {
        return this.config.column;
    }

    public highlight(className: string = 'cell-highlight', duration: number = 1000): void {
        this.element.classList.add(className);
        setTimeout(() => {
            this.element.classList.remove(className);
        }, duration);
    }
}
