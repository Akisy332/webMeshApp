
class SocketService {
    constructor() {
        this.socket = io(); // Подключение к серверу
        this.setupEventForwarding();
    }

    // Пересылка событий между Socket.IO и EventBus
    setupEventForwarding() {
        // Сервер -> Клиент
        // this.socket.on('serverEvent', (data) => {
        //     eventBus.emit('serverEvent', data);
        // });

        // // Клиент -> Сервер
        // eventBus.on('clientEvent', (data) => {
        //     this.socket.emit('clientEvent', data);
        // });


        // Слушатели событий
        this.socket.on('connect', () => {
            console.log('✅ Подключено к серверу (ID:', this.socket.id + ')');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Отключено:', reason);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Ошибка подключения:', error.message);
        });

        this.socket.on('reconnect', (attempt) => {
            console.log(`♻️ Переподключение (попытка ${attempt})`);
        });

        this.socket.on('reconnect_attempt', () => {
            console.log('Попытка переподключения...');
        });

        this.socket.on('reconnect_error', (error) => {
            console.error('Ошибка переподключения:', error);
        });

        this.socket.on('reconnect_failed', () => {
            console.error('Переподключение не удалось');
        });
    }

    // Прямые методы для сложных случаев
    joinRoom(roomId) {
        this.socket.emit('joinRoom', roomId);
    }
}

// Создаем глобальный экземпляр
const socketService = new SocketService();

if (!window.socketService) {
    window.socketService = socketService;
}