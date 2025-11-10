from flask_socketio import SocketIO

socketio = SocketIO(cors_allowed_origins="*", ping_interval=25, ping_timeout=5)

def init_socketio(app):
    socketio.init_app(app)
    register_handlers()

def register_handlers():
    """Явная регистрация WebSocket обработчиков"""
    # Импортируем ВНУТРИ функции чтобы избежать циклических импортов
    from app.features.realtime.websockets import add_random_point, send_new_module_data
    # from app.features.realtime.table_websockets import handle_message  # если есть
    
    # Обработчики уже задекорированы @socketio.on в исходных файлах
    # При импорте они автоматически регистрируются
    print("WebSocket handlers registered")