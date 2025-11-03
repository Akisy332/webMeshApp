import time
import select
import threading
from collections import deque
from src.utils.logger import log_message

class ConnectionService:
    _provider_connections = {}
    _connected_modules = []
    _parsed_messages = deque(maxlen=1000)  # История распаршенных сообщений
    _lock = threading.RLock()
    
    @staticmethod
    def is_connection_alive(conn):
        try:
            ready_to_read, ready_to_write, in_error = select.select([], [conn], [conn], 0.1)
            if conn in ready_to_write and conn not in in_error:
                return True
            return False
        except:
            return False

    @staticmethod
    def add_provider(address, connection):
        with ConnectionService._lock:
            ConnectionService._provider_connections[address] = connection

    @staticmethod
    def remove_provider(address):
        with ConnectionService._lock:
            if address in ConnectionService._provider_connections:
                del ConnectionService._provider_connections[address]

    @staticmethod
    def get_provider_connection(address):
        with ConnectionService._lock:
            return ConnectionService._provider_connections.get(address)

    @staticmethod
    def add_connected_module(module_info):
        with ConnectionService._lock:
            ConnectionService._connected_modules = [
                m for m in ConnectionService._connected_modules 
                if m.get('address') != module_info['address']
            ]
            ConnectionService._connected_modules.append(module_info)

    @staticmethod
    def update_module_activity(address):
        with ConnectionService._lock:
            for module in ConnectionService._connected_modules:
                if module.get('address') == address:
                    module['last_activity'] = time.time()
                    break

    @staticmethod
    def update_module_status(address, status):
        with ConnectionService._lock:
            for module in ConnectionService._connected_modules:
                if module.get('address') == address:
                    module['status'] = status
                    module['last_activity'] = time.time()
                    break

    @staticmethod
    def get_connected_modules():
        with ConnectionService._lock:
            current_time = time.time()
            active_modules = [
                module for module in ConnectionService._connected_modules 
                if current_time - module.get('last_activity', 0) < 60
            ]
            ConnectionService._connected_modules[:] = active_modules
            return active_modules.copy()

    @staticmethod
    def get_provider_connections_count():
        with ConnectionService._lock:
            return len(ConnectionService._provider_connections)

    @staticmethod
    def add_parsed_message(parsed_data):
        """Добавление распаршенного сообщения для веб-интерфейса"""
        with ConnectionService._lock:
            ConnectionService._parsed_messages.append(parsed_data)

    @staticmethod
    def get_parsed_messages(limit=100):
        """Получение последних распаршенных сообщений"""
        with ConnectionService._lock:
            messages = list(ConnectionService._parsed_messages)
            return messages[-limit:] if limit else messages

    @staticmethod
    def clear_parsed_messages():
        """Очистка истории распаршенных сообщений"""
        with ConnectionService._lock:
            ConnectionService._parsed_messages.clear()