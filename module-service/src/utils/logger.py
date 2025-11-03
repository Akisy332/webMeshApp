import logging
import os
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from datetime import datetime
from collections import deque
from config.settings import settings

all_messages = deque(maxlen=10000)

def ensure_log_directory():
    """Создает директорию для логов если её нет"""
    if not os.path.exists(settings.LOG_DIR):
        os.makedirs(settings.LOG_DIR, exist_ok=True)

def setup_logging():
    """Настройка логирования с ротацией файлов"""
    ensure_log_directory()
    
    # Основной лог файл с ротацией по размеру
    log_file = os.path.join(settings.LOG_DIR, 'provider-service.log')
    error_log_file = os.path.join(settings.LOG_DIR, 'provider-service-error.log')
    
    # Форматтер для логов
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Основной handler для всех логов
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=10,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(getattr(logging, settings.LOG_LEVEL))
    
    # Handler для ошибок (только ERROR и выше)
    error_handler = RotatingFileHandler(
        error_log_file,
        maxBytes=5 * 1024 * 1024,  # 5MB
        backupCount=5,
        encoding='utf-8'
    )
    error_handler.setFormatter(formatter)
    error_handler.setLevel(logging.ERROR)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(getattr(logging, settings.LOG_LEVEL))
    
    # Настройка root logger
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, settings.LOG_LEVEL))
    logger.addHandler(file_handler)
    logger.addHandler(error_handler)
    logger.addHandler(console_handler)
    
    # Убираем логи от сторонних библиотек
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)

def log_message(level, message, module_info=None):
    """Универсальная функция логирования"""
    log_entry = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
        'level': level,
        'message': message,
        'module': module_info
    }
    
    logger = logging.getLogger(__name__)
    
    # Логируем в соответствующий файл
    if level == 'INFO':
        logger.info(f"{module_info or 'SYSTEM'} - {message}")
    elif level == 'WARNING':
        logger.warning(f"{module_info or 'SYSTEM'} - {message}")
    elif level == 'ERROR':
        logger.error(f"{module_info or 'SYSTEM'} - {message}")
    elif level == 'DEBUG':
        logger.debug(f"{module_info or 'SYSTEM'} - {message}")
    
    # Сохраняем для веб-интерфейса (только в памяти)
    all_messages.append(log_entry)

def get_all_logs():
    """Возвращает все логи для отображения в веб-интерфейсе"""
    return list(all_messages)

def get_log_files_info():
    """Возвращает информацию о log файлах"""
    ensure_log_directory()
    log_files = []
    
    for filename in os.listdir(settings.LOG_DIR):
        if filename.endswith('.log'):
            filepath = os.path.join(settings.LOG_DIR, filename)
            stat = os.stat(filepath)
            log_files.append({
                'name': filename,
                'size': stat.st_size,
                'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
    
    return log_files