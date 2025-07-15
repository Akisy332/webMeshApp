from datetime import datetime
from typing import Dict, Any


def parseDate(data: Dict[str, Any]) -> str:
    """
    Конвертирует дату и добавляет время.
    
    Параметры:
        data: Словарь, который может содержать ключ 'date' в формате:
              - строка "YYYY-MM-DD" (например, "2025-07-15")
              - None (тогда используется текущая дата)
    Возвращает:
        время в формате datetime.
    """
    # Получаем дату из data (если нет ключа 'date' или значение None - берем текущую дату)
    date_str = data.get("date")
    
    if date_str:
        try:
            # Парсим строку в формате "YYYY-MM-DD"
            session_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            # Преобразуем в datetime (время 00:00:00)
            datetime_val = datetime.combine(session_date, datetime.min.time())
        except ValueError:
            # Если формат неверный, используем текущую дату
            datetime_val = datetime.now()
    else:
        # Если дата не передана, используем текущую
        datetime_val = datetime.now()
    
    # Создаем сессию
    return datetime_val