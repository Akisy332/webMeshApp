# frontend/app/__init__.py
from flask import Flask
from flask_socketio import SocketIO
import os
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('frontend')

app = Flask(__name__, 
           static_folder='static',
           template_folder='templates')

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'mysecretkey')

socketio = SocketIO(app, cors_allowed_origins="*", ping_interval=25, ping_timeout=5)

# Инициализация Redis-WebSocket моста (отложенная)
redis_bridge = None

def initialize_redis_bridge():
    """Инициализация Redis моста при первом запросе"""
    global redis_bridge
    if redis_bridge is None:
        try:
            from .redis_websocket_bridge import RedisWebSocketBridge
            redis_bridge = RedisWebSocketBridge(socketio)
            redis_bridge.start()
            logger.info("✅ Redis-WebSocket bridge initialized")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Redis bridge: {e}")

@app.before_request
def before_first_request():
    """Инициализация при первом запросе"""
    if not hasattr(app, 'redis_initialized'):
        initialize_redis_bridge()
        app.redis_initialized = True

# Инициализация маршрутов
from . import routes

@app.route('/health')
def health():
    return "Frontend static server is running"

# WebSocket события
@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')
    socketio.emit('status', {'message': 'Connected to server'})

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