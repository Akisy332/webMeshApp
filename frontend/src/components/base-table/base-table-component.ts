// base-table-component.ts
import { BaseComponent } from '../../core/component-base';
import { TableConfig, TableColumn, TableEventMap, LoadResult, SortState } from './base-table-types';
import { mergeWithDefaultConfig } from './base-table-config';
import { TableFeatureManager } from './features/feature-manager';
import { SortingFeature } from './features/sorting.feature';
import { BaseTableHeader } from './base-table-header';
import { BaseTableBody } from './base-table-body';

export abstract class BaseTableComponent<T> extends BaseComponent {
    protected config: TableConfig;
    protected data: T[] = [];
    protected featureManager: TableFeatureManager;
    protected header: BaseTableHeader | null = null;
    protected body: BaseTableBody<T> | null = null;

    // Состояние таблицы
    protected sortState: SortState = { field: '', direction: 'asc' };
    protected eventHandlers: Map<keyof TableEventMap, Function[]> = new Map();

    constructor(containerId: string, config: TableConfig) {
        super(containerId);
        this.config = mergeWithDefaultConfig(config);
        this.featureManager = new TableFeatureManager();
        this.registerDefaultFeatures();
    }

    protected async init(): Promise<void> {
        if (this.isInitialized) return;

        await this.waitForDependencies();
        this.render();
        this.setupFeatures();
        this.bindEvents();

        this.isInitialized = true;
        console.log(`${this.constructor.name} initialized successfully`);
    }

    protected render(): void {
        this.element.innerHTML = this.renderTableTemplate();
        this.initializeSubComponents();
    }

    private renderTableTemplate(): string {
        const classes = this.config.classes!;
        const styles = this.config.styles!;

        return `
            <div class="base-table-container" style="height: ${styles.height}">
                <table class="${classes.table} ${this.getTableStyleClasses()}">
                    <thead class="${classes.header}" id="${this.element.id}-header"></thead>
                    <tbody class="${classes.body}" id="${this.element.id}-body"></tbody>
                </table>
                <div class="base-table-loading" style="display: none;">
                    <div class="spinner"></div>
                    <span>Загрузка...</span>
                </div>
                <div class="base-table-empty" style="display: none;">
                    Нет данных для отображения
                </div>
            </div>
        `;
    }

    private initializeSubComponents(): void {
        // Инициализация заголовка
        this.header = new BaseTableHeader(`${this.element.id}-header`, this.config.columns, {
            onSort: this.handleSort.bind(this),
            sortState: this.sortState,
        });

        // Инициализация тела таблицы
        this.body = new BaseTableBody<T>(`${this.element.id}-body`, {
            data: this.data,
            columns: this.config.columns,
            onRowClick: this.handleRowClick.bind(this),
            onRowDoubleClick: this.handleRowDoubleClick.bind(this),
            renderRow: this.renderRow.bind(this),
            getRowId: this.getRowId.bind(this),
        });
    }

    // абстрактные методы - должны быть реализованы наследниками
    protected abstract renderRow(rowData: T, index: number): string;
    protected abstract getRowId(rowData: T): string;

    // виртуальные методы - могут быть переопределены наследниками
    protected handleRowClick(rowData: T, event: Event): void {
        this.emit('row:click', { rowData, event });
    }

    protected handleRowDoubleClick(rowData: T, event: Event): void {
        this.emit('row:dblclick', { rowData, event });
    }

    protected handleSort(field: string, direction: 'asc' | 'desc'): void {
        this.sortState = { field, direction };
        this.header?.setSortState(this.sortState); // Обновляем заголовок
        this.emit('sort:change', this.sortState);
        this.onSortChange(field, direction);
    }

    /**
     * метод для сложных типов данных
     * Вызывается только для не-примитивных значений
     */
    public getCustomSortValue?(item: T, field: string): any;

    // Виртуальный метод для кастомной логики сортировки
    protected onSortChange(field: string, direction: 'asc' | 'desc'): void {}

    // Вызывается при изменении чекбокса
    protected onCheckboxChange?(type: string, id: string, checked: boolean, event: Event): void;

    // Вызывается при изменении select
    protected onSelectChange?(type: string | null, value: string, event: Event): void;

    // Вызывается при клике на кнопку
    protected onButtonClick?(action: string | null, id: string | null, event: Event): void;

    // Вызывается при клике на ссылку
    protected onLinkClick?(action: string | null, id: string | null, event: Event): void;

    // Вызывается при изменении input (text, number)
    protected onInputChange?(type: string | null, value: string, event: Event): void;

    // Регистрация фич по умолчанию
    private registerDefaultFeatures(): void {
        this.featureManager.registerFeature('sorting', new SortingFeature(this, 'sorting'));
    }

    private setupFeatures(): void {
        // Включение фич на основе конфигурации
        const features = this.config.features!;

        if (features.infiniteScroll) {
            const config =
                typeof features.infiniteScroll === 'boolean'
                    ? { enabled: features.infiniteScroll, pageSize: 50, loadThreshold: 10 }
                    : features.infiniteScroll;
            if (config.enabled) {
                this.featureManager.enableFeature('infiniteScroll', config);
            }
        }

        if (features.rowSelection) {
            const config =
                typeof features.rowSelection === 'boolean'
                    ? { enabled: features.rowSelection, mode: 'multiple' }
                    : features.rowSelection;
            if (config.enabled) {
                this.featureManager.enableFeature('rowSelection', config);
            }
        }

        if (features.sorting) {
            const config = typeof features.sorting === 'boolean' ? { enabled: features.sorting } : features.sorting;
            if (config.enabled) {
                this.featureManager.enableFeature('sorting', config);
            }
        }

        if (features.filtering) {
            const config =
                typeof features.filtering === 'boolean' ? { enabled: features.filtering } : features.filtering;
            if (config.enabled) {
                this.featureManager.enableFeature('filtering', config);
            }
        }
    }

    // Публичные методы API
    public getData(): T[] {
        return this.body?.getData() || [];
    }

    public setData(data: T[], onComplete?: () => void): void {
        this.data = data;
        this.body?.setData(data);
        this.updateEmptyState();
        this.emit('data:updated', { data });

        // Вызываем колбэк после установки данных
        if (onComplete) {
            setTimeout(onComplete, 0);
        }
    }

    public appendData(data: T[]): void {
        this.data = [...this.data, ...data];
        this.body?.appendData(data);
        this.emit('data:updated', { data });
    }

    public clearData(): void {
        this.data = [];
        this.body?.clearData();
        this.updateEmptyState();
    }

    public setSort(field: string, direction: 'asc' | 'desc'): void {
        this.sortState = { field, direction };
        this.header?.setSortState(this.sortState); // Синхронизируем визуальное состояние
        this.onSortChange(field, direction);
    }

    public showLoading(): void {
        const loadingElement = this.element.querySelector('.base-table-loading') as HTMLElement;
        if (loadingElement) {
            loadingElement.style.display = 'flex';
        }
    }

    public hideLoading(): void {
        const loadingElement = this.element.querySelector('.base-table-loading') as HTMLElement;
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }

    private updateEmptyState(): void {
        const emptyElement = this.element.querySelector('.base-table-empty') as HTMLElement;
        if (emptyElement) {
            emptyElement.style.display = this.data.length === 0 ? 'block' : 'none';
        }
    }

    // Системные методы
    protected bindEvents(): void {
        // Базовые обработчики для всех таблиц
        this.element.addEventListener('change', (e) => {
            this.handleGenericChange(e);
        });

        this.element.addEventListener('click', (e) => {
            this.handleGenericClick(e);
        });
    }

    protected handleGenericChange(event: Event): void {
        const target = event.target as HTMLElement;

        // Обработка чекбоксов
        if (target instanceof HTMLInputElement && target.type === 'checkbox') {
            const type = target.getAttribute('data-type');
            const id = target.getAttribute('data-id');

            if (type && id) {
                this.onCheckboxChange?.(type, id, target.checked, event);
            }
        }

        // Обработка select'ов
        if (target instanceof HTMLSelectElement) {
            this.onSelectChange?.(target.getAttribute('data-type'), target.value, event);
        }

        // Обработка text/number input'ов
        if (target instanceof HTMLInputElement && (target.type === 'text' || target.type === 'number')) {
            this.onInputChange?.(target.getAttribute('data-type'), target.value, event);
        }
    }

    protected handleGenericClick(event: Event): void {
        const target = event.target as HTMLElement;

        // Обработка кнопок
        if (target.matches('button[data-action]')) {
            this.onButtonClick?.(target.getAttribute('data-action'), target.getAttribute('data-id'), event);
        }

        // Обработка ссылок
        if (target.matches('a[data-action]')) {
            this.onLinkClick?.(target.getAttribute('data-action'), target.getAttribute('data-id'), event);
        }
    }

    protected emit<K extends keyof TableEventMap>(event: K, data: TableEventMap[K]): void {
        const handlers = this.eventHandlers.get(event) || [];
        handlers.forEach((handler) => {
            try {
                handler(data);
            } catch (error) {
                console.error(`Error in event handler for ${event}:`, error);
            }
        });
    }

    public on<K extends keyof TableEventMap>(event: K, handler: (data: TableEventMap[K]) => void): void {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event)!.push(handler);
    }

    public off<K extends keyof TableEventMap>(event: K, handler: (data: TableEventMap[K]) => void): void {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            this.eventHandlers.set(
                event,
                handlers.filter((h) => h !== handler)
            );
        }
    }

    public emitFeatureEvent(featureName: string, event: string, data: any): void {
        this.emit('feature:event' as any, { featureName, event, data });
    }

    private getTableStyleClasses(): string {
        const styles = this.config.styles!;
        const classes: string[] = [];

        if (styles.striped) classes.push('table-striped');
        if (styles.hover) classes.push('table-hover');
        if (styles.compact) classes.push('table-compact');
        if (styles.bordered) classes.push('table-bordered');

        return classes.join(' ');
    }

    public override destroy(): void {
        this.featureManager.destroy();
        this.header?.destroy();
        this.body?.destroy();
        this.eventHandlers.clear();
        super.destroy();
    }
}
