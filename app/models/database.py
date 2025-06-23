from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from contextlib import contextmanager
import logging
from app import db_executor

def init_tables():
        """Инициализация таблиц при первом запуске"""
        init_queries = [
            """
            CREATE TABLE IF NOT EXISTS module (
                id INTEGER PRIMARY KEY,
                name TEXT,
                color TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE,
                description TEXT,
                datetime TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS message_type (
                id INTEGER PRIMARY KEY,
                type TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_module INTEGER,
                id_session INTEGER,
                id_message_type INTEGER,
                datetime TEXT,
                lat REAL,
                lon REAL,
                alt REAL,
                gps_ok INTEGER,
                message_number INTEGER,
                FOREIGN KEY(id_module) REFERENCES module(id),
                FOREIGN KEY(id_session) REFERENCES sessions(id),
                FOREIGN KEY(id_message_type) REFERENCES message_type(id)
            )
            """,
            ("INSERT OR IGNORE INTO message_type (id, type) VALUES (0, 'Mesh')", None),
            ("INSERT OR IGNORE INTO message_type (id, type) VALUES (1, 'Sim')", None),
            ("INSERT OR IGNORE INTO message_type (id, type) VALUES (2, 'Mesh / Sim')", None)
        ]
        
        for query in init_queries:
            if isinstance(query, tuple):
                db_executor.execute(query[0], params=query[1])
            else:
                db_executor.execute(query)

class DatabaseManager:
    def __init__(self):
        """
        Инициализация менеджера базы данных
        
        :param db_executor: экземпляр SQLiteExecutor
        """
        self.db = db_executor
        self._enable_foreign_keys()

    def _enable_foreign_keys(self):
        """Включение поддержки внешних ключей"""
        self.db.execute("PRAGMA foreign_keys = ON")

    def parse_and_store_data(self, data_string: str, session_name: str, 
                           datetime_now: Optional[str] = None) -> bool:
        """
        Парсинг и сохранение данных в БД (оптимизированная версия)
        
        :param data_string: строка с данными для парсинга
        :param session_name: имя сессии
        :param datetime_now: опциональное время записи
        :return: True при успешном сохранении
        """
        try:
            parts = data_string.split()
            if len(parts) < 10:
                raise ValueError("Недостаточно данных в строке")
            
            message_type_code = int(parts[0])
            module_id = int(parts[1])
            lat, lon, alt = parts[2:5]
            message_number = int(parts[9])
            
            # Получаем или создаем связанные сущности
            id_session = self._get_or_create_session(session_name)
            self._ensure_module_exists(module_id)
            
            # Обработка GPS данных
            gps_ok = 1
            try:
                lat_val = float(lat)
                lon_val = float(lon)
                alt_val = float(alt)
            except ValueError:
                gps_ok = 0
                lat_val = lon_val = alt_val = None
            
            # Сохранение данных
            datetime_str = datetime_now or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            self.db.execute(
                """
                INSERT INTO data 
                (id_module, id_session, id_message_type, datetime, 
                 lat, lon, alt, gps_ok, message_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                params=(
                    module_id, id_session, message_type_code, datetime_str,
                    lat_val, lon_val, alt_val, gps_ok, message_number
                )
            )
            
            return True
        except Exception as e:
            logging.error(f"Ошибка при обработке данных: {e}")
            return False

    def _get_or_create_session(self, session_name: str, 
                             description: str = "") -> int:
        """
        Получаем ID сессии или создаем новую (оптимизированная версия)
        """
        result = self.db.execute(
            "SELECT id FROM sessions WHERE name = ?",
            params=(session_name,),
            fetch=True
        )
        if result:
            return result[0]['id']
        else:
            datetime_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.db.execute(
                "INSERT INTO sessions (name, description, datetime) VALUES (?, ?, ?)",
                params=(session_name, description, datetime_str)
            )
            return self.db.lastrowid


    def _ensure_module_exists(self, module_id: int, 
                            default_name: Optional[str] = None, 
                            default_color: str = "#ffffff"):
        """
        Проверяем существование модуля и создаем при необходимости
        """
        exists = self.db.execute(
            "SELECT 1 FROM module WHERE id = ?",
            params=(module_id,),
            fetch=True
        )
        
        if not exists:
            name = default_name or f"Module_{module_id}"
            self.db.execute(
                "INSERT INTO module (id, name, color) VALUES (?, ?, ?)",
                params=(module_id, name, default_color)
            )

    # Оптимизированные методы для массовых операций
    def batch_insert_data(self, data_list: List[Tuple]):
        """
        Пакетная вставка данных
        :param data_list: список кортежей с данными в формате:
            (id_module, id_session, id_message_type, datetime, 
             lat, lon, alt, gps_ok, message_number)
        """
        query = """
            INSERT INTO data 
            (id_module, id_session, id_message_type, datetime, 
             lat, lon, alt, gps_ok, message_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        self.db.execute(query, batch=data_list)

    # Оптимизированные методы выборки данных
    def get_all_modules(self) -> List[Dict[str, Any]]:
        """Получение всех модулей"""
        return self.db.execute(
            "SELECT id, name, color FROM module",
            fetch=True
        )

    def get_all_sessions(self) -> List[Dict[str, Any]]:
        """Получение всех сессий"""
        return self.db.execute(
            "SELECT id, name, description, datetime FROM sessions",
            fetch=True
        )

    def get_all_message_types(self) -> List[Dict[str, Any]]:
        """Получение всех типов сообщений"""
        return self.db.execute(
            "SELECT id, type FROM message_type",
            fetch=True
        )

    def get_all_data(self) -> List[Dict[str, Any]]:
        """
        Получение данных с джойнами (оптимизированный запрос)
        :param limit: ограничение количества записей
        """
        return self.db.execute(
            """
            SELECT d.id, m.name as module_name, s.name as session_name, 
                   mt.type as message_type, d.datetime, d.lat, d.lon, d.alt, 
                   d.gps_ok, d.message_number
            FROM data d
            JOIN module m ON d.id_module = m.id
            JOIN sessions s ON d.id_session = s.id
            JOIN message_type mt ON d.id_message_type = mt.id
            ORDER BY d.datetime DESC
            """,
            fetch=True
        )
    
    def get_last_message(self, session_id: int) -> List[Dict[str, Any]]:
        """
        Возвращает последнее сообщение от каждого модуля для указанной сессии.
        
        Args:
            session_id: ID сессии, для которой нужно получить сообщения
            
        Returns:
            Список словарей с информацией о последних сообщениях от каждого модуля
        """
        query = """
            SELECT d.*, m.name as module_name, m.color as module_color
            FROM data d
            JOIN module m ON d.id_module = m.id
            WHERE d.id_session = ?
            AND d.id IN (
                SELECT MAX(id)
                FROM data
                WHERE id_session = ?
                GROUP BY id_module
            )
        """
        
        # cursor = self.connection.cursor()
        # cursor.execute(query, (session_id, session_id))
        # rows = cursor.fetchall()
        
        data = self.db.execute(query, (session_id, session_id), True)
        
        result = []
        for row in data:
            result.append({
                'id': row['id'],
                'id_module': row['id_module'],
                'id_session': row['id_session'],
                'id_message_type': row['id_message_type'],
                'datetime': row['datetime'],
                'lat': row['lat'],
                'lon': row['lon'],
                'alt': row['alt'],
                'gps_ok': row['gps_ok'],
                'message_number': row['message_number'],
                'module_name': row['module_name'],
                'module_color': row['module_color']
            })
        return result
    
    def get_data_with_joins(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Получение данных с джойнами (оптимизированный запрос)
        :param limit: ограничение количества записей
        """
        return self.db.execute(
            """
            SELECT d.id, m.name as module_name, s.name as session_name, 
                   mt.type as message_type, d.datetime, d.lat, d.lon, d.alt, 
                   d.gps_ok, d.message_number
            FROM data d
            JOIN module m ON d.id_module = m.id
            JOIN sessions s ON d.id_session = s.id
            JOIN message_type mt ON d.id_message_type = mt.id
            ORDER BY d.datetime DESC
            LIMIT ?
            """,
            params=(limit,),
            fetch=True
        )

    def get_session_data(self, session_id: int) -> List[Dict[str, Any]]:
        """Получение данных по конкретной сессии"""
        return self.db.execute(
            """
            SELECT d.id, m.name as module_name, mt.type as message_type, 
                   d.datetime, d.lat, d.lon, d.alt, d.gps_ok, d.message_number
            FROM data d
            JOIN module m ON d.id_module = m.id
            JOIN message_type mt ON d.id_message_type = mt.id
            WHERE d.id_session = ?
            ORDER BY d.datetime DESC
            """,
            params=(session_id,),
            fetch=True
        )
