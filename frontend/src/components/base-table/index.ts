// base-table/index.ts
export { BaseTableComponent } from './base-table-component.js';
export { BaseTableHeader } from './base-table-header.js';
export { BaseTableBody } from './base-table-body.js';
export { BaseTableRow } from './base-table-row.js';
export { BaseTableCell } from './base-table-cell.js';

// Типы и конфигурация
export type {
    TableConfig,
    TableColumn,
    TableEventMap,
    InfiniteScrollConfig,
    SelectionConfig,
    SortingConfig,
    FilteringConfig,
    SortState,
    LoadResult,
} from './base-table-types.js';

export { DEFAULT_TABLE_CONFIG, mergeWithDefaultConfig } from './base-table-config.js';

// Фичи (пока заглушки, добавим позже)
export { TableFeatureManager } from './features/feature-manager.js';
export { TableFeature } from './features/base.feature.js';
