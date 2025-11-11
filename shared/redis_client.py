# shared/redis_client.py
import redis
import json
import logging
import os
from typing import Any, Dict, Optional, Callable
import time

logger = logging.getLogger('redis-client')

class RedisClient:
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL', 'redis://redis-service:6379/0')
        self.client = None
        self._connect()
    
    def _connect(self):
        """Установка соединения с Redis"""
        max_retries = 3
        for attempt in range(max_retries):
            try:
                self.client = redis.Redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True,
                    health_check_interval=30
                )
                # Проверяем соединение
                self.client.ping()
                logger.info("Redis connection established")
                return
            except Exception as e:
                logger.warning(f"Redis connection attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2)
                else:
                    logger.error("All Redis connection attempts failed")
                    self.client = None
    
    def is_connected(self) -> bool:
        """Проверка соединения с Redis"""
        try:
            return self.client is not None and self.client.ping()
        except:
            return False
    
    def publish(self, channel: str, message: Dict[str, Any]) -> bool:
        """Публикация сообщения в канал"""
        try:
            if not self.is_connected():
                self._connect()
                if not self.is_connected():
                    logger.error("Cannot publish - no Redis connection")
                    return False

            message_json = json.dumps(message, ensure_ascii=False)

            # Redis publish возвращает КОЛИЧЕСТВО подписчиков
            subscribers_count = self.client.publish(channel, message_json)

            logger.info(f"Published to {channel}: {subscribers_count} subscribers")

            # УСПЕХ: сообщение доставлено (даже если подписчиков нет)
            # Но логируем предупреждение если никто не слушает
            if subscribers_count == 0:
                logger.warning(f"Message published to '{channel}' but no active subscribers")

            return True  # Сообщение успешно опубликовано в Redis

        except Exception as e:
            logger.error(f"Redis publish error: {e}")
            return False
    
    def subscribe(self, channel: str, callback: Callable[[Dict[str, Any]], None]):
        """Подписка на канал (для использования в отдельных потоках)"""
        try:
            if not self.is_connected():
                self._connect()
                if not self.is_connected():
                    return None
            
            pubsub = self.client.pubsub()
            pubsub.subscribe(**{channel: callback})
            
            # Запускаем в отдельном потоке
            thread = pubsub.run_in_thread(sleep_time=0.001)
            logger.info(f"Subscribed to channel: {channel}")
            return thread
        except Exception as e:
            logger.error(f"Redis subscribe error: {e}")
            return None
    
    def listen_messages(self, channel: str, timeout: int = 1):
        """Слушатель сообщений (для синхронного использования)"""
        try:
            logger.info(f"LISTEN_MESSAGES: Starting to listen on channel '{channel}'")

            if not self.is_connected():
                self._connect()
                if not self.is_connected():
                    logger.error("LISTEN_MESSAGES: No Redis connection")
                    return

            pubsub = self.client.pubsub()
            pubsub.subscribe(channel)
            logger.info(f"LISTEN_MESSAGES: Subscribed to {channel}")

            # Пропускаем subscribe сообщение
            subscribe_msg = pubsub.get_message(timeout=timeout)
            logger.info(f"LISTEN_MESSAGES: Subscribe message: {subscribe_msg}")

            while True:
                message = pubsub.get_message(timeout=timeout)
                logger.debug(f"LISTEN_MESSAGES: Raw message: {message}")

                if message and message['type'] == 'message':
                    try:
                        data = json.loads(message['data'])
                        logger.info(f"LISTEN_MESSAGES: Parsed message type: {data.get('type')}")
                        yield data
                    except json.JSONDecodeError as e:
                        logger.error(f"LISTEN_MESSAGES: JSON decode error: {e}")
                elif message:
                    logger.debug(f"LISTEN_MESSAGES: Other message type: {message['type']}")

        except Exception as e:
            logger.error(f"LISTEN_MESSAGES: Error: {e}")
            yield from []

# Глобальный экземпляр
_redis_client = None

def get_redis_client() -> RedisClient:
    """Получение глобального экземпляра Redis клиента"""
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisClient()
    return _redis_client