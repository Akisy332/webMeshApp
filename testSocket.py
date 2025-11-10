import socket
import struct
import random
import time
from typing import List, Tuple
import math

class GLDataGenerator:
    def __init__(self, center_lat: float, center_lng: float, radius_km: float):
        """
        Инициализация генератора данных.
        
        Args:
            center_lat: широта центральной точки
            center_lng: долгота центральной точки  
            radius_km: радиус в километрах для генерации случайных точек
        """
        self.center_lat = center_lat
        self.center_lng = center_lng
        self.radius_km = radius_km
        
    def _generate_random_point_in_radius(self) -> Tuple[float, float]:
        """Генерирует случайную точку в заданном радиусе."""
        # Преобразуем радиус из км в градусы (приблизительно)
        radius_deg = self.radius_km / 111.0
        
        # Генерируем случайное расстояние и угол
        r = radius_deg * math.sqrt(random.random())
        theta = random.uniform(0, 2 * math.pi)
        
        # Вычисляем новые координаты
        delta_lat = r * math.cos(theta)
        delta_lng = r * math.sin(theta) / math.cos(math.radians(self.center_lat))
        
        new_lat = self.center_lat + delta_lat
        new_lng = self.center_lng + delta_lng
        
        return new_lat, new_lng
    
    def _float_to_fixed_point(self, value: float, bits: int, scale_factor: float) -> int:
        """Преобразует float в фиксированную точку с заданным количеством бит."""
        scaled = int(value / scale_factor)
        # Обеспечиваем попадание в диапазон битов
        max_value = (1 << bits) - 1
        return scaled & max_value
    
    def _to_unsigned(self, value: int, bits: int) -> int:
        """Преобразует знаковое значение в беззнаковое."""
        if value < 0:
            return value + (1 << bits)
        return value
    
    def generate_hop_data(self, module_num: int) -> bytes:
        """Генерирует данные для одного модуля."""
        # Генерируем случайные координаты в радиусе
        lat, lng = self._generate_random_point_in_radius()
        
        # Генерируем остальные данные
        altitude = random.randint(0, 8191)  # 13 бит: 0-8191 метров
        speed = random.randint(0, 127)      # 7 бит: 0-127 м/с
        roc = random.randint(0, 63)         # 6 бит: 0-63 м/с
        
        # Преобразуем координаты в фиксированную точку
        lat_fixed = self._to_unsigned(
            int(lat / 1e-4), 21  # LAT_SCALE_FACTOR = 1e-4
        )
        lng_fixed = self._to_unsigned(
            int(lng / 1e-4), 22  # LNG_SCALE_FACTOR = 1e-4
        )
        
        # Упаковываем данные в 64-битное число
        data1 = (
            (lat_fixed & 0x1FFFFF) << 43 |   # 21 бит для lat
            (lng_fixed & 0x3FFFFF) << 21 |   # 22 бита для lng  
            (altitude & 0x1FFF) << 8 |       # 13 бит для altitude
            (speed & 0x7F) << 1 |            # 7 бит для speed
            (roc >> 5) & 0x1                 # 1 бит roc (старший)
        )
        
        # Собираем полное сообщение (10 байт)
        message = bytes([
            module_num & 0xFF,               # 1 байт: номер модуля
        ]) + struct.pack('<Q', data1) + bytes([
            (roc & 0x3F) << 2                # 1 байт: младшие 6 бит roc + 2 нулевых бита
        ])
        
        return message
    
    def generate_gl_message(self, num_packets: int = None) -> bytes:
        """
        Генерирует полное GL сообщение.
        
        Args:
            num_packets: количество пакетов (1-10), если None - случайное
        """
        if num_packets is None:
            num_packets = random.randint(1, 10)
        else:
            num_packets = max(1, min(10, num_packets))
        
        # Заголовок
        message = b'GL'
        # Количество пакетов
        message += bytes([num_packets])
        
        # Генерируем пакеты для каждого модуля
        for module_num in range(num_packets):
            hop_data = self.generate_hop_data(module_num)
            message += hop_data
        
        return message

class GLClient:
    def __init__(self, host: str, port: int, center_lat: float, center_lng: float, radius_km: float):
        """
        TCP клиент для отправки GL сообщений.
        
        Args:
            host: хост сервера
            port: порт сервера
            center_lat: широта центра
            center_lng: долгота центра
            radius_km: радиус в км
        """
        self.host = host
        self.port = port
        self.generator = GLDataGenerator(center_lat, center_lng, radius_km)
    
    def send_data(self, num_packets: int = None, delay: float = 1.0):
        """
        Отправляет данные на сервер.
        
        Args:
            num_packets: количество пакетов (1-10)
            delay: задержка между отправками в секундах
        """
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.connect((self.host, self.port))
                print(f"Подключено к {self.host}:{self.port}")
                
                while True:
                    # Генерируем сообщение
                    message = self.generator.generate_gl_message(num_packets)
                    
                    # Отправляем данные
                    sock.sendall(message)
                    print(f"Отправлено {len(message)} байт, {message[2]} пакетов")
                    
                    # Ждем перед следующей отправкой
                    time.sleep(delay)
                    
        except Exception as e:
            print(f"Ошибка: {e}")

# Пример использования
if __name__ == "__main__":
    # Настройки
    HOST = "localhost"  # или IP адрес сервера
    PORT = 5000
    CENTER_LAT = 55.7558  # Москва
    CENTER_LNG = 37.6173
    RADIUS_KM = 10.0      # 10 км радиус
    
    # Создаем и запускаем клиент
    client = GLClient(HOST, PORT, CENTER_LAT, CENTER_LNG, RADIUS_KM)
    
    # Отправляем данные: случайное количество пакетов (1-10), задержка 2 секунды
    client.send_data(delay=2.0)