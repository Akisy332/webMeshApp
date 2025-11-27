// base-table-row.ts
import { BaseComponent } from '../../core/component-base';
import { TableColumn } from './base-table-types';

export interface RowConfig<T> {
    rowData: T;
    index: number;
    columns: TableColumn[];
    onRowClick?: (rowData: T, event: Event) => void;
    onRowDoubleClick?: (rowData: T, event: Event) => void;
    renderCell?: (rowData: T, column: TableColumn, index: number) => string;
}

export class BaseTableRow<T> extends BaseComponent {
    private config: RowConfig<T>;
    private isSelected = false;

    constructor(containerId: string, config: RowConfig<T>) {
        super(containerId);
        this.config = config;
    }

    protected render(): void {
        this.element.innerHTML = this.renderRowContent();
        this.element.setAttribute('data-row-index', this.config.index.toString());
        this.element.classList.add('base-table-row');
    }

    protected bindEvents(): void {
        this.element.addEventListener('click', (e) => {
            this.config.onRowClick?.(this.config.rowData, e);
        });

        this.element.addEventListener('dblclick', (e) => {
            this.config.onRowDoubleClick?.(this.config.rowData, e);
        });
    }

    private renderRowContent(): string {
        return this.config.columns.map((column) => this.renderCell(column)).join('');
    }

    private renderCell(column: TableColumn): string {
        // Если передан кастомный рендерер, используем его
        if (this.config.renderCell) {
            return this.config.renderCell(this.config.rowData, column, this.config.index);
        }

        // Иначе используем стандартный рендеринг
        const value = this.getCellValue(column.key);
        const cellContent = column.cellRenderer
            ? column.cellRenderer(value, this.config.rowData, column)
            : this.formatCellValue(value);

        return `
            <td 
                class="base-table-cell"
                data-column="${column.key}"
                data-value="${this.escapeHtml(String(value))}"
                style="${column.width ? `width: ${column.width}` : ''}"
            >
                ${cellContent}
            </td>
        `;
    }

    private getCellValue(key: string): any {
        // Поддержка вложенных свойств через dot notation
        if (key.includes('.')) {
            return key.split('.').reduce((obj: any, prop) => obj?.[prop], this.config.rowData);
        }
        return (this.config.rowData as any)[key];
    }

    private formatCellValue(value: any): string {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'boolean') return value ? '✓' : '✗';
        if (typeof value === 'number') return value.toLocaleString();
        return this.escapeHtml(String(value));
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Публичные методы для управления состоянием строки
    public select(): void {
        this.isSelected = true;
        this.element.classList.add('row-selected');
    }

    public deselect(): void {
        this.isSelected = false;
        this.element.classList.remove('row-selected');
    }

    public toggleSelection(): void {
        this.isSelected ? this.deselect() : this.select();
    }

    public isRowSelected(): boolean {
        return this.isSelected;
    }

    public updateRowData(newData: T): void {
        this.config.rowData = newData;
        this.render();
    }

    public highlight(className: string = 'row-highlight', duration: number = 2000): void {
        this.element.classList.add(className);
        setTimeout(() => {
            this.element.classList.remove(className);
        }, duration);
    }

    public getRowData(): T {
        return this.config.rowData;
    }

    public getRowIndex(): number {
        return this.config.index;
    }
}
