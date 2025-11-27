// Базовый класс для всех компонентов
export abstract class BaseComponent {
    protected element: HTMLElement;
    protected isInitialized = false;

    constructor(containerId: string) {
        const element = document.getElementById(containerId);
        if (!element) {
            throw new Error(`Element with id "${containerId}" not found`);
        }
        this.element = element;

        // Автоматически инициализируем компонент
        this.init().catch((error) => {
            console.error(`Failed to initialize component: ${error}`);
        });
    }

    protected async init(): Promise<void> {
        if (this.isInitialized) return;

        await this.waitForDependencies();
        this.render();
        this.bindEvents();
        this.isInitialized = true;

        console.log(`${this.constructor.name} initialized successfully`);
    }

    protected abstract render(): void;
    protected abstract bindEvents(): void;

    protected async waitForDependencies(): Promise<void> {
        // Ожидание готовности DOM
        if (document.readyState === 'loading') {
            return new Promise<void>((resolve) => {
                document.addEventListener('DOMContentLoaded', () => resolve());
            });
        }
        return Promise.resolve();
    }

    public destroy(): void {
        this.isInitialized = false;
    }

    // Вспомогательные методы
    protected querySelector<T extends HTMLElement>(selector: string): T | null {
        return this.element.querySelector(selector);
    }

    protected querySelectorAll<T extends HTMLElement>(selector: string): NodeListOf<T> {
        return this.element.querySelectorAll(selector);
    }

    protected addClass(className: string): void {
        this.element.classList.add(className);
    }

    protected removeClass(className: string): void {
        this.element.classList.remove(className);
    }

    public getElement(): HTMLElement {
        return this.element;
    }
}
