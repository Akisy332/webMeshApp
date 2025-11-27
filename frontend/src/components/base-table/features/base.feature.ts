// features/base.feature.ts
import { BaseTableComponent } from '../base-table-component';

export abstract class TableFeature {
    protected table: BaseTableComponent<any>;
    protected name: string;

    constructor(table: BaseTableComponent<any>, name: string) {
        this.table = table;
        this.name = name;
    }

    abstract enable(config: any): void;
    abstract disable(): void;

    protected emitEvent(event: string, data: any): void {
        this.table.emitFeatureEvent(this.name, event, data);
    }
}
