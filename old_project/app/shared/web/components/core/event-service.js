// Класс EventBus
function EventBus() {
    this.listeners = {};
}

EventBus.prototype = {
    on: function (event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    },

    off: function (event, callback) {
        if (!this.listeners[event]) return;

        this.listeners[event] = this.listeners[event].filter(
            listener => listener !== callback
        );
    },

    emit: function (event, data) {
        if (!this.listeners[event]) return;

        this.listeners[event].forEach(listener => {
            listener(data);
        });
    }
};

// Создаем глобальный экземпляр
if (!window.eventBus) {
    window.eventBus = new EventBus();
}