"""
Простой парсер GL сообщений телеметрии.
"""

import struct
from typing import List, Tuple, NamedTuple

class HopData(NamedTuple):
    module_num: int  # 8 бит    - 1 байт
    lat: float      # 21 бит  |
    lng: float      # 22 бита |
    altitude: int   # 13 бит  | - 8 байт
    speed: int      # 7 бит   |
    roc: int        # 6 бит     - 1 байт

# Константы для парсинга
HEADER = b'GL'
HEADER_LENGTH = 2
COUNT_LENGTH = 1
SUBMESSAGE_LENGTH = 10
MIN_MESSAGE_LENGTH = HEADER_LENGTH + COUNT_LENGTH

LAT_SCALE_FACTOR = 1e-4
LNG_SCALE_FACTOR = 1e-4

# Битовые размеры полей
LAT_BITS = 21
LNG_BITS = 22
ALT_BITS = 13  
SPEED_BITS = 7
ROC_BITS = 6

# Смещения в 64-битном пакете
LAT_SHIFT = 43
LNG_SHIFT = 21  
ALT_SHIFT = 8
SPEED_SHIFT = 1

def _create_mask(bits: int) -> int:
    """Создает битовую маску для указанного количества битов."""
    return (1 << bits) - 1

# Создаем маски на основе битовых размеров
LAT_MASK = _create_mask(LAT_BITS)
LNG_MASK = _create_mask(LNG_BITS)
ALT_MASK = _create_mask(ALT_BITS)
SPEED_MASK = _create_mask(SPEED_BITS)
ROC_MASK = _create_mask(ROC_BITS)

def parse_message(data: bytes) -> Tuple[List[HopData], List[str]]:
    """
    Парсит GL сообщение и возвращает список подсообщений и список ошибок.
    
    Args:
        data: байтовая строка с сообщением
        
    Returns:
        Кортеж (список объектов HopData, список ошибок)
    """
    errors = []
    hops = []
    
    # Базовая валидация
    if len(data) < MIN_MESSAGE_LENGTH:
        return [], ["Data too short"]
    
    if data[0:HEADER_LENGTH] != HEADER:
        errors.append("Invalid message key")
    
    # Количество подсообщений
    num_messages = data[2]
    
    # Сколько можем распарсить
    available_bytes = len(data) - MIN_MESSAGE_LENGTH
    actual_messages = min(num_messages, available_bytes // SUBMESSAGE_LENGTH)
    
    if actual_messages < num_messages:
        errors.append(f"Parsed {actual_messages} out of {num_messages} messages")
    
    # Парсим каждое сообщение
    for i in range(actual_messages):
        start_byte = MIN_MESSAGE_LENGTH + i * SUBMESSAGE_LENGTH
        
        if start_byte + SUBMESSAGE_LENGTH > len(data):
            errors.append(f"Not enough data for message {i}")
            break
        
        try:
            submessage = data[start_byte:start_byte + SUBMESSAGE_LENGTH]
            
            # Извлекаем данные
            module_num = submessage[0]
            data1 = struct.unpack('<Q', submessage[1:9])[0]
            roc = (submessage[9] >> 2) & ROC_MASK
            
            # Битовые поля
            lat_raw = (data1 >> LAT_SHIFT) & LAT_MASK
            lng_raw = (data1 >> LNG_SHIFT) & LNG_MASK
            altitude = (data1 >> ALT_SHIFT) & ALT_MASK
            speed = (data1 >> SPEED_SHIFT) & SPEED_MASK
            
            # Преобразуем координаты
            lat = _to_signed(lat_raw, LAT_BITS) * LAT_SCALE_FACTOR
            lng = _to_signed(lng_raw, LNG_BITS) * LNG_SCALE_FACTOR
            
            hops.append(HopData(
                module_num=module_num,
                lat=lat,
                lng=lng, 
                altitude=altitude,
                speed=speed,
                roc=roc
            ))
            
        except Exception as e:
            errors.append(f"Error parsing message {i}: {e}")
    
    return hops, errors

def _to_signed(value: int, bits: int) -> int:
    """Преобразует беззнаковое значение в знаковое."""
    if value >= (1 << (bits - 1)):
        return value - (1 << bits)
    return value