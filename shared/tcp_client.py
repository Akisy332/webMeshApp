import os
import uuid
import socket
import time
from pathlib import Path
from shared.models import DatabaseManager
import threading
import requests

def send_new_module_data(data):
    try:
        response = requests.post(
            'http://websocket-gateway:8001/broadcast',  # ← без порта
            json={
                'event': 'moduleUpdate',
                'data': data
            },
            timeout=5
        )
    except requests.exceptions.ConnectionError as e:
        print(f"WebSocket Gateway unavailable: {e}")


class TCPClientWorker:
    def __init__(self, 
                 send_new_module_data,
                 on_raw_data_received=None, 
                 on_connection_error=None, 
                 on_status_message=None):
        # # Получаем путь к secret.txt (на два уровня выше)
        # current_dir = Path(__file__).parent
        # secret_path = current_dir.parent.parent / "secret.txt"
        
        # # Читаем IP и порт из файла
        # self.host, self.port = self._read_server_config(secret_path)
        # print(f"Server config: {self.host}:{self.port}")
        self.send_new_module_data = send_new_module_data
        self.host = "192.168.0.106"
        self.port = 5010
        
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
        while self.running:
            if not self._connect_to_server():
                time.sleep(5)
                continue
            
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
                            time.sleep(2)  # Ждем если данных нет
                            continue
                        
                        # Разбиваем строку на части (последнее число - номер пакета)
                        parts = line.split()
                        if len(parts) < 2:
                            print(f"Некорректное сообщение: {line}")
                            continue
                        packet_num = parts[-2]  # второй й с конца
                        message_parts = parts[:-2]  # все кроме предпоследнего
                        full_message = " ".join(message_parts) + f" {parts[-1]}"

                        # Теперь можно обработать сообщение
                        print(f"Получено: {full_message} (пакет #{packet_num}) ")
                        data = self.db_manager.parse_and_store_data(line)
                        if data:
                            print("Сохранено")
                            self.send_new_module_data(data)


                    # Оставляем последнюю (возможно, неполную) строку в буфере
                    buffer = lines[-1]

            except socket.error as e:
            
                if self.on_connection_error:
                    self.on_connection_error(f"Соединение разорвано.\nПроверьте интернет соединение. \n{e}")
            except Exception as e:
                print("Ошибка", str(e))
                if self.on_connection_error:
                    self.on_connection_error(f"Ошибка: {str(e)}")
            finally:
                self.stop()

    def stop(self):
        self.running = False
        if self.client_socket:
            self.client_socket.close()
            

# Глобальный экземпляр TCP клиента
tcp_worker = None

def start_tcp_client(socketio_instance=None):
    """Запуск TCP клиента"""
    global tcp_worker
    
    def handle_raw_data(data):
        print(f"Received data: {data}")

    def handle_error(message):
        print(f"Error: {message}")

    def handle_status(message):
        print(f"Status: {message}")

    tcp_worker = TCPClientWorker(
        send_new_module_data,
        on_raw_data_received=handle_raw_data,
        on_connection_error=handle_error,
        on_status_message=handle_status
        
    )
    
    if socketio_instance:
        tcp_worker.socketio = socketio_instance
    
    thread = threading.Thread(target=tcp_worker.run)
    thread.daemon = True
    # thread.start()
    return tcp_worker            


# class TCPClientWorker:
#     """TCP клиент для получения данных (упрощенная версия)"""
    
#     def __init__(self, on_raw_data_received=None, on_connection_error=None, on_status_message=None):
#         self.running = True
#         self.on_raw_data_received = on_raw_data_received
#         self.on_connection_error = on_connection_error
#         self.on_status_message = on_status_message
#         self.db_manager = DatabaseManager()

#     def run(self):
#         """Запуск TCP клиента в отдельном потоке"""
#         if self.on_status_message:
#             self.on_status_message("TCP client started")
        
#         # Имитация получения данных
#         import time
#         while self.running:
#             try:
#                 # Имитация получения данных каждые 10 секунд
#                 time.sleep(10)
                
#                 # Генерируем тестовые данные
#                 test_data = f"GL {random.randint(1000, 9999):X} {random.uniform(56.3, 56.6):.6f} {random.uniform(84.8, 85.1):.6f} {random.uniform(100, 200):.1f} {random.randint(1, 1000)}"
                
#                 if self.on_raw_data_received:
#                     self.on_raw_data_received(test_data)
                
#                 # Сохраняем данные в БД
#                 result = self.db_manager.parse_and_store_data(test_data)
#                 if result and hasattr(self, 'socketio'):
#                     self.socketio.emit('moduleUpdate', result)
                    
#             except Exception as e:
#                 if self.on_connection_error:
#                     self.on_connection_error(f"TCP client error: {str(e)}")
#                 time.sleep(5)

#     def stop(self):
#         self.running = False

# # Глобальный экземпляр TCP клиента
# tcp_worker = None

# def start_tcp_client(socketio_instance=None):
#     """Запуск TCP клиента"""
#     global tcp_worker
    
#     def handle_raw_data(data):
#         print(f"Received data: {data}")

#     def handle_error(message):
#         print(f"Error: {message}")

#     def handle_status(message):
#         print(f"Status: {message}")

#     tcp_worker = TCPClientWorker(
#         on_raw_data_received=handle_raw_data,
#         on_connection_error=handle_error,
#         on_status_message=handle_status
#     )
    
#     if socketio_instance:
#         tcp_worker.socketio = socketio_instance
    
#     thread = threading.Thread(target=tcp_worker.run)
#     thread.daemon = True
#     thread.start()
#     return tcp_worker            