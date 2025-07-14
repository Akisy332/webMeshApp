from flask_socketio import SocketIO

socketio = SocketIO(cors_allowed_origins="*",
                    ping_interval=25,
                    ping_timeout=5,
                    logger=True,            # Логирование Socket.IO
                    engineio_logger=True,   # Детальные логи Engine.IO
                    debug=True,             # Режим отладки Flask
                    )

def init_socketio(app):
    """Инициализация Socket.IO с приложением"""
    socketio.init_app(app)
    register_handlers()

def register_handlers():
    """Динамическая регистрация обработчиков"""
    from app.api.websockets import map, table, services  # Импорт после инициализации
    
    # Альтернативно: автоматический поиск обработчиков
    # через сканирование директории api/websockets/