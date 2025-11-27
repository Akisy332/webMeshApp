type EventCallback = (data?: any) => void;

export class EventBus {
    private listeners: Record<string, EventCallback[]> = {};

    on(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) return;

        this.listeners[event] = this.listeners[event].filter((listener) => listener !== callback);
    }

    emit(event: string, data?: any): void {
        if (!this.listeners[event]) return;

        this.listeners[event].forEach((listener) => {
            try {
                listener(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }
}

// TODO: Глобальный экземпляр (временно для совместимости)
export const eventBus = new EventBus();
