// base-table-types.ts
export interface TableColumn {
    key: string;
    label: string;
    sortable?: boolean;
    filterable?: boolean;
    resizable?: boolean;
    width?: string;
    minWidth?: string;
    maxWidth?: string;
    cellRenderer?: (value: any, rowData: any, column: TableColumn) => string;
    headerRenderer?: (column: TableColumn) => string;
}

export interface TableConfig {
    columns: TableColumn[];
    features?: {
        infiniteScroll?: boolean | InfiniteScrollConfig;
        rowSelection?: boolean | SelectionConfig;
        sorting?: boolean | SortingConfig;
        filtering?: boolean | FilteringConfig;
    };
    styles?: {
        striped?: boolean;
        hover?: boolean;
        compact?: boolean;
        bordered?: boolean;
        height?: string;
    };
    classes?: {
        table?: string;
        header?: string;
        body?: string;
        row?: string;
        cell?: string;
    };
}

export interface InfiniteScrollConfig {
    enabled: boolean;
    pageSize: number;
    loadThreshold: number;
    dataLoader?: (page: number, pageSize: number, sort?: SortState, filters?: any) => Promise<LoadResult<any>>;
}

export interface SelectionConfig {
    enabled: boolean;
    mode: 'single' | 'multiple';
    selectionChanged?: (selectedIds: string[]) => void;
}

export interface SortingConfig {
    enabled: boolean;
    defaultField?: string;
    defaultDirection?: 'asc' | 'desc';
}

export interface FilteringConfig {
    enabled: boolean;
    filters?: Record<string, any>;
}

export interface SortState {
    field: string;
    direction: 'asc' | 'desc';
}

export interface LoadResult<T> {
    items: T[];
    hasMore: boolean;
    totalCount?: number;
    currentPage: number;
}

export interface TableEventMap {
    'row:click': { rowData: any; event: Event };
    'row:dblclick': { rowData: any; event: Event };
    'row:select': { rowData: any; selected: boolean };
    'sort:change': SortState;
    'data:updated': { data: any[] };
    'data:load': { page: number; pageSize: number };
    'data:loaded': LoadResult<any>;
    'feature:event': { featureName: string; event: string; data: any };
}
