import threading
import time
import requests
import json
from queue import Queue
from src.database.models import get_db_session, ProviderMessage
from src.utils.logger import log_message
from config.settings import settings

class DBClient:
    def __init__(self):
        self.message_queue = Queue()
        self.batch_buffer = []
        self.is_running = False
        self.thread = None
        self.stats = {
            'sent_messages': 0,
            'failed_messages': 0,
            'last_success': None,
            'db_errors': 0
        }
        
    def start(self):
        self.is_running = True
        self.thread = threading.Thread(target=self._batch_processor, daemon=True)
        self.thread.start()
        log_message('INFO', "DB Client started with PostgreSQL")
        
    def stop(self):
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=5)
        log_message('INFO', "DB Client stopped")
        
    def send_message(self, message_data):
        self.message_queue.put(message_data)
        
    def _batch_processor(self):
        last_flush = time.time()
        
        while self.is_running:
            try:
                current_time = time.time()
                
                # Собираем сообщения из очереди
                while not self.message_queue.empty():
                    try:
                        message = self.message_queue.get_nowait()
                        self.batch_buffer.append(message)
                        self.message_queue.task_done()
                    except:
                        break
                
                # Проверяем условия для отправки батча
                if (len(self.batch_buffer) >= settings.BATCH_SIZE or 
                    (current_time - last_flush) >= settings.FLUSH_INTERVAL):
                    
                    if self.batch_buffer:
                        self._save_batch_to_postgres(self.batch_buffer.copy())
                        self.batch_buffer.clear()
                        last_flush = current_time
                
                time.sleep(0.1)
                
            except Exception as e:
                log_message('ERROR', f"Batch processor error: {e}")
                time.sleep(1)
                
    def _save_batch_to_postgres(self, batch):
        """Сохранение батча в PostgreSQL"""
        if not batch:
            return
            
        db = get_db_session()
        try:
            for message_data in batch:
                try:
                    # Создаем запись в БД
                    db_message = ProviderMessage(
                        provider_address=message_data['provider_address'],
                        hex_data=message_data['hex_data'],
                        packet_number=message_data['packet_number'],
                        parsed_data=message_data.get('parsed_data', {})
                    )
                    db.add(db_message)
                    
                except Exception as e:
                    log_message('ERROR', f"Error creating DB record: {e}")
                    self.stats['db_errors'] += 1
                    continue
            
            # Коммитим всю транзакцию
            db.commit()
            self.stats['sent_messages'] += len(batch)
            self.stats['last_success'] = time.time()
            log_message('DEBUG', f"Batch saved to PostgreSQL: {len(batch)} messages")
            
        except Exception as e:
            db.rollback()
            log_message('ERROR', f"PostgreSQL commit error: {e}")
            self.stats['failed_messages'] += len(batch)
            self.stats['db_errors'] += 1
            
        finally:
            db.close()
        
    def get_stats(self):
        return self.stats.copy()