// features/sorting.feature.ts
import { TableFeature } from './base.feature';
import { SortState } from '../base-table-types';

export class SortingFeature extends TableFeature {
    private sortState: SortState = { field: '', direction: 'asc' };
    private isSorting = false;
    private sortQueue: SortState[] = [];

    enable(config: any): void {
        this.setupSorting();
    }

    disable(): void {
        this.sortQueue = [];
    }

    private setupSorting(): void {
        this.table.on('sort:change', (sortState: SortState) => {
            this.handleSortChange(sortState);
        });

        this.table.on('data:updated', () => {
            if (this.sortState.field) {
                this.performSort();
            }
        });
    }

    private handleSortChange(sortState: SortState): void {
        this.sortState = sortState;
        this.debouncedSort();
    }

    // Дебаунс для частых обновлений
    private debouncedSort = this.debounce(() => {
        this.performSort();
    }, 50);

    private debounce(func: Function, wait: number): Function {
        let timeout: number;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    public performSort(): void {
        if (this.isSorting) return;

        this.isSorting = true;

        requestAnimationFrame(() => {
            const sortedData = this.sortData(this.table.getData());
            this.table.setData(sortedData);
            this.isSorting = false;
        });
    }

    private sortData(data: any[]): any[] {
        if (!this.sortState.field || data.length === 0) return data;

        return [...data].sort((a, b) => {
            const valueA = this.getSortValue(a, this.sortState.field);
            const valueB = this.getSortValue(b, this.sortState.field);

            let result = 0;
            if (valueA < valueB) result = -1;
            if (valueA > valueB) result = 1;

            return this.sortState.direction === 'desc' ? -result : result;
        });
    }

    private getSortValue(item: any, field: string): any {
        // Вложенные свойства
        if (field.includes('.')) {
            return field.split('.').reduce((obj, prop) => obj?.[prop], item);
        }

        const rawValue = item[field];

        // Базовые типы - обрабатываем здесь
        if (this.isPrimitiveType(rawValue)) {
            return this.normalizePrimitiveValue(rawValue);
        }

        // Сложные типы - делегируем наследникам
        return this.table.getCustomSortValue?.(item, field) ?? rawValue;
    }

    private isPrimitiveType(value: any): boolean {
        const type = typeof value;
        return (
            type === 'string' ||
            type === 'number' ||
            type === 'boolean' ||
            value === null ||
            value === undefined ||
            value instanceof Date
        );
    }

    private normalizePrimitiveValue(value: any): any {
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (typeof value === 'string') return value.toLowerCase().trim();
        if (value instanceof Date) return value.getTime();
        return value;
    }

    public getSortState(): SortState {
        return this.sortState;
    }

    public setSortState(sortState: SortState): void {
        this.sortState = sortState;
        this.performSort();
    }
}
