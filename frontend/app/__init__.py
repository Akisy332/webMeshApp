# frontend/app/__init__.py
from flask import Flask
from flask_socketio import SocketIO
import os
import logging
import time

# Настройка логирования
# Настройка логирования

logging.basicConfig(
    level=getattr(logging, "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

logger = logging.getLogger('frontend')

app = Flask(__name__, 
           static_folder='static',
           template_folder='templates')

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'mysecretkey')

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # True в production
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

socketio = SocketIO(app, 
                    cors_allowed_origins="*", 
                    ping_interval=25, 
                    ping_timeout=5,
                    async_mode='threading',
                    manage_session=False)  # Важно для cookies

# Инициализация Redis-WebSocket моста
redis_bridge = None
app_initialized = False

def start_redis_bridge():
    """Запуск Redis моста"""
    global redis_bridge
    if redis_bridge and not redis_bridge.running:
        try:
            logger.info("🔄 Starting Redis bridge...")
            redis_bridge.start()
            logger.info("Redis bridge started successfully")
        except Exception as e:
            logger.error(f"Failed to start Redis bridge: {e}")

def initialize_redis_bridge():
    """Инициализация Redis моста - вызывается один раз при старте"""
    global redis_bridge, app_initialized
    
    if app_initialized:
        return
        
    logger.info("INIT: Starting application initialization...")
    
    try:
        from .redis_websocket_bridge import RedisWebSocketBridge
        redis_bridge = RedisWebSocketBridge(socketio)
        logger.info("INIT: Redis-WebSocket bridge instance created")
        
        # НЕ запускаем автоматически - запустим при первом WebSocket подключении
        start_redis_bridge()
        app_initialized = True
        logger.info("INIT: Application initialization completed")
        
    except Exception as e:
        logger.error(f"INIT: Failed to initialize Redis bridge: {e}")
        app_initialized = True
        



# Инициализация при импорте модуля
logger.info("Module imported - initializing Redis bridge...")
initialize_redis_bridge()

@app.route('/health')
def health():
    return "Frontend static server is running"

@app.route('/debug-bridge')
def debug_bridge():
    """Endpoint для отладки Redis bridge"""
    global redis_bridge
    status = {
        'bridge_exists': redis_bridge is not None,
        'bridge_running': redis_bridge.running if redis_bridge else False,
        'redis_connected': redis_bridge.is_connected() if redis_bridge else False,
    }
    return status

# WebSocket события
@socketio.on('connect')
def handle_connect():
    logger.info('Client connected via WebSocket')
    try:
        socketio.emit('status', {'message': 'Connected to server', 'type': 'connection'})
        
    except Exception as e:
        logger.error(f"Error in connect handler: {e}")

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

@socketio.on('message')
def handle_message(data):
    logger.info(f'Received message: {data}')
    socketio.emit('response', {'message': 'Message received'})

# Обработчик ошибок
@app.errorhandler(404)
def not_found(error):
    return {"error": "Not found"}, 404

@app.errorhandler(500)
def internal_error(error):
    return {"error": "Internal server error"}, 500

# Инициализация маршрутов
from . import routes