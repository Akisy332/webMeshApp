import os
import uuid
import socket
import time
from pathlib import Path
from app.models.database import DatabaseManager
from app.api.websockets.services import send_new_module_data

class TCPClientWorker:
    def __init__(self, 
                 on_raw_data_received=None, 
                 on_connection_error=None, 
                 on_status_message=None):
        # Получаем путь к secret.txt (на два уровня выше)
        current_dir = Path(__file__).parent
        secret_path = current_dir.parent.parent / "secret.txt"
        
        # Читаем IP и порт из файла
        self.host, self.port = self._read_server_config(secret_path)
        print(f"Server config: {self.host}:{self.port}")
        
        self.running = True
        self.client_socket = None
        self.device_uuid = self._get_or_create_device_uuid()
        
        # Callback functions
        self.on_raw_data_received = on_raw_data_received
        self.on_connection_error = on_connection_error
        self.on_status_message = on_status_message
        
        self.db_manager = DatabaseManager()


    def _read_server_config(self, file_path):
        """Читает IP и порт из файла конфигурации"""
        try:
            with open(file_path, 'r') as f:
                lines = [line.strip() for line in f.readlines()]
                host = lines[0] if len(lines) > 0 else os.getenv('SERVER_IP', 'localhost')
                port = int(lines[1]) if len(lines) > 1 else 5000
                return host, port
        except Exception as e:
            print(f"Error reading config file: {e}. Using defaults.")
            return os.getenv('SERVER_IP', 'localhost'), 5000

    def _get_or_create_device_uuid(self):
        """Получает или создает UUID устройства и сохраняет его в файл"""
        uuid_file = "device_uuid.txt"
        
        if os.path.exists(uuid_file):
            try:
                with open(uuid_file, "r") as f:
                    return f.read().strip()
            except:
                pass
        
        new_uuid = str(uuid.uuid4())
        try:
            with open(uuid_file, "w") as f:
                f.write(new_uuid)
        except:
            pass
            
        return new_uuid

    def _connect_to_server(self):
        """Подключается к серверу и отправляет UUID устройства"""
        try:
            self.client_socket = socket.socket()
            self.client_socket.connect((self.host, self.port))
            
            self.client_socket.sendall(f"UUID:{self.device_uuid}".encode())
            
            response = self.client_socket.recv(1024).decode()
            print(response)
            if response.startswith("UUID_ACCEPTED"):
                if self.on_status_message:
                    self.on_status_message("Подключение успешно")
                return True
            else:
                if self.on_connection_error:
                    self.on_connection_error("Ошибка идентификации устройства")
                return False
                
        except socket.error as e:
            if self.on_connection_error:
                self.on_connection_error(f"Не удалось подключиться к серверу: {e}")
            return False
        except Exception as e:
            if self.on_connection_error:
                self.on_connection_error(f"Ошибка подключения: {e}")
            return False

    def run(self):
        if not self._connect_to_server():
            return
        
        print(f"Device UUID: {self.device_uuid}")
            
        try:
            buffer = ""
            while self.running:
                self.client_socket.sendall("GET_DATA".encode())
                data = self.client_socket.recv(1024).decode()

                buffer += data

                # Разделяем на строки (оставляем неполные строки в буфере)
                lines = buffer.split("\n")

                # Обрабатываем все, кроме последней строки (она может быть неполной)
                for line in lines[:-1]:
                    line = line.strip()  # Удаляем лишние пробелы
                    if not line:
                        continue  # Игнорируем пустые строки
                    
                    # Обработка строки (пример для GL/GV-формата)
                    if line == "NO_DATA":
                        continue
                    
                    # Разбиваем строку на части (последнее число - номер пакета)
                    parts = line.split()
                    if len(parts) < 2:
                        print(f"Некорректное сообщение: {line}")
                        continue
                    
                    # Последний элемент - номер пакета, остальное - данные
                    *message_parts, packet_num = parts
                    full_message = " ".join(message_parts)

                    # Теперь можно обработать сообщение
                    print(f"Получено: {full_message} (пакет #{packet_num}) ")
                    data = self.db_manager.parse_and_store_data(line)
                    if data:
                        print("Сохранено")
                        send_new_module_data(data)

                # Оставляем последнюю (возможно, неполную) строку в буфере
                buffer = lines[-1]

        except socket.error as e:
            if self.on_connection_error:
                self.on_connection_error("Соединение разорвано.\nПроверьте интернет соединение.")
        except Exception as e:
            if self.on_connection_error:
                self.on_connection_error(f"Ошибка: {str(e)}")
        finally:
            self.stop()

    def stop(self):
        self.running = False
        if self.client_socket:
            self.client_socket.close()