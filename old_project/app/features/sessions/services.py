from datetime import datetime
from typing import Dict, Any

def parseDate(data: Dict[str, Any]) -> datetime:
    """
    Конвертирует дату и добавляет текущее время.
    
    Параметры:
        data: Словарь, который может содержать ключ 'date' в формате:
              - строка "YYYY-MM-DD" (например, "2025-07-15")
              - None (тогда используется текущая дата и время)
    Возвращает:
        datetime объект с текущим временем (часы, минуты, секунды).
    """
    date_str = data.get("date")
    
    if date_str:
        try:
            # Парсим дату и добавляем текущее время
            session_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            now = datetime.now()
            datetime_val = datetime.combine(session_date, now.time())
            print(f"Дата из строки + текущее время: {datetime_val}")
        except ValueError:
            # Если формат неверный, используем текущую дату и время
            datetime_val = datetime.now()
            print(f"Ошибка формата, используется текущее время: {datetime_val}")
    else:
        # Если дата не передана, используем текущую дату и время
        datetime_val = datetime.now()
        print(f"Дата не указана, используется текущее время: {datetime_val}")
    
    return datetime_val