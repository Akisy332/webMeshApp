# data-service/redis_subscriber.py
import threading
import logging
from shared.redis_client import get_redis_client
from datetime import datetime

logger = logging.getLogger("data-service-redis")

class RedisSubscriber:
    def __init__(self, db_manager):
        self.redis_client = get_redis_client()
        self.db_manager = db_manager
        self.running = False
        self.thread = None
        
        logger.info(f"RedisSubscriber initialized with shared DB Manager: {id(self.db_manager)}")
        
        # Логируем состояние Redis
        if not self.redis_client:
            logger.error("REDIS CLIENT CREATION FAILED - is None")
        else:
            logger.info(f"Redis client created")
            if hasattr(self.redis_client, 'is_connected'):
                logger.info(f"Redis connected: {self.redis_client.is_connected()}")
    
    def start(self):
        """Запуск подписчика Redis"""
        if self.running:
            return
        
        if not self.redis_client.is_connected():
            logger.error("Cannot start Redis subscriber - no Redis connection")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._listen_messages, daemon=True)
        self.thread.start()
        logger.info("Redis subscriber started")
    
    def stop(self):
        """Остановка подписчика Redis"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("Redis subscriber stopped")
    
    def _listen_messages(self):
        """Прослушивание сообщений из Redis"""
        while self.running:
            try:
                logger.info("Listening for Redis messages on channels: 'module_data', 'corrupted_data'")

                # Слушаем оба канала поочередно
                for message in self.redis_client.listen_messages('module_data', timeout=1):
                    if not self.running:
                        break
                    logger.info(f"RECEIVED valid data message")
                    self._process_valid_message(message)

                for message in self.redis_client.listen_messages('corrupted_data', timeout=1):
                    if not self.running:
                        break
                    logger.warning(f"RECEIVED corrupted data message")
                    self._process_corrupted_message(message)

            except Exception as e:
                logger.error(f"Redis listener error: {e}")
                import time
                time.sleep(5)
    
    def _process_valid_message(self, message: dict):
        """Обработка ВАЛИДНЫХ данных"""
        try:
            message_type = message.get('type')

            if message_type == 'valid_module_data':
                data = message.get('data', {})
                self._process_valid_module_data(data)
            else:
                logger.warning(f"Unknown valid message type: {message_type}")

        except Exception as e:
            logger.error(f"Error processing valid message: {e}")

    def _process_corrupted_message(self, message: dict):
        """Обработка НЕВАЛИДНЫХ/битых данных"""
        try:
            message_type = message.get('type')
            data = message.get('data', {})
            error_reason = message.get('error_reason', 'unknown_error')

            logger.warning(f"Processing corrupted data, reason: {error_reason}")

            # Сохраняем в отдельную таблицу битых данных
            corrupted_record = {
                'raw_hex': data.get('raw_hex', ''),
                'parsed_attempt': data.get('parsed_attempt', {}),
                'errors': data.get('errors', []),
                'error_reason': error_reason,
                'provider': data.get('provider', ''),
                'packet_number': data.get('packet_number', 0),
                'timestamp': data.get('timestamp', datetime.now().isoformat()),
                'message_type': message_type
            }

            # Сохраняем в БД битых данных
            # self.db_manager.save_corrupted_data(corrupted_record)

            logger.info(f"Corrupted data saved to database: {error_reason}")

        except Exception as e:
            logger.error(f"Error processing corrupted data: {e}")
    
    def _process_valid_module_data(self, data: dict):
        """Обработка ВАЛИДНЫХ данных модуля"""
        try:
            hops = data.get('hops', [])
            logger.info(f"Processing VALID module data with {len(hops)} hops")

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

            logger.info(f"Valid hops: {len(valid_hops)}, Invalid hops (module_num <= 0): {len(invalid_hops)}")

            if invalid_hops:
                logger.warning(f"Filtered out hops with module_num: {[h.get('module_num') for h in invalid_hops]}")

            if not valid_hops:
                logger.warning("No valid hops after filtering")
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
                    logger.error("No sessions available in database")
                    return

            # Сохраняем данные
            saved_data = self.db_manager.save_structured_data_batch(filtered_data, session_id)

            if not saved_data:
                logger.error("Failed to save data to database")
                return

            # Подготовка сообщения
            frontend_message = {
                'type': 'module_data', 
                'data': saved_data,
                'session_id': session_id,
                'timestamp': data.get('timestamp'),
                'test_diagnostic': True
            }

            # Публикация с перехватом исключений
            try:
                success = self.redis_client.publish('frontend_updates', frontend_message)
                logger.info(f"Redis publish() returned: {success} (type: {type(success)})")

                if success is True:
                    logger.info("publish() returned True")
                elif success is False:
                    logger.error("publish() returned False")
                elif isinstance(success, int):
                    logger.info(f"publish() returned integer: {success} subscribers")
                    if success == 0:
                        logger.warning("No subscribers on channel 'frontend_updates'")
                    else:
                        logger.info(f"Message delivered to {success} subscribers")
                else:
                    logger.warning(f"Unexpected return type: {success}")

            except Exception as pub_e:
                logger.error(f"Redis publish() exception: {pub_e}")
                success = False

            if not success:
                logger.warning("Failed to forward valid data to frontend")

        except Exception as e:
            logger.error(f"Error in _process_valid_module_data: {e}")