// features/feature-manager.ts
import { TableFeature } from './base.feature';

export class TableFeatureManager {
    private features: Map<string, TableFeature> = new Map();
    private enabledFeatures: Set<string> = new Set();

    registerFeature(name: string, feature: TableFeature): void {
        this.features.set(name, feature);
    }

    enableFeature(name: string, config: any = {}): void {
        const feature = this.features.get(name);
        if (feature && !this.enabledFeatures.has(name)) {
            feature.enable(config);
            this.enabledFeatures.add(name);
        }
    }

    disableFeature(name: string): void {
        const feature = this.features.get(name);
        if (feature && this.enabledFeatures.has(name)) {
            feature.disable();
            this.enabledFeatures.delete(name);
        }
    }

    isFeatureEnabled(name: string): boolean {
        return this.enabledFeatures.has(name);
    }

    getFeature<T extends TableFeature>(name: string): T | undefined {
        return this.features.get(name) as T;
    }

    destroy(): void {
        this.enabledFeatures.forEach((featureName) => {
            this.disableFeature(featureName);
        });
        this.features.clear();
        this.enabledFeatures.clear();
    }
}
