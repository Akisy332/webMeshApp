// Класс EventManager
function EventManager() {
  this.listeners = {};
}

EventManager.prototype = {
  on: function(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },
  
  off: function(event, callback) {
    if (!this.listeners[event]) return;
    
    this.listeners[event] = this.listeners[event].filter(
      listener => listener !== callback
    );
  },
  
  emit: function(event, data) {
    if (!this.listeners[event]) return;
    
    this.listeners[event].forEach(listener => {
      listener(data);
    });
  }
};

// Создаем глобальный экземпляр
if (!window.eventManager) {
  window.eventManager = new EventManager();
}