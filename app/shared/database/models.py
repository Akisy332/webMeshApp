from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple, Union
from contextlib import contextmanager
import logging
from app.core.database import db_executor
import random

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
                name TEXT,
                description TEXT,
                datetime TEXT,
                hidden INTEGER DEFAULT 0
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
                datetime_unix INTEGER,
                lat REAL,
                lon REAL,
                alt REAL,
                gps_ok INTEGER,
                message_number INTEGER,
                rssi INTEGER,
                snr INTEGER,
                source INTEGER,
                jumps INTEGER,
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
        self.last_session = 0
        self.get_all_sessions()

    def hide_session(self, session_id: int) -> bool:
        """
        Помечает сессию как скрытую (hidden = 1)

        :param session_id: ID сессии для скрытия
        :return: True если операция успешна, False в случае ошибки
        """
        try:
            self.db.execute(
                "UPDATE sessions SET hidden = 1 WHERE id = ?",
                params=(session_id,)
            )
            return True
        except Exception as e:
            logging.error(f"Ошибка при скрытии сессии {session_id}: {e}")
            return False
    
    def _enable_foreign_keys(self):
        """Включение поддержки внешних ключей"""
        self.db.execute("PRAGMA foreign_keys = ON")

    def parse_and_store_data(self, data_string: str, session_id: Optional[int] = None, session_name: Optional[str] = "",
                               datetime_now: Optional[str] = None) -> bool:
            """
            Парсинг и сохранение данных в БД (оптимизированная версия)

            :param data_string: строка с данными для парсинга
            :param session_id: id сессии (None - использовать последнюю не скрытую сессию)
            :param session_name: имя сессии
            :param datetime_now: опциональное время записи
            :return: True при успешном сохранении
            """
            try:
                parts = data_string.split()
                if len(parts) < 6:
                    print("Error data: ", data_string)
                    raise ValueError("Недостаточно данных в строке")

                message_type_code = None
                module_id = None
                lat = None
                lon = None
                alt = None
                message_number = None
                rssi = None
                snr = None
                source = None
                jumps = None

                if len(parts) == 7:
                    message_type_code = parts[0]
                    if message_type_code == "GV":
                        message_type_code = 1
                    elif message_type_code == "GL":
                        message_type_code = 0 
                    else:
                       message_type_code = int(message_type_code)

                    module_id = int(parts[1], 16)
                    lat, lon, alt = parts[2:5]
                    message_number = int(parts[5])
                    
                    if ':' in parts[6]:
                        rssi, snr = parts[6].split(':')
                    elif 'R' in parts[6]:
                        source, jumps = parts[6].split('R')

                elif len(parts) == 10:
                    message_type_code = parts[0]
                    if message_type_code == "GV":
                        message_type_code = 1
                    elif message_type_code == "GL":
                        message_type_code = 0 
                    else:
                       message_type_code = int(message_type_code)

                    module_id = int(parts[1], 16)
                    lat, lon, alt = parts[2:5]
                    message_number = int(parts[9])
                    
                

                # Если session_id не указан, получаем id последней не скрытой сессии
                if session_id is None:
                    last_session = self.db.execute(
                        "SELECT id FROM sessions WHERE hidden = 0 ORDER BY id DESC LIMIT 1",
                        fetch=True
                    )
                    if last_session:
                        id_session = last_session[0]['id']
                    else:
                        # Если нет ни одной не скрытой сессии, создаем новую
                        id_session = self._get_or_create_session(session_id, session_name)
                else:
                    # Получаем или создаем связанные сущности
                    id_session = self._get_or_create_session(session_id, session_name)
                self._ensure_module_exists(module_id)
                print("added data session: ", id_session)
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

                # Преобразование даты в Unix timestamp
                datetime_obj = datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
                datetime_unix = int(datetime_obj.timestamp())

                self.db.execute(
                    """
                    INSERT INTO data 
                    (id_module, id_session, id_message_type, datetime, datetime_unix,
                     lat, lon, alt, gps_ok, message_number, rssi, snr, source, jumps)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    params=(
                        module_id, id_session, message_type_code, datetime_str, datetime_unix,
                        lat_val, lon_val, alt_val, gps_ok, message_number, rssi, snr, source, jumps
                    )
                )

                # Получаем только что добавленную запись
                added_data = self.db.execute(
                    """
                    SELECT * FROM data 
                    WHERE id_module = ? AND id_session = ? AND message_number = ?
                    ORDER BY id DESC LIMIT 1
                    """,
                    params=(module_id, id_session, message_number),
                    fetch=True
                )

                if not added_data:
                    raise ValueError("Не удалось получить добавленные данные")

                # Получаем информацию о модуле из базы
                module_info = self.db.execute(
                    "SELECT name, color FROM module WHERE id = ?",
                    params=(module_id,),
                    fetch=True
                )

                if module_info:
                    module_name = module_info[0].get('name', "FFFF")
                    module_color = module_info[0].get('color', "#00ff00")

                # Формируем словарь с результатами
                result = {
                    'id': added_data[0]['id'],
                    'id_module': format(added_data[0]['id_module'], 'X'),
                    'module_name': module_name,
                    'module_color': module_color,
                    'session_id': added_data[0]['id_session'],
                    'message_type': added_data[0]['id_message_type'],
                    'datetime': added_data[0]['datetime'],
                    'datetime_unix': added_data[0]['datetime_unix'],
                    'coords': {
                        'lat': added_data[0]['lat'],
                        'lon': added_data[0]['lon'],
                        'alt': added_data[0]['alt']
                    },
                    'rssi': added_data[0]['rssi'],
                    'snr': added_data[0]['snr'],
                    'source': added_data[0]['source'],
                    'jumps': added_data[0]['jumps'],
                    'gps_ok': bool(added_data[0]['gps_ok']),
                    'message_number': added_data[0]['message_number'],
                    'status': "success",
                    'message': "Данные модуля успешно добавлены"
                }

                return result

            except Exception as e:
                logging.error(f"Ошибка при обработке данных: {e}")
                return False
        
    def _get_session_by_id(self, session_id: int) -> dict | None:
        """
        Получаем данные сессии по ID. Возвращает None если сессия не найдена.
        """
        result = self.db.execute(
            "SELECT * FROM sessions WHERE id = ? AND hidden = 0",
            params=(session_id,),
            fetch=True
        )
        return result[0] if result else None

    def _create_session(
        self, 
        session_name: str, 
        description: str = "", 
        datetime_val: Optional[datetime] = None
    ) -> int:
        """
        Создает новую сессию и возвращает её ID

        Аргументы:
            session_name: Название сессии
            description: Описание сессии (по умолчанию пустая строка)
            datetime_val: Дата и время сессии. Если None, используется текущее время
        """
        datetime_str = (datetime_val if datetime_val is not None else datetime.now()).strftime("%Y-%m-%d %H:%M:%S")
        self.db.execute(
            "INSERT INTO sessions (name, description, datetime) VALUES (?, ?, ?)",
            params=(session_name, description, datetime_str)
        )
        self.last_session = self.db.lastrowid
        return self.db.lastrowid

    def _get_or_create_session(self, id_session: int | None = None, 
                             session_name: str = "", 
                             description: str = "") -> int:
        """
        Получаем существующую сессию по ID или создаем новую.
        Если передан id_session - ищет по нему, иначе создает новую сессию.
        """
        if id_session is not None:
            session = self._get_session_by_id(id_session)
            if session:
                print("session: ", session['id'])
                return session['id']

        # Если id_session не передан или сессия не найдена - создаем новую
        if session_name == "":
            session_name = "Автоматически созданая сессия"
            description = "Вы можете либо удалить этот сеанс после создания нового, либо изменить его."
        return self._create_session(session_name, description)

    def _ensure_module_exists(self, module_id: int, 
                        default_name: Optional[str] = None, 
                        default_color: Optional[str] = None):
        """
        Проверяем существование модуля и создаем при необходимости.
        Если цвет не указан, генерируется уникальный контрастный цвет на основе ID модуля.
        """
        exists = self.db.execute(
            "SELECT 1 FROM module WHERE id = ?",
            params=(module_id,),
            fetch=True
        )

        if not exists:
            name = default_name or f"Module {module_id}"
            color = default_color or self._generate_contrasting_color(module_id)
            self.db.execute(
                "INSERT INTO module (id, name, color) VALUES (?, ?, ?)",
                params=(module_id, name, color)
            )

    def _generate_contrasting_color(self, module_id: int) -> str:
        """
        Генерирует уникальный контрастный цвет на основе ID модуля.
        Использует HSV цветовое пространство для равномерного распределения цветов.
        """
        # Используем золотое сечение для равномерного распределения оттенков
        golden_ratio = 0.618033988749895
        hue = (module_id * golden_ratio) % 1.0  # Получаем значение от 0 до 1

        # Фиксированные значения насыщенности и яркости для контрастных цветов
        saturation = 0.8
        value = 0.95

        # Конвертируем HSV в RGB
        import colorsys
        r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)

        # Конвертируем RGB в HEX
        hex_color = "#{:02x}{:02x}{:02x}".format(
            int(r * 255),
            int(g * 255),
            int(b * 255)
        )

        return hex_color

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
        """Получение всех сессий.
        Если список сессий пуст, автоматически создаёт базовую сессию.
        Заполняет self.last_session ID последней сессии.

        Returns:
            List[Dict[str, Any]]: Список сессий в формате [{"id": int, "name": str, ...}]
        """
        sessions = self.db.execute(
            "SELECT id, name, description, datetime FROM sessions WHERE hidden = 0 ORDER BY datetime DESC",
            fetch=True
        )

        # Если сессий нет, создаём новую
        if not sessions:
            self._get_or_create_session()
            sessions = self.db.execute(
                "SELECT id, name, description, datetime FROM sessions WHERE hidden = 0 ORDER BY datetime DESC",
                fetch=True
            )

        # Заполняем поле last_session ID последней сессии (с максимальным datetime)
        if sessions:
            self.last_session = sessions[0]['id']

        return sessions

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
                   mt.type as message_type, d.datetime, d.datetime_unix, d.lat, d.lon, d.alt, 
                   d.gps_ok, d.message_number
            FROM data d
            JOIN module m ON d.id_module = m.id
            JOIN sessions s ON d.id_session = s.id AND s.hidden = 0
            JOIN message_type mt ON d.id_message_type = mt.id
            ORDER BY d.datetime DESC
            """,
            fetch=True
        )
    
    def get_module_coordinates(
        self, 
        id_module: int,     
        id_session: int, 
        id_message_type: Optional[int] = 0
    ) -> Dict[str, Union[List[Tuple[float, float]], str]]:
        """
        Возвращает список координат (lat, lon) модуля для указанной сессии и цвет модуля

        :param id_module: ID модуля
        :param id_session: ID сессии
        :param id_message_type: Опциональный фильтр по типу сообщения
        :return: Словарь с координатами и цветом модуля:
                 {
                     'coords': список кортежей (lat, lon),
                     'timestamps': список времени каждой точки
                     'module_color': цвет модуля из таблицы modules,
                     'module_name': название модуля
                 }
                 Возвращает только записи с валидными координатами (gps_ok=1)
        """
        # Сначала получаем цвет модуля из таблицы modules
        module_info = self.db.execute(
            "SELECT color, name FROM module WHERE id = ?",
            params=(id_module,),
            fetch=True
        )

        module_color = "#000000"  # значение по умолчанию
        module_name = "Unknown"
        if module_info:
            module_color = module_info[0].get('color', "#000000")
            module_name = module_info[0].get('name', "Unknown")

        # Затем получаем координаты
        query = """
            SELECT lat, lon, datetime_unix
            FROM data
            WHERE id_module = ? 
              AND id_session = ?
              AND gps_ok = 1
              AND lat IS NOT NULL
              AND lon IS NOT NULL
        """

        params = [id_module, id_session]

        if id_message_type is not None:
            query += " AND id_message_type = ?"
            params.append(id_message_type)

        query += " ORDER BY datetime ASC"

        result = self.db.execute(query, params=tuple(params), fetch=True)
        coordinates = [(row['lat'], row['lon']) for row in result]
        timestamps = [(row['datetime_unix']) for row in result]

        return {
            'message': f"Данные о треке модуля {id_module}",
            'coords': coordinates,
            'timestamps': timestamps,
            'module_color': module_color,
            'id_module': format(id_module, 'X'),
            'module_name': module_name
        }
    
    def get_last_message(self, session_id: int) -> List[Dict[str, Any]]:
        """
        Возвращает последнее сообщение от каждого модуля для указанной сессии.
        Если координаты в сообщении NULL, берёт их из предыдущего сообщения где они были указаны.
        
        Args:
            session_id: ID сессии, для которой нужно получить сообщения
            
        Returns:
            Список словарей с информацией о последних сообщениях от каждого модуля
        """
        # Сначала получаем последние сообщения от каждого модуля
        last_messages_query = """
            SELECT 
                d.*, 
                m.name as module_name, 
                m.color as module_color,
                mt.type as message_type
            FROM data d
            JOIN module m ON d.id_module = m.id
            JOIN message_type mt ON d.id_message_type = mt.id
            WHERE d.id_session = ?
            AND d.id IN (
                SELECT MAX(id)
                FROM data
                WHERE id_session = ?
                GROUP BY id_module
            )
        """
        
        last_messages = self.db.execute(last_messages_query, (session_id, session_id), True)
        
        # Теперь для каждого модуля находим последние координаты (если в текущем сообщении их нет)
        result = []
        for row in last_messages:
            lat, lon, alt = row['lat'], row['lon'], row['alt']
            
            # Если координаты отсутствуют в текущем сообщении, ищем предыдущие
            if lat is None or lon is None:
                coord_query = """
                    SELECT lat, lon, alt 
                    FROM data 
                    WHERE id_session = ? 
                    AND id_module = ?
                    AND lat IS NOT NULL 
                    AND lon IS NOT NULL
                    ORDER BY id DESC
                    LIMIT 1
                """
                coord_data = self.db.execute(coord_query, (session_id, row['id_module']), True)
                if coord_data:
                    if lat is None:
                        lat = coord_data[0]['lat']
                    if lon is None:
                        lon = coord_data[0]['lon']
                    if alt is None:
                        alt = coord_data[0]['alt']
            
            result.append({
                'id': row['id'],
                'id_module': format(row['id_module'], 'X'),
                'module_name': row['module_name'],
                'module_color': row['module_color'],
                'id_session': row['id_session'],
                'id_message_type': row['id_message_type'],
                'message_type': row['message_type'],
                'datetime': row['datetime'],
                'datetime_unix': row['datetime_unix'],
                'coords': {
                    'lat': lat,
                    'lon': lon,
                    'alt': alt if alt is not None else 0.0  # Можно установить значение по умолчанию для alt
                },
                'rssi': row['rssi'],
                'snr': row['snr'],
                'source': row['source'],
                'jumps': row['jumps'],
                'gps_ok': bool(row['gps_ok']),
                'message_number': row['message_number']
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
                   mt.type as message_type, d.datetime, d.datetime_unix, d.lat, d.lon, d.alt, 
                   d.gps_ok, d.message_number
            FROM data d
            JOIN module m ON d.id_module = m.id
            JOIN sessions s ON d.id_session = s.id AND s.hidden = 0
            JOIN message_type mt ON d.id_message_type = mt.id
            ORDER BY d.datetime DESC
            LIMIT ?
            """,
            params=(limit,),
            fetch=True
        )

    def get_session_data(self, session_id: int) -> List[Dict[str, Any]]:
        """Получение данных по конкретной сессии"""
        # First check if session is hidden
        session = self.db.execute(
            "SELECT hidden FROM sessions WHERE id = ?",
            params=(session_id,),
            fetch=True
        )

        if not session or session[0].get('hidden', 0) == 1:
            return []

        return self.db.execute(
            """
            SELECT d.id, m.name as module_name, mt.type as message_type, 
                   d.datetime, d.datetime_unix, d.lat, d.lon, d.alt, d.gps_ok, d.message_number
            FROM data d
            JOIN module m ON d.id_module = m.id
            JOIN message_type mt ON d.id_message_type = mt.id
            WHERE d.id_session = ?
            ORDER BY d.datetime DESC
            """,
            params=(session_id,),
            fetch=True
        )

    def add_random_ffff_module_data(self):
        """
        Добавляет запись для модуля FFFF (65535) в последнюю сессию со случайными координатами
        и возвращает добавленные данные в виде словаря с цветом модуля и описанием.
        """
        try:
            # Получаем ID последней сессии
            last_session = self.db.execute(
                "SELECT id FROM sessions ORDER BY id DESC LIMIT 1",
                fetch=True
            )

            if not last_session:
                raise ValueError("Нет доступных сессий")

            session_id = last_session[0]['id']

            # Проверяем/создаем модуль FFFF
            module_id = 0xFFFF  # 65535 в десятичной
            module_name = "FFFF"
            module_color = "#00ff00"
            self._ensure_module_exists(module_id, module_name, module_color)

            # Генерируем случайные координаты в пределах Томска
            lat = 56.47 + random.uniform(-0.1, 0.1)  # ~55.65-55.85
            lon = 84.97 + random.uniform(-0.1, 0.1)   # ~37.5-37.7
            alt = random.uniform(100, 200)           # Высота 100-200 метров
            datetime_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            message_number = random.randint(1, 1000)

            # Преобразование даты в Unix timestamp
            datetime_obj = datetime.strptime(datetime_now, "%Y-%m-%d %H:%M:%S")
            datetime_unix = int(datetime_obj.timestamp())
            
            # Вставляем запись
            self.db.execute(
                """
                INSERT INTO data 
                (id_module, id_session, id_message_type, datetime, datetime_unix,
                 lat, lon, alt, gps_ok, message_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                params=(
                    module_id, session_id, 1, datetime_now, datetime_unix,
                    lat, lon, alt, 1, message_number
                )
            )

            # Получаем только что добавленную запись
            added_data = self.db.execute(
                """
                SELECT * FROM data 
                WHERE id_module = ? AND id_session = ? AND message_number = ?
                ORDER BY id DESC LIMIT 1
                """,
                params=(module_id, session_id, message_number),
                fetch=True
            )

            if not added_data:
                raise ValueError("Не удалось получить добавленные данные")

            # Получаем информацию о модуле из базы
            module_info = self.db.execute(
                "SELECT name, color FROM module WHERE id = ?",
                params=(module_id,),
                fetch=True
            )

            if module_info:
                module_name = module_info[0].get('name', "FFFF")
                module_color = module_info[0].get('color', "#00ff00")

            # Формируем словарь с результатами
            result = {
                'id': added_data[0]['id'],
                'id_module': format(added_data[0]['id_module'], 'X'),
                'module_name': module_name,
                'module_color': module_color,

                'session_id': added_data[0]['id_session'],
                'message_type': added_data[0]['id_message_type'],
                'datetime': added_data[0]['datetime'],
                'datetime_unix': added_data[0]['datetime_unix'],
                'coords': {
                    'lat': added_data[0]['lat'],
                    'lon': added_data[0]['lon'],
                    'alt': added_data[0]['alt']
                },
                'gps_ok':bool(added_data[0]['gps_ok']),
                'message_number': added_data[0]['message_number'],
                'status': "success",
                'message': "Данные модуля успешно добавлены"
            }

            from app.features.realtime.websockets import send_new_module_data
            send_new_module_data(result)

            return result
        except Exception as e:
            error_message = f"Ошибка при добавлении тестовых данных FFFF: {e}"
            logging.error(error_message)
            return {
                'status': "error",
                'message': error_message,
                'module_id': 0xFFFF
            }
            