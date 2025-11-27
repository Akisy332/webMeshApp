// Глобальные декларации TypeScript для всего приложения

// Bootstrap типы
declare namespace bootstrap {
    class Tooltip {
        constructor(element: Element, options?: any);
        show(): void;
        hide(): void;
        dispose(): void;
        toggle(): void;
    }

    class Modal {
        constructor(element: Element, options?: any);
        show(): void;
        hide(): void;
        toggle(): void;
        dispose(): void;
    }
}

// Глобальные переменные window
interface Window {
    mainApp?: any;
    showNotification?: (message: string, type?: string) => void;
    bootstrap?: typeof bootstrap;
}

// Глобальная переменная bootstrap
declare const bootstrap: typeof bootstrap;
