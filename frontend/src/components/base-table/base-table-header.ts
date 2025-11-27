// base-table-header.ts
import { BaseComponent } from '../../core/component-base';
import { TableColumn, SortState } from './base-table-types';

interface HeaderConfig {
    onSort: (field: string, direction: 'asc' | 'desc') => void;
    sortState: SortState;
}

export class BaseTableHeader extends BaseComponent {
    private columns: TableColumn[];
    private config: HeaderConfig;

    constructor(containerId: string, columns: TableColumn[], config: HeaderConfig) {
        super(containerId);
        this.columns = columns;
        this.config = config;
    }

    protected render(): void {
        this.element.innerHTML = `
            <tr>
                ${this.columns.map((column) => this.renderHeaderCell(column)).join('')}
            </tr>
        `;
        this.updateSortIndicators();
    }

    protected bindEvents(): void {
        this.element.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const th = target.closest('th[data-sortable]') as HTMLElement;

            if (th && th.dataset.sortable === 'true') {
                const field = th.dataset.field!;
                this.handleSortClick(field);
            }
        });
    }

    private renderHeaderCell(column: TableColumn): string {
        const isSortable = column.sortable ?? false;
        const isCurrentlySorted = this.config.sortState.field === column.key;
        const sortDirection = isCurrentlySorted ? this.config.sortState.direction : '';

        return `
            <th 
                data-field="${column.key}"
                data-sortable="${isSortable}"
                data-sort-direction="${sortDirection}"
                class="${isSortable ? 'sortable' : ''} ${isCurrentlySorted ? 'sorting-active' : ''}"
                style="${column.width ? `width: ${column.width}` : ''}"
            >
                <div class="header-cell-content">
                    ${column.headerRenderer ? column.headerRenderer(column) : column.label}
                    ${isSortable ? this.renderSortIndicator(column) : ''}
                </div>
            </th>
        `;
    }

    private renderSortIndicator(column: TableColumn): string {
        const isCurrentlySorted = this.config.sortState.field === column.key;

        if (!isCurrentlySorted) {
            return `<span class="sort-indicator">↕</span>`;
        }

        const direction = this.config.sortState.direction;
        return `
            <span class="sort-indicator ${direction}">
                ${direction === 'asc' ? '↑' : '↓'}
            </span>
        `;
    }

    private handleSortClick(field: string): void {
        const currentField = this.config.sortState.field;
        const currentDirection = this.config.sortState.direction;

        let direction: 'asc' | 'desc';

        if (currentField === field) {
            // Переключаем направление для той же колонки
            direction = currentDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // Новая колонка - начинаем с asc
            direction = 'asc';
        }

        this.config.sortState = { field, direction };
        this.updateSortIndicators(); // Обновляем визуальные индикаторы
        this.config.onSort(field, direction);
    }

    public setSortState(sortState: SortState): void {
        this.config.sortState = sortState;
        this.updateSortIndicators();
    }

    private updateSortIndicators(): void {
        const headers = this.element.querySelectorAll('th[data-sortable="true"]');

        headers.forEach((header) => {
            const field = header.getAttribute('data-field');
            const isActive = field === this.config.sortState.field;

            header.classList.toggle('sorting-active', isActive);
            header.setAttribute('data-sort-direction', isActive ? this.config.sortState.direction : '');

            const indicator = header.querySelector('.sort-indicator');
            if (indicator) {
                if (isActive) {
                    indicator.innerHTML = this.config.sortState.direction === 'asc' ? '↑' : '↓';
                    indicator.className = `sort-indicator ${this.config.sortState.direction}`;
                } else {
                    indicator.innerHTML = '↕';
                    indicator.className = 'sort-indicator';
                }
            }
        });
    }
}
