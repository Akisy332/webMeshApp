import time
from src.services.connection_service import ConnectionService
from src.utils.logger import log_message
from config.settings import settings

def start_health_check():
    while True:
        try:
            # Проверяем активные соединения
            modules = ConnectionService.get_connected_modules()
            active_count = len([m for m in modules if m.get('status') == 'connected'])
            
            log_message('DEBUG', f"Health check: {active_count} active connections")
            
        except Exception as e:
            log_message('ERROR', f"Health check error: {e}")
            
        time.sleep(30)  # Каждые 30 секунд