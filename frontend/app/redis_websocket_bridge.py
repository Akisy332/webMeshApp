# frontend/app/redis_websocket_bridge.py
import threading
import logging
import json
import time
from shared.redis_client import get_redis_client

# Настройка логирования
logging.basicConfig(
    level=getattr(logging, "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

logger = logging.getLogger('frontend-redis-bridge')

class RedisWebSocketBridge:
    def __init__(self, socketio):
        self.socketio = socketio
        self.redis_client = get_redis_client()
        self.running = False
        self.thread = None
        
        logger.info("RedisWebSocketBridge INITIALIZED")
        logger.info(f"Redis connected: {self.is_connected()}")
    
    def start(self):
        """Запуск моста Redis-WebSocket"""
        if self.running:
            logger.warning("🚫 Bridge already running")
            return
        
        if not self.is_connected():
            logger.error("🚫 Cannot start bridge - no Redis connection")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._listen_redis, daemon=True)
        self.thread.start()
        
        logger.info("🎯 Redis-WebSocket bridge STARTED successfully")
        logger.info(f"🎯 Bridge thread alive: {self.thread.is_alive()}")
        logger.info("🎯 Now listening on channel 'frontend_updates'")
        
        # Немедленная проверка подписки
        self._test_subscription()
    
    def _test_subscription(self):
        """Тестирование подписки"""
        try:
            test_msg = {'type': 'bridge_test', 'message': 'Bridge is working!'}
            result = self.redis_client.publish('frontend_updates', test_msg)
            logger.info(f"Bridge test publish result: {result} subscribers")
        except Exception as e:
            logger.error(f"Bridge test failed: {e}")
    
    def is_connected(self):
        """Проверка соединения с Redis"""
        return self.redis_client.is_connected()
    
    
    
    def _listen_redis(self):
        """Прослушивание Redis и отправка через WebSocket"""
        logger.info("🎯 STARTING Redis WebSocket bridge listener")
        
        while self.running:
            try:
                if not self.is_connected():
                    logger.warning("No Redis connection, waiting...")
                    time.sleep(5)
                    continue
                
                logger.info("Redis connected, starting to listen on 'frontend_updates'")
                
                # Счетчик для диагностики
                message_count = 0
                start_time = time.time()
                
                for message in self.redis_client.listen_messages('frontend_updates', timeout=2):
                    if not self.running:
                        break
                    
                    message_count += 1
                    logger.info(f"RECEIVED message #{message_count}: {message.get('type', 'unknown')}")
                    logger.info(f"📦 Message content keys: {list(message.keys())}")
                    
                    self._send_to_websocket(message)
                    
                    # Логируем каждые 10 сообщений или если прошло 30 секунд
                    if message_count % 10 == 0 or time.time() - start_time > 30:
                        logger.info(f"📊 Total messages received: {message_count}")
                        start_time = time.time()
                        
            except Exception as e:
                logger.error(f"Redis listener error: {e}")
                time.sleep(5)
        
        logger.info("🛑 Redis WebSocket bridge listener stopped")
    
    def _send_to_websocket(self, message: dict):
        """Отправка сообщения через WebSocket"""
        try:
            message_type = message.get('type')
            
            if message_type == 'module_data':
                data = message.get('data', {})
                self.socketio.emit('moduleUpdate', data)
                logger.debug(f"WebSocket emit: moduleUpdate for {len(data.get('hops', []))} modules")
            else:
                self.socketio.emit('dataUpdate', message)
                logger.debug(f"WebSocket emit: dataUpdate - {message_type}")
                
        except Exception as e:
            logger.error(f"WebSocket emit error: {e}")

# Альтернативная простая версия для отправки данных
def send_new_module_data(data):
    """Заглушка для обратной совместимости"""
    logger.warning("Direct WebSocket emission deprecated, use Redis instead")