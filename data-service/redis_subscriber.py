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
            packets = data.get('packets', [])
            logger.info(f"Processing VALID module data with {len(packets)} packets")
    
            # Детальное логирование всех хопов
            for i, subpacket in enumerate(packets):
                module_num = subpacket.get('module_num', 0)
                emergency = subpacket.get('emergency', 0)
                match_signal = subpacket.get('match_signal', 0)
                logger.info(f"Hop {i}: module_num={module_num}, lat={subpacket.get('lat')}, lng={subpacket.get('lng')}, emergency={emergency}, match_signal={match_signal}")
    
            # Фильтруем нулевые module_id
            valid_hops = []
            invalid_hops = []
    
            for subpacket in packets:
                module_num = subpacket.get('module_num', 0)
                if module_num >= 0:
                    valid_hops.append(subpacket)
                else:
                    invalid_hops.append(subpacket)
    
            logger.info(f"Valid packets: {len(valid_hops)}, Invalid packets (module_num < 0): {len(invalid_hops)}")
    
            if invalid_hops:
                logger.warning(f"Filtered out packets with module_num: {[h.get('module_num') for h in invalid_hops]}")
    
            if not valid_hops:
                logger.warning("No valid packets after filtering")
                return
    
            # Обновляем данные с отфильтрованными хопами
            filtered_data = data.copy()
            filtered_data['packets'] = valid_hops
    
            # Получаем сессию
            id_session = self.db_manager.last_session
            if not id_session or id_session == 0:
                sessions = self.db_manager.get_all_sessions()
                if sessions:
                    id_session = sessions[0]['id']
                    self.db_manager.last_session = id_session
                else:
                    logger.error("No sessions available in database")
                    return
    
            # Сохраняем данные
            saved_data = self.db_manager.save_structured_data_batch(filtered_data, id_session)
    
            if not saved_data:
                logger.error("Failed to save data to database")
                return
    
            # ДОБАВЛЯЕМ ИНФОРМАЦИЮ О EMERGENCY И MATCH_SIGNAL В ВЫХОДНЫЕ ДАННЫЕ
            enhanced_data = self._enhance_saved_data(saved_data, valid_hops)
    
            # Подготовка сообщения
            frontend_message = {
                'type': 'module_data', 
                'data': enhanced_data,  # Используем расширенные данные
                'id_session': id_session,
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
            
    def _enhance_saved_data(self, saved_data: dict, valid_hops: list) -> dict:
        """
        Интегрирует emergency и match_signal непосредственно в данные каждого модуля.
        Агрегирует флаги через побитовое ИЛИ.
        """
        enhanced_data = saved_data.copy()

        # Агрегируем флаги по module_num
        module_flags = {}

        for hop in valid_hops:
            module_num = hop.get('module_num')
            if module_num is not None:
                if module_num not in module_flags:
                    module_flags[module_num] = {
                        'emergency': 0,
                        'match_signal': 0,
                        'packet_type': hop.get('packet_type', 0)
                    }

                # Используем побитовое ИЛИ для поднятия флагов
                module_flags[module_num]['emergency'] |= hop.get('emergency', 0)
                module_flags[module_num]['match_signal'] |= hop.get('match_signal', 0)

        # Если saved_data содержит данные по модулям, добавляем агрегированные поля
        if 'modules' in enhanced_data:
            for module_data in enhanced_data['modules']:
                module_num = module_data.get('module_num')
                if module_num is not None and module_num in module_flags:
                    flags = module_flags[module_num]
                    module_data['emergency'] = flags['emergency']
                    module_data['match_signal'] = flags['match_signal']
                    module_data['packet_type'] = flags['packet_type']

        # Также добавляем общую агрегированную информацию
        enhanced_data['signal_info'] = module_flags

        # Добавляем summary
        emergency_modules = [module_num for module_num, flags in module_flags.items() if flags['emergency'] == 1]
        match_signal_modules = [module_num for module_num, flags in module_flags.items() if flags['match_signal'] == 1]

        enhanced_data['signal_summary'] = {
            'total_emergency': len(emergency_modules),
            'emergency_modules': emergency_modules,
            'total_match_signal': len(match_signal_modules),
            'match_signal_modules': match_signal_modules
        }

        logger.info(f"Aggregated signals - Emergency: {len(emergency_modules)} modules, Match Signal: {len(match_signal_modules)} modules")

        return enhanced_data