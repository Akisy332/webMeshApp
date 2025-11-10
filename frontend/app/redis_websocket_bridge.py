# frontend/app/redis_websocket_bridge.py
import threading
import logging
import json
import time

logger = logging.getLogger('frontend-redis-bridge')

class RedisWebSocketBridge:
    def __init__(self, socketio):
        self.socketio = socketio
        self.redis_client = None
        self.running = False
        self.thread = None
        self._initialize_redis()
    
    def _initialize_redis(self):
        """Ленивая инициализация Redis клиента"""
        try:
            # Пробуем импортировать и инициализировать Redis
            import redis
            redis_url = 'redis://redis-service:6379/0'
            
            self.redis_client = redis.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )
            
            # Проверяем соединение
            self.redis_client.ping()
            logger.info("Redis client initialized for WebSocket bridge")
            
        except Exception as e:
            logger.error(f"Failed to initialize Redis client: {e}")
            self.redis_client = None
    
    def is_connected(self):
        """Проверка соединения с Redis"""
        try:
            return self.redis_client is not None and self.redis_client.ping()
        except:
            return False
    
    def start(self):
        """Запуск моста Redis-WebSocket"""
        if self.running:
            return
        
        if not self.is_connected():
            logger.error("Cannot start Redis-WebSocket bridge - no Redis connection")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._listen_redis, daemon=True)
        self.thread.start()
        logger.info("Redis-WebSocket bridge started")
    
    def stop(self):
        """Остановка моста"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("Redis-WebSocket bridge stopped")
    
    def _listen_redis(self):
        """Прослушивание Redis и отправка через WebSocket"""
        retry_count = 0
        max_retries = 5
        
        while self.running and retry_count < max_retries:
            try:
                logger.info("Listening for Redis messages on channel 'frontend_updates'")
                
                pubsub = self.redis_client.pubsub()
                pubsub.subscribe('frontend_updates')
                
                # Пропускаем subscribe сообщение
                pubsub.get_message(timeout=1.0)
                
                while self.running:
                    message = pubsub.get_message(timeout=1.0, ignore_subscribe_messages=True)
                    
                    if message and message['type'] == 'message':
                        try:
                            data = json.loads(message['data'])
                            self._send_to_websocket(data)
                            retry_count = 0  # Сброс счетчика при успешном получении
                        except json.JSONDecodeError as e:
                            logger.error(f"JSON decode error: {e}")
                    
                    # Проверяем соединение каждые 10 сообщений
                    if not self.is_connected():
                        logger.warning("Redis connection lost, reconnecting...")
                        break
                        
            except Exception as e:
                retry_count += 1
                logger.error(f"Redis listener error (attempt {retry_count}/{max_retries}): {e}")
                
                if self.running and retry_count < max_retries:
                    time.sleep(5)  # Пауза перед повторной попыткой
                else:
                    logger.error("Max retries exceeded, stopping Redis listener")
                    break
        
        if self.running:
            logger.error("Redis listener stopped unexpectedly")
    
    def _send_to_websocket(self, message: dict):
        """Отправка сообщения через WebSocket"""
        try:
            message_type = message.get('type')
            
            if message_type == 'module_update':
                data = message.get('data', {})
                self.socketio.emit('moduleUpdate', data)
                logger.debug(f"📤 WebSocket emit: moduleUpdate for {len(data.get('hops', []))} modules")
            else:
                self.socketio.emit('dataUpdate', message)
                logger.debug(f"📤 WebSocket emit: dataUpdate - {message_type}")
                
        except Exception as e:
            logger.error(f"WebSocket emit error: {e}")

# Альтернативная простая версия для отправки данных
def send_new_module_data(data):
    """Заглушка для обратной совместимости"""
    logger.warning("Direct WebSocket emission deprecated, use Redis instead")