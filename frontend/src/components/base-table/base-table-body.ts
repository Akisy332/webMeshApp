// base-table-body.ts
import { BaseComponent } from '../../core/component-base';
import { TableColumn } from './base-table-types';
import { BaseTableRow, RowConfig } from './base-table-row';

interface BodyConfig<T> {
    data: T[];
    columns: TableColumn[];
    onRowClick: (rowData: T, event: Event) => void;
    onRowDoubleClick: (rowData: T, event: Event) => void;
    renderRow: (rowData: T, index: number) => string;
    getRowId: (rowData: T) => string;
}

export class BaseTableBody<T> extends BaseComponent {
    private config: BodyConfig<T>;
    private currentData: T[] = [];
    private rowComponents: Map<string, BaseTableRow<T>> = new Map();

    constructor(containerId: string, config: BodyConfig<T>) {
        super(containerId);
        this.config = config;
        this.currentData = config.data;
    }

    protected render(): void {
        this.reorderRows();
    }

    protected bindEvents(): void {
        // События теперь обрабатываются на уровне строк
    }

    private createRow(rowData: T, index: number): void {
        const rowId = this.config.getRowId(rowData);
        const rowElement = document.createElement('tr');
        rowElement.id = `row-${rowId}`;
        this.element.appendChild(rowElement);

        const rowConfig: RowConfig<T> = {
            rowData,
            index,
            columns: this.config.columns,
            onRowClick: this.config.onRowClick,
            onRowDoubleClick: this.config.onRowDoubleClick,
            renderCell: this.renderCell.bind(this),
        };

        const rowComponent = new BaseTableRow<T>(`row-${rowId}`, rowConfig);
        this.rowComponents.set(rowId, rowComponent);
    }

    private renderCell(rowData: T, column: TableColumn, index: number): string {
        // Базовая реализация рендеринга ячейки
        const value = this.getCellValue(rowData, column.key);

        if (column.cellRenderer) {
            return column.cellRenderer(value, rowData, column);
        }

        return `
            <td class="base-table-cell" data-column="${column.key}">
                ${this.formatCellValue(value)}
            </td>
        `;
    }

    private getCellValue(rowData: T, key: string): any {
        if (key.includes('.')) {
            return key.split('.').reduce((obj, prop) => obj?.[prop], rowData as any);
        }
        return (rowData as any)[key];
    }

    private formatCellValue(value: any): string {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'boolean') return value ? '✓' : '✗';
        if (typeof value === 'number') return value.toLocaleString();
        return String(value);
    }

    // Публичные методы для управления данными
    public setData(data: T[]): void {
        this.currentData = data;
        this.reorderRows(); // Перемещаем существующие строки
    }

    private reorderRows(): void {
        const fragment = document.createDocumentFragment();

        // Проверяем существование строк
        if (this.rowComponents.size === 0) {
            // Если строк нет - создаем новые
            console.log('No existing rows, creating new ones');
            this.currentData.forEach((rowData, index) => {
                this.createRow(rowData, index);
            });
            return;
        }

        // Собираем существующие строки в правильном порядке
        this.currentData.forEach((rowData) => {
            const rowId = this.config.getRowId(rowData);
            const rowComponent = this.rowComponents.get(rowId);
            if (rowComponent) {
                fragment.appendChild(rowComponent.getElement());
            } else {
                // Если стро нет - создаем новую
                console.log('Creating missing row:', rowId);
                this.createRow(rowData, this.currentData.indexOf(rowData));
            }
        });

        // Заменяем содержимое
        this.getElement().innerHTML = '';
        this.getElement().appendChild(fragment);
    }

    public appendData(newData: T[]): void {
        const updatesMap = new Map(newData.map((item) => [this.config.getRowId(item), item]));

        // 1. Обновляем currentData и существующие строки
        this.currentData = this.currentData.map((item) => {
            const rowId = this.config.getRowId(item);
            const update = updatesMap.get(rowId);
            if (update) {
                // Обновляем строку
                this.rowComponents.get(rowId)?.updateRowData(update);
                updatesMap.delete(rowId);
                return update; // Обновляем в currentData
            }
            return item;
        });

        // 2. Добавляем новые строки
        const actuallyNewData = Array.from(updatesMap.values());
        if (actuallyNewData.length > 0) {
            this.currentData = [...this.currentData, ...actuallyNewData];

            actuallyNewData.forEach((rowData, index) => {
                this.createRow(rowData, this.currentData.length - actuallyNewData.length + index);
            });
        }
    }

    public updateRows(updates: T[]): void {
        const updatesMap = new Map(updates.map((item) => [this.config.getRowId(item), item]));

        // Обновляем только измененные строки
        this.rowComponents.forEach((row, rowId) => {
            const update = updatesMap.get(rowId);
            if (update) {
                row.updateRowData(update);
                updatesMap.delete(rowId);
            }
        });

        // Добавляем новые строки
        updatesMap.forEach((newData, rowId) => {
            this.createRow(newData, this.currentData.length);
        });

        this.mergeData(updates);
    }

    private mergeData(updates: T[]): void {
        const dataMap = new Map(this.currentData.map((item) => [this.config.getRowId(item), item]));

        updates.forEach((update) => {
            dataMap.set(this.config.getRowId(update), update);
        });

        this.currentData = Array.from(dataMap.values());
    }

    public removeRow(rowId: string): void {
        const rowComponent = this.rowComponents.get(rowId);
        if (rowComponent) {
            rowComponent.destroy();
            this.rowComponents.delete(rowId);

            // Удаляем из массива данных
            this.currentData = this.currentData.filter((item) => this.config.getRowId(item) !== rowId);
        }
    }

    public clearData(): void {
        this.rowComponents.forEach((row) => row.destroy());
        this.rowComponents.clear();
        this.currentData = [];
        this.element.innerHTML = '';
    }

    public getData(): T[] {
        return [...this.currentData];
    }

    public getRowComponent(rowId: string): BaseTableRow<T> | undefined {
        return this.rowComponents.get(rowId);
    }

    public override destroy(): void {
        this.rowComponents.forEach((row) => row.destroy());
        this.rowComponents.clear();
        super.destroy();
    }
}
