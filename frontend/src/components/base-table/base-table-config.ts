// base-table-config.ts
import { TableConfig, InfiniteScrollConfig, SelectionConfig, SortingConfig, FilteringConfig } from './base-table-types';

export const DEFAULT_TABLE_CONFIG: Partial<TableConfig> = {
    features: {
        infiniteScroll: {
            enabled: false,
            pageSize: 50,
            loadThreshold: 10,
        } as InfiniteScrollConfig,
        rowSelection: {
            enabled: false,
            mode: 'multiple',
        } as SelectionConfig,
        sorting: {
            enabled: true,
            defaultField: '',
            defaultDirection: 'asc',
        } as SortingConfig,
        filtering: {
            enabled: false,
        } as FilteringConfig,
    },
    styles: {
        striped: true,
        hover: true,
        compact: false,
        bordered: true,
        height: '400px',
    },
    classes: {
        table: 'base-table',
        header: 'base-table-header',
        body: 'base-table-body',
        row: 'base-table-row',
        cell: 'base-table-cell',
    },
};

export function mergeWithDefaultConfig(userConfig: TableConfig): TableConfig {
    const merged: TableConfig = {
        columns: userConfig.columns,
        features: {
            ...DEFAULT_TABLE_CONFIG.features,
            ...userConfig.features,
        } as any,
        styles: {
            ...DEFAULT_TABLE_CONFIG.styles,
            ...userConfig.styles,
        },
        classes: {
            ...DEFAULT_TABLE_CONFIG.classes,
            ...userConfig.classes,
        },
    };

    // Глубокое слияние для features
    if (userConfig.features) {
        if (userConfig.features.infiniteScroll) {
            merged.features!.infiniteScroll =
                typeof userConfig.features.infiniteScroll === 'boolean'
                    ? { enabled: userConfig.features.infiniteScroll, pageSize: 50, loadThreshold: 10 }
                    : {
                          ...(DEFAULT_TABLE_CONFIG.features!.infiniteScroll as InfiniteScrollConfig),
                          ...userConfig.features.infiniteScroll,
                      };
        }

        if (userConfig.features.rowSelection) {
            merged.features!.rowSelection =
                typeof userConfig.features.rowSelection === 'boolean'
                    ? { enabled: userConfig.features.rowSelection, mode: 'multiple' }
                    : {
                          ...(DEFAULT_TABLE_CONFIG.features!.rowSelection as SelectionConfig),
                          ...userConfig.features.rowSelection,
                      };
        }

        if (userConfig.features.sorting) {
            merged.features!.sorting =
                typeof userConfig.features.sorting === 'boolean'
                    ? { enabled: userConfig.features.sorting }
                    : { ...(DEFAULT_TABLE_CONFIG.features!.sorting as SortingConfig), ...userConfig.features.sorting };
        }

        if (userConfig.features.filtering) {
            merged.features!.filtering =
                typeof userConfig.features.filtering === 'boolean'
                    ? { enabled: userConfig.features.filtering }
                    : {
                          ...(DEFAULT_TABLE_CONFIG.features!.filtering as FilteringConfig),
                          ...userConfig.features.filtering,
                      };
        }
    }

    return merged;
}
