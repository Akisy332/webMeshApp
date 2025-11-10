# data-service/redis_subscriber.py
import threading
import logging
from shared.redis_client import get_redis_client
from models_postgres import get_postgres_manager
from datetime import datetime

logger = logging.getLogger("data-service-redis")

class RedisSubscriber:
    def __init__(self):
        self.redis_client = get_redis_client()
        self.db_manager = get_postgres_manager()
        self.running = False
        self.thread = None
        
        # Логируем состояние Redis
        if not self.redis_client:
            logger.error("❌ REDIS CLIENT CREATION FAILED - is None")
        else:
            logger.info(f"✅ Redis client created: {type(self.redis_client)}")
            if hasattr(self.redis_client, 'is_connected'):
                logger.info(f"✅ Redis connected: {self.redis_client.is_connected()}")
    
    def start(self):
        """Запуск подписчика Redis"""
        if self.running:
            return
        
        if not self.redis_client.is_connected():
            logger.error("❌ Cannot start Redis subscriber - no Redis connection")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._listen_messages, daemon=True)
        self.thread.start()
        logger.info("✅ Redis subscriber started")
    
    def stop(self):
        """Остановка подписчика Redis"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("❌ Redis subscriber stopped")
    
    def _listen_messages(self):
        """Прослушивание сообщений из Redis"""
        while self.running:
            try:
                logger.info("🔍 Listening for Redis messages on channel 'module_updates'")

                for message in self.redis_client.listen_messages('module_updates'):
                    if not self.running:
                        break
                    
                    logger.info(f"📨 RECEIVED Redis message type: {message.get('type', 'unknown')}")
                    logger.info(f"📨 Message keys: {list(message.keys())}")

                    # Логируем структуру данных
                    if 'data' in message:
                        data = message['data']
                        logger.info(f"📨 Data keys: {list(data.keys()) if data else 'None'}")
                        if data and 'hops' in data:
                            logger.info(f"📨 Hops count in message: {len(data['hops'])}")

                    self._process_message(message)

            except Exception as e:
                logger.error(f"❌ Redis listener error: {e}")
                import time
                time.sleep(5)
    
    def _process_message(self, message: dict):
        """Обработка входящего сообщения"""
        try:
            message_type = message.get('type')

            if message_type == 'module_data':
                data = message.get('data', {})
                # Логируем сырые данные
                hops_count = len(data.get('hops', []))
                logger.info(f"📨 Raw Redis message: {hops_count} hops, packet_number: {data.get('packet_number')}")

                self._process_module_data(data)
            else:
                logger.warning(f"⚠️ Unknown message type: {message_type}")
            
        except Exception as e:
            logger.error(f"❌ Error processing Redis message: {e}")
    
    def _process_module_data(self, data: dict):
        """Обработка данных модуля"""
        try:
            hops = data.get('hops', [])
            logger.info(f"🔄 Processing module data with {len(hops)} hops")

            # Детальное логирование всех хопов
            for i, hop in enumerate(hops):
                module_num = hop.get('module_num', 0)
                logger.info(f"Hop {i}: module_num={module_num}, lat={hop.get('lat')}, lng={hop.get('lng')}")

            # Фильтруем нулевые module_id
            valid_hops = []
            invalid_hops = []

            for hop in hops:
                module_num = hop.get('module_num', 0)
                if module_num >= 0:
                    valid_hops.append(hop)
                else:
                    invalid_hops.append(hop)

            logger.info(f"📋 Valid hops: {len(valid_hops)}, Invalid hops (module_num <= 0): {len(invalid_hops)}")

            if invalid_hops:
                logger.warning(f"⚠️ Filtered out hops with module_num: {[h.get('module_num') for h in invalid_hops]}")

            if not valid_hops:
                logger.warning("⚠️ No valid hops after filtering")
                return

            # Обновляем данные с отфильтрованными хопами
            filtered_data = data.copy()
            filtered_data['hops'] = valid_hops

            # Получаем сессию
            session_id = self.db_manager.last_session
            if not session_id or session_id == 0:
                sessions = self.db_manager.get_all_sessions()
                if sessions:
                    session_id = sessions[0]['id']
                    self.db_manager.last_session = session_id
                else:
                    logger.error("❌ No sessions available in database")
                    return

            # Сохраняем данные
            saved_data = self.db_manager.save_structured_data_batch(filtered_data, session_id)

            if not saved_data:
                logger.error("❌ Failed to save data to database")
                return

            # Отправляем во фронтенд
            frontend_message = {
                'type': 'module_update', 
                'data': saved_data,
                'session_id': session_id,
                'timestamp': data.get('timestamp')
            }

            success = self.redis_client.publish('frontend_updates', frontend_message)
            if success:
                logger.info(f"📤 Data forwarded to frontend for session {session_id}")
            else:
                logger.warning("⚠️ Failed to forward data to frontend")

        except Exception as e:
            logger.error(f"❌ Error processing module data: {e}")

    def _save_structured_data(self, hop: dict, original_data: dict, session_id: int) -> bool:
        """Сохранение структурированных данных напрямую в БД"""
        try:
            # Подготавливаем данные для вставки
            module_id = hop.get('module_num', 0)
            lat = hop.get('lat', 0)
            lon = hop.get('lng', 0)  # Обратите внимание: lng -> lon
            alt = hop.get('altitude', 0)

            # Проверяем GPS данные
            gps_ok = lat != 0 and lon != 0

            # Временные метки
            datetime_str = original_data.get('timestamp', datetime.now().isoformat())
            datetime_obj = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
            datetime_unix = int(datetime_obj.timestamp())

            # Обеспечиваем существование модуля
            self.db_manager._ensure_module_exists(module_id)

            # Вставляем данные напрямую
            data_id = self.db_manager._insert_data(
                module_id=module_id,
                id_session=session_id,
                message_type_code=0,  # Mesh по умолчанию
                datetime_str=datetime_str,
                datetime_unix=datetime_unix,
                lat_val=lat if gps_ok else None,
                lon_val=lon if gps_ok else None,
                alt_val=alt,
                gps_ok=gps_ok,
                message_number=original_data.get('packet_number', 1),
                rssi=None,  # Эти поля могут быть добавлены при необходимости
                snr=None,
                source=None,
                jumps=None
            )

            return data_id is not None

        except Exception as e:
            logger.error(f"❌ Error saving structured data: {e}")
            return False

# Глобальный экземпляр
_redis_subscriber = None

def get_redis_subscriber() -> RedisSubscriber:
    global _redis_subscriber
    if _redis_subscriber is None:
        _redis_subscriber = RedisSubscriber()
    return _redis_subscriber