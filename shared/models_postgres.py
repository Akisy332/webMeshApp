import psycopg2
from psycopg2.extras import RealDictCursor, DictCursor
from psycopg2.pool import SimpleConnectionPool
import logging
import os
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple, Union
import random
import colorsys
from contextlib import contextmanager
import atexit
import threading

class PostgreSQLExecutor:
    def __init__(self, db_url: str, min_conn: int = 1, max_conn: int = 20):
        self.db_url = db_url
        self.min_conn = min_conn
        self.max_conn = max_conn
        self.connection_pool = None
        self.logger = self._setup_logger()
        self._initialize_pool()
        atexit.register(self.close_pool)

    def _setup_logger(self):
        logger = logging.getLogger('PostgreSQLExecutor')
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        return logger

    def _initialize_pool(self):
        """Инициализация пула соединений PostgreSQL"""
        try:
            self.connection_pool = SimpleConnectionPool(
                self.min_conn,
                self.max_conn,
                self.db_url,
                cursor_factory=RealDictCursor
            )
            self.logger.info("PostgreSQL connection pool initialized")
        except Exception as e:
            self.logger.error(f"Failed to initialize connection pool: {e}")
            raise

    def get_connection(self):
        """Получение соединения из пула"""
        if self.connection_pool:
            return self.connection_pool.getconn()
        else:
            raise Exception("Connection pool not initialized")

    def release_connection(self, conn):
        """Возврат соединения в пул"""
        if self.connection_pool:
            self.connection_pool.putconn(conn)

    def close_pool(self):
        """Закрытие пула соединений"""
        if self.connection_pool:
            self.connection_pool.closeall()
            self.logger.info("PostgreSQL connection pool closed")

    @contextmanager
    def get_cursor(self):
        """Контекстный менеджер для работы с курсором"""
        conn = self.get_connection()
        try:
            with conn.cursor() as cursor:
                yield cursor
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            self.release_connection(conn)

    def execute(
        self,
        query: str,
        params: Optional[Union[Tuple, List, Dict]] = None,
        fetch: bool = False,
        fetch_one: bool = False,
        batch: Optional[List[Tuple]] = None
    ) -> Optional[Union[List[Dict], int, Dict]]:
        """
        Универсальный метод выполнения запросов с поддержкой batch-операций

        :param query: SQL-запрос
        :param params: параметры (для одного запроса)
        :param fetch: возвращать результат (для SELECT)
        :param fetch_one: возвращать одну запись
        :param batch: список параметров для batch-вставки
        :return: для SELECT - список dict или один dict, для INSERT/UPDATE/DELETE - кол-во строк
        """
        try:
            with self.get_cursor() as cursor:
                if batch:
                    cursor.executemany(query, batch)
                    affected = cursor.rowcount
                else:
                    cursor.execute(query, params or ())
                    affected = cursor.rowcount
                
                if fetch or fetch_one:
                    if fetch_one:
                        result = cursor.fetchone()
                        return dict(result) if result else None
                    else:
                        result = cursor.fetchall()
                        return [dict(row) for row in result]
                else:
                    return affected if query.strip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')) else None
                    
        except Exception as e:
            self.logger.error(f"Database error: {e} - Query: {query[:200]}")
            raise

    def execute_many(self, queries: List[Tuple[str, Optional[Tuple]]]) -> List[Any]:
        """Выполнение нескольких запросов в одной транзакции"""
        conn = self.get_connection()
        try:
            with conn.cursor() as cursor:
                results = []
                for query, params in queries:
                    cursor.execute(query, params or ())
                    if query.strip().upper().startswith('SELECT'):
                        results.append([dict(row) for row in cursor.fetchall()])
                    else:
                        results.append(cursor.rowcount)
                conn.commit()
                return results
        except Exception as e:
            conn.rollback()
            raise
        finally:
            self.release_connection(conn)

    def call_procedure(self, proc_name: str, params: Optional[Tuple] = None) -> List[Dict]:
        """Вызов хранимой процедуры"""
        try:
            with self.get_cursor() as cursor:
                cursor.callproc(proc_name, params or ())
                result = cursor.fetchall()
                return [dict(row) for row in result]
        except Exception as e:
            self.logger.error(f"Procedure call error: {e}")
            raise

class PostgreSQLDatabaseManager:
    def __init__(self, db_url: str = None):
        """
        Инициализация менеджера базы данных PostgreSQL
        
        :param db_url: URL для подключения к PostgreSQL
        """
        if db_url is None:
            db_url = os.getenv('DATABASE_URL', 'postgresql://telemetry_user:telemetry_password@localhost:5432/telemetry_db')
        
        self.db = PostgreSQLExecutor(db_url)
        self.last_session = 0
        self._lock = threading.Lock()
        self.logger = self._setup_logger()
        
        tables = self.check_required_tables()
        if len(tables) != 0:
            self.init_database()
    
        self.get_all_sessions()

    def _setup_logger(self):
        logger = logging.getLogger('PostgreSQLModels')
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        return logger
    
    def check_tables_exist(self, table_names):
        """Проверка существования таблиц в БД"""
        missing_tables = []
        existing_tables = []
        
        try:            
            # Запрос для проверки существования таблиц
            query = """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ANY(%s)
            """
            
            existing_tables = self.db.execute(query, (table_names,), True)
            
            # Находим отсутствующие таблицы
            missing_tables = [table for table in table_names if table not in existing_tables['table_name']]
            
            
            self.logger.info(f"Table check: existing={existing_tables}, missing={missing_tables}")
            
            return {
                'all_tables_exist': len(missing_tables) == 0,
                'existing_tables': existing_tables,
                'missing_tables': missing_tables,
                'checked_tables': table_names
            }
            
        except Exception as e:
            self.logger.error(f"Error checking tables: {str(e)}")
            return {
                'all_tables_exist': False,
                'error': str(e),
                'checked_tables': table_names
            }

    def check_required_tables(self):
        """Проверка всех необходимых для приложения таблиц"""
        required_tables = ['sessions', 'message_type', 'data', 'modules']  # Замените на ваши таблицы
        
        return self.check_tables_exist(required_tables)

    

    def init_database(self):
        self.logger.info("Start init DB")
        """Инициализация структуры базы данных"""
        init_queries = [
            """
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY,
                name TEXT,
                color TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                datetime TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                hidden BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS message_type (
                id INTEGER PRIMARY KEY,
                type TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS data (
                id SERIAL PRIMARY KEY,
                id_module INTEGER REFERENCES modules(id) ON DELETE CASCADE,
                id_session INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
                id_message_type INTEGER REFERENCES message_type(id),
                datetime TIMESTAMP WITH TIME ZONE,
                datetime_unix BIGINT,
                lat DOUBLE PRECISION,
                lon DOUBLE PRECISION,
                alt DOUBLE PRECISION,
                gps_ok BOOLEAN DEFAULT FALSE,
                message_number INTEGER,
                rssi INTEGER,
                snr INTEGER,
                source INTEGER,
                jumps INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
            """,
            # Создание индексов для производительности
            "CREATE INDEX IF NOT EXISTS idx_data_session_module ON data(id_session, id_module)",
            "CREATE INDEX IF NOT EXISTS idx_data_datetime_unix ON data(datetime_unix)",
            "CREATE INDEX IF NOT EXISTS idx_data_module ON data(id_module)",
            "CREATE INDEX IF NOT EXISTS idx_data_gps_ok ON data(gps_ok) WHERE gps_ok = true",
            "CREATE INDEX IF NOT EXISTS idx_sessions_hidden ON sessions(hidden) WHERE hidden = false",
            "CREATE INDEX IF NOT EXISTS idx_data_datetime ON data(datetime)",
            "CREATE INDEX IF NOT EXISTS idx_data_message_number ON data(message_number)",
            # Вставка базовых данных
            "INSERT INTO message_type (id, type) VALUES (0, 'Mesh') ON CONFLICT (id) DO NOTHING",
            "INSERT INTO message_type (id, type) VALUES (1, 'Sim') ON CONFLICT (id) DO NOTHING",
            "INSERT INTO message_type (id, type) VALUES (2, 'Mesh / Sim') ON CONFLICT (id) DO NOTHING"
        ]
        
        for query in init_queries:
            try:
                self.db.execute(query)
            except Exception as e:
                logging.error(f"Error executing init query: {e}")

    def hide_session(self, session_id: int) -> bool:
        """
        Помечает сессию как скрытую (hidden = true)

        :param session_id: ID сессии для скрытия
        :return: True если операция успешна, False в случае ошибки
        """
        try:
            affected = self.db.execute(
                "UPDATE sessions SET hidden = true WHERE id = %s",
                params=(session_id,)
            )
            return affected > 0
        except Exception as e:
            logging.error(f"Ошибка при скрытии сессии {session_id}: {e}")
            return False

    def unhide_session(self, session_id: int) -> bool:
        """
        Восстанавливает скрытую сессию

        :param session_id: ID сессии для восстановления
        :return: True если операция успешна, False в случае ошибки
        """
        try:
            affected = self.db.execute(
                "UPDATE sessions SET hidden = false WHERE id = %s",
                params=(session_id,)
            )
            return affected > 0
        except Exception as e:
            logging.error(f"Ошибка при восстановлении сессии {session_id}: {e}")
            return False

    def delete_session_permanently(self, session_id: int) -> bool:
        """
        Полностью удаляет сессию и все связанные данные

        :param session_id: ID сессии для удаления
        :return: True если операция успешна, False в случае ошибки
        """
        try:
            affected = self.db.execute(
                "DELETE FROM sessions WHERE id = %s",
                params=(session_id,)
            )
            return affected > 0
        except Exception as e:
            logging.error(f"Ошибка при удалении сессии {session_id}: {e}")
            return False

    def parse_and_store_data(self, data_string: str, session_id: Optional[int] = None, 
                           session_name: Optional[str] = "", datetime_now: Optional[str] = None) -> Union[Dict, bool]:
        """
        Парсинг и сохранение данных в PostgreSQL (полная версия)

        :param data_string: строка с данными для парсинга
        :param session_id: id сессии (None - использовать последнюю не скрытую сессию)
        :param session_name: имя сессии
        :param datetime_now: опциональное время записи
        :return: Словарь с результатом или False при ошибке
        """
        logging.debug(f"Parsing data: {data_string}")
        
        with self._lock:
            try:
                parts = data_string.split()
                if len(parts) < 6:
                    logging.error(f"Недостаточно данных в строке: {data_string}")
                    return False

                # Инициализация переменных
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

                # Парсинг в зависимости от формата данных
                if len(parts) == 7:
                    message_type_code = self._parse_message_type(parts[0])
                    module_id = int(parts[1], 16)
                    lat, lon, alt = parts[2:5]
                    message_number = int(parts[5])
                    
                    # Парсинг дополнительных параметров
                    if ':' in parts[6]:
                        rssi_str, snr_str = parts[6].split(':')
                        rssi = float(rssi_str) if rssi_str else None
                        snr = float(snr_str) if snr_str else None
                    elif 'R' in parts[6]:
                        source_str, jumps_str = parts[6].split('R')
                        source = int(source_str) if source_str else None
                        jumps = int(jumps_str) if jumps_str else None

                elif len(parts) == 10:
                    message_type_code = self._parse_message_type(parts[0])
                    module_id = int(parts[1], 16)
                    lat, lon, alt = parts[2:5]
                    message_number = int(parts[9])
                    
                    # Парсинг дополнительных параметров для 10-ти частей
                    if len(parts) > 6:
                        if ':' in parts[6]:
                            rssi_str, snr_str = parts[6].split(':')
                            rssi = float(rssi_str) if rssi_str else None
                            snr = float(snr_str) if snr_str else None
                        elif 'R' in parts[6]:
                            source_str, jumps_str = parts[6].split('R')
                            source = int(source_str) if source_str else None
                            jumps = int(jumps_str) if jumps_str else None

                else:
                    logging.warning(f"Неизвестный формат данных: {len(parts)} частей")
                    # Попытка парсинга в общем формате
                    try:
                        message_type_code = self._parse_message_type(parts[0])
                        module_id = int(parts[1], 16)
                        if len(parts) >= 5:
                            lat, lon, alt = parts[2:5]
                        if len(parts) >= 6:
                            message_number = int(parts[-1])  # Последний элемент как номер сообщения
                    except (ValueError, IndexError) as e:
                        logging.error(f"Ошибка парсинга общего формата: {e}")
                        return False

                # Получаем или создаем сессию
                id_session = self._get_or_create_session(session_id, session_name)
                if not id_session:
                    logging.error("Не удалось получить или создать сессию")
                    return False

                # Обеспечиваем существование модуля
                self._ensure_module_exists(module_id)
                logging.info(f"Добавлены данные в сессию: {id_session}")

                # Обработка GPS данных
                gps_ok, lat_val, lon_val, alt_val = self._parse_gps_data(lat, lon, alt)

                # Подготовка временных меток
                datetime_str = datetime_now or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                datetime_obj = datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
                datetime_unix = int(datetime_obj.timestamp())

                # Сохранение данных
                data_id = self._insert_data(
                    module_id=module_id,
                    id_session=id_session,
                    message_type_code=message_type_code,
                    datetime_str=datetime_str,
                    datetime_unix=datetime_unix,
                    lat_val=lat_val,
                    lon_val=lon_val,
                    alt_val=alt_val,
                    gps_ok=gps_ok,
                    message_number=message_number,
                    rssi=rssi,
                    snr=snr,
                    source=source,
                    jumps=jumps
                )

                if not data_id:
                    logging.error("Не удалось сохранить данные")
                    return False

                # Получаем полные данные для возврата
                result = self._get_data_by_id(data_id)
                if not result:
                    logging.error("Не удалось получить сохраненные данные")
                    return False

                return result

            except Exception as e:
                logging.error(f"Критическая ошибка при обработке данных: {e}\nСтрока: {data_string}")
                return False

    def _parse_message_type(self, type_str: str) -> int:
        """Парсинг типа сообщения"""
        if type_str == "GV":
            return 1
        elif type_str == "GL":
            return 0
        else:
            try:
                return int(type_str)
            except ValueError:
                return 0  # По умолчанию Mesh

    def _parse_gps_data(self, lat: str, lon: str, alt: str) -> Tuple[bool, Optional[float], Optional[float], Optional[float]]:
        """Парсинг GPS данных"""
        gps_ok = True
        try:
            lat_val = float(lat)
            lon_val = float(lon)
            alt_val = float(alt)
        except (ValueError, TypeError):
            gps_ok = False
            lat_val = lon_val = alt_val = None
        
        return gps_ok, lat_val, lon_val, alt_val

    def _insert_data(self, module_id: int, id_session: int, message_type_code: int, 
                    datetime_str: str, datetime_unix: int, lat_val: Optional[float], 
                    lon_val: Optional[float], alt_val: Optional[float], gps_ok: bool,
                    message_number: int, rssi: Optional[float], snr: Optional[float],
                    source: Optional[int], jumps: Optional[int]) -> Optional[int]:
        """Вставка данных в таблицу data"""
        try:
            result = self.db.execute(
                """
                INSERT INTO data 
                (id_module, id_session, id_message_type, datetime, datetime_unix,
                 lat, lon, alt, gps_ok, message_number, rssi, snr, source, jumps)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                params=(
                    module_id, id_session, message_type_code, datetime_str, datetime_unix,
                    lat_val, lon_val, alt_val, gps_ok, message_number, rssi, snr, source, jumps
                ),
                fetch_one=True
            )
            return result['id'] if result else None
        except Exception as e:
            logging.error(f"Ошибка при вставке данных: {e}")
            return None

    def _get_data_by_id(self, data_id: int) -> Optional[Dict]:
        """Получение данных по ID с полной информацией"""
        try:
            data = self.db.execute(
                """
                SELECT 
                    d.*,
                    m.name as module_name,
                    m.color as module_color,
                    mt.type as message_type,
                    s.name as session_name
                FROM data d
                LEFT JOIN modules m ON d.id_module = m.id
                LEFT JOIN message_type mt ON d.id_message_type = mt.id
                LEFT JOIN sessions s ON d.id_session = s.id
                WHERE d.id = %s
                """,
                params=(data_id,),
                fetch_one=True
            )
            
            if not data:
                return None

            # Форматирование результата
            return {
                'id': data['id'],
                'id_module': format(data['id_module'], 'X'),
                'module_name': data['module_name'],
                'module_color': data['module_color'],
                'session_id': data['id_session'],
                'session_name': data['session_name'],
                'message_type': data['id_message_type'],
                'message_type_name': data['message_type'],
                'datetime': data['datetime'].isoformat() if data['datetime'] else None,
                'datetime_unix': data['datetime_unix'],
                'coords': {
                    'lat': data['lat'],
                    'lon': data['lon'],
                    'alt': data['alt']
                },
                'rssi': data['rssi'],
                'snr': data['snr'],
                'source': data['source'],
                'jumps': data['jumps'],
                'gps_ok': bool(data['gps_ok']),
                'message_number': data['message_number'],
                'status': "success",
                'message': "Данные модуля успешно добавлены"
            }
            
        except Exception as e:
            logging.error(f"Ошибка при получении данных по ID {data_id}: {e}")
            return None

    def _get_session_by_id(self, session_id: int) -> Optional[Dict]:
        """Получение сессии по ID"""
        result = self.db.execute(
            "SELECT * FROM sessions WHERE id = %s AND hidden = false",
            params=(session_id,),
            fetch_one=True
        )
        return result

    def _create_session(
    self, 
    session_name: str, 
    description: str = "", 
    datetime_val: Optional[datetime] = None
) -> Optional[int]:
        """Создание новой сессии"""
        try:
            datetime_str = (datetime_val if datetime_val is not None else datetime.now()).strftime("%Y-%m-%d %H:%M:%S")

            result = self.db.execute(
                "INSERT INTO sessions (name, description, datetime) VALUES (%s, %s, %s) RETURNING id",
                params=(session_name, description, datetime_str),
                fetch_one=True
            )

            if result:
                session_id = result['id']
                self.last_session = session_id
                return session_id
            return None
        except Exception as e:
            logging.error(f"Ошибка при создании сессии: {e}")
            return None
        
    def _get_or_create_session(self, id_session: Optional[int] = None, 
                             session_name: str = "", description: str = "") -> Optional[int]:
        """Получение существующей сессии или создание новой"""
        if id_session is not None:
            session = self._get_session_by_id(id_session)
            if session:
                logging.info(f"Найдена сессия: {session['id']}")
                return session['id']

        # Создание новой сессии
        if not session_name:
            session_name = "Автоматически созданная сессия"
            description = "Вы можете либо удалить этот сеанс после создания нового, либо изменить его."
        
        return self._create_session(session_name, description)

    def _ensure_module_exists(self, module_id: int, 
                            default_name: Optional[str] = None, 
                            default_color: Optional[str] = None):
        """Обеспечение существования модуля"""
        exists = self.db.execute(
            "SELECT 1 FROM modules WHERE id = %s",
            params=(module_id,),
            fetch_one=True
        )

        if not exists:
            name = default_name or f"Module {module_id}"
            color = default_color or self._generate_contrasting_color(module_id)
            
            self.db.execute(
                "INSERT INTO modules (id, name, color) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                params=(module_id, name, color)
            )
            logging.info(f"Создан новый модуль: {module_id}")

    def _generate_contrasting_color(self, module_id: int) -> str:
        """Генерация контрастного цвета на основе ID модуля"""
        golden_ratio = 0.618033988749895
        hue = (module_id * golden_ratio) % 1.0
        
        saturation = 0.8
        value = 0.95

        r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
        hex_color = "#{:02x}{:02x}{:02x}".format(
            int(r * 255),
            int(g * 255),
            int(b * 255)
        )
        return hex_color

    # Batch operations
    def batch_insert_data(self, data_list: List[Tuple]) -> int:
        """
        Пакетная вставка данных
        
        :param data_list: список кортежей с данными в формате:
            (id_module, id_session, id_message_type, datetime, datetime_unix,
             lat, lon, alt, gps_ok, message_number, rssi, snr, source, jumps)
        :return: количество вставленных записей
        """
        query = """
            INSERT INTO data 
            (id_module, id_session, id_message_type, datetime, datetime_unix,
             lat, lon, alt, gps_ok, message_number, rssi, snr, source, jumps)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        try:
            affected = self.db.execute(query, batch=data_list)
            return affected or 0
        except Exception as e:
            logging.error(f"Ошибка при пакетной вставке: {e}")
            return 0

    # Data retrieval methods
    def get_all_modules(self) -> List[Dict[str, Any]]:
        """Получение всех модулей"""
        return self.db.execute(
            "SELECT id, name, color FROM modules ORDER BY id",
            fetch=True
        ) or []

    def get_all_sessions(self, include_hidden: bool = False) -> List[Dict[str, Any]]:
        """Получение всех сессий"""
        query = "SELECT id, name, description, datetime, hidden FROM sessions"
        if not include_hidden:
            query += " WHERE hidden = false"
        query += " ORDER BY datetime DESC"
        
        sessions = self.db.execute(query, fetch=True) or []

        # Если сессий нет, создаём новую
        if not sessions and not include_hidden:
            self._get_or_create_session()
            sessions = self.db.execute(
                "SELECT id, name, description, datetime, hidden FROM sessions WHERE hidden = false ORDER BY datetime DESC",
                fetch=True
            ) or []

        # Заполняем поле last_session ID последней сессии
        if sessions:
            self.last_session = sessions[0]['id']

        return sessions

    def get_all_message_types(self) -> List[Dict[str, Any]]:
        """Получение всех типов сообщений"""
        return self.db.execute(
            "SELECT id, type FROM message_type ORDER BY id",
            fetch=True
        ) or []

    def get_all_data(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """Получение всех данных с джойнами"""
        return self.db.execute(
            """
            SELECT 
                d.id, 
                m.name as module_name, 
                s.name as session_name, 
                mt.type as message_type, 
                d.datetime, 
                d.datetime_unix, 
                d.lat, 
                d.lon, 
                d.alt, 
                d.gps_ok, 
                d.message_number,
                d.rssi,
                d.snr,
                d.source,
                d.jumps
            FROM data d
            JOIN modules m ON d.id_module = m.id
            JOIN sessions s ON d.id_session = s.id AND s.hidden = false
            JOIN message_type mt ON d.id_message_type = mt.id
            ORDER BY d.datetime DESC
            LIMIT %s
            """,
            params=(limit,),
            fetch=True
        ) or []

    def get_module_coordinates(
        self, 
        id_module: int,     
        id_session: int, 
        id_message_type: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Возвращает список координат модуля для указанной сессии
        """
        query = """
            SELECT lat, lon, datetime_unix, datetime, alt
            FROM data
            WHERE id_module = %s 
              AND id_session = %s
              AND gps_ok = true
              AND lat IS NOT NULL
              AND lon IS NOT NULL
        """
        
        params = [id_module, id_session]

        if id_message_type is not None:
            query += " AND id_message_type = %s"
            params.append(id_message_type)

        query += " ORDER BY datetime ASC"

        result = self.db.execute(query, params=tuple(params), fetch=True) or []

        # Получаем информацию о модуле
        module_info = self.db.execute(
            "SELECT color, name FROM modules WHERE id = %s",
            params=(id_module,),
            fetch_one=True
        )
        
        self.logger.info(f"{id_module}, {module_info}")
        
        module_color = "#000000"
        module_name = "Unknown"
        if module_info:
            module_color = module_info.get('color', "#000000")
            module_name = module_info.get('name', "Unknown")

        coordinates = [(row['lat'], row['lon']) for row in result]
        timestamps = [row['datetime_unix'] for row in result]
        altitudes = [row['alt'] for row in result]
        datetimes = [row['datetime'].isoformat() for row in result]

        return {
            'message': f"Данные о треке модуля {format(id_module, 'X')}",
            'coords': coordinates,
            'timestamps': timestamps,
            'altitudes': altitudes,
            'datetimes': datetimes,
            'module_color': module_color,
            'id_module': format(id_module, 'X'),
            'module_name': module_name,
            'points_count': len(coordinates)
        }
    
    def get_last_message(self, session_id: int) -> List[Dict[str, Any]]:
        """
        Возвращает последнее сообщение от каждого модуля для указанной сессии
        """
        last_messages_query = """
            SELECT 
                d.*, 
                m.name as module_name, 
                m.color as module_color,
                mt.type as message_type
            FROM data d
            JOIN modules m ON d.id_module = m.id
            JOIN message_type mt ON d.id_message_type = mt.id
            WHERE d.id_session = %s
            AND d.id IN (
                SELECT MAX(id)
                FROM data
                WHERE id_session = %s
                GROUP BY id_module
            )
        """
        
        last_messages = self.db.execute(last_messages_query, (session_id, session_id), fetch=True) or []
        
        result = []
        for row in last_messages:
            lat, lon, alt = row['lat'], row['lon'], row['alt']
            
            # Если координаты отсутствуют, ищем предыдущие
            if lat is None or lon is None:
                coord_data = self.db.execute(
                    """
                    SELECT lat, lon, alt 
                    FROM data 
                    WHERE id_session = %s 
                    AND id_module = %s
                    AND lat IS NOT NULL 
                    AND lon IS NOT NULL
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    params=(session_id, row['id_module']),
                    fetch_one=True
                )
                if coord_data:
                    if lat is None:
                        lat = coord_data['lat']
                    if lon is None:
                        lon = coord_data['lon']
                    if alt is None:
                        alt = coord_data['alt']
            
            result.append({
                'id': row['id'],
                'id_module': format(row['id_module'], 'X'),
                'module_name': row['module_name'],
                'module_color': row['module_color'],
                'id_session': row['id_session'],
                'id_message_type': row['id_message_type'],
                'message_type': row['message_type'],
                'datetime': row['datetime'].isoformat() if row['datetime'] else None,
                'datetime_unix': row['datetime_unix'],
                'coords': {
                    'lat': lat,
                    'lon': lon,
                    'alt': alt if alt is not None else 0.0
                },
                'rssi': row['rssi'],
                'snr': row['snr'],
                'source': row['source'],
                'jumps': row['jumps'],
                'gps_ok': bool(row['gps_ok']),
                'message_number': row['message_number']
            })
        
        return result

    def get_session_data(self, session_id: int, module_ids: List[int] = None, 
                        limit: int = 100, offset: int = 0) -> Tuple[List[Dict], int, int]:
        """
        Получение данных сессии для указанных модулей с пагинацией
        """
        # Проверка существования сессии
        session_result = self.db.execute(
            "SELECT hidden FROM sessions WHERE id = %s",
            params=(session_id,),
            fetch_one=True
        )
    
        if not session_result:
            raise ValueError(f"Сессия с ID {session_id} не найдена")
    
        if session_result['hidden']:
            raise ValueError(f"Сессия с ID {session_id} скрыта")
    
        # Подготовка запроса в зависимости от фильтра модулей
        if module_ids:
            placeholders = ','.join(['%s'] * len(module_ids))
            
            data_query = f"""
            WITH filtered_data AS (
                SELECT 
                    d.id as data_id,
                    d.id_session,
                    d.datetime,
                    d.datetime_unix,
                    d.lat,
                    d.lon,
                    d.alt,
                    d.gps_ok,
                    d.message_number,
                    d.rssi,
                    d.snr,
                    d.source,
                    d.jumps,
                    m.id as module_id,
                    m.name as module_name,
                    m.color as module_color,
                    mt.id as message_type_id,
                    mt.type as message_type_name
                FROM data d
                LEFT JOIN modules m ON d.id_module = m.id
                LEFT JOIN message_type mt ON d.id_message_type = mt.id
                WHERE d.id_session = %s AND d.id_module IN ({placeholders})
                ORDER BY d.id ASC
            ),
            numbered_data AS (
                SELECT 
                    *,
                    ROW_NUMBER() OVER (ORDER BY data_id) as id
                FROM filtered_data
            )
            SELECT * FROM numbered_data
            LIMIT %s OFFSET %s
            """
    
            data_params = [session_id] + module_ids + [limit, offset]
            data = self.db.execute(data_query, data_params, fetch=True) or []
    
            # Получаем общее количество записей
            total_count_result = self.db.execute(
                "SELECT COUNT(*) as total FROM data WHERE id_session = %s",
                params=(session_id,),
                fetch_one=True
            )
            total_count = total_count_result['total'] if total_count_result else 0
    
            # Получаем количество записей для выбранных модулей
            modules_count_result = self.db.execute(
                f"SELECT COUNT(*) as modules_total FROM data WHERE id_session = %s AND id_module IN ({placeholders})",
                params=[session_id] + module_ids,
                fetch_one=True
            )
            modules_count = modules_count_result['modules_total'] if modules_count_result else 0
    
        else:
            # Запрос без фильтрации по модулям
            data_query = """
            SELECT 
                d.id as data_id,
                d.id_session,
                d.datetime,
                d.datetime_unix,
                d.lat,
                d.lon,
                d.alt,
                d.gps_ok,
                d.message_number,
                d.rssi,
                d.snr,
                d.source,
                d.jumps,
                m.id as module_id,
                m.name as module_name,
                m.color as module_color,
                mt.id as message_type_id,
                mt.type as message_type_name,
                ROW_NUMBER() OVER (ORDER BY d.id) as id
            FROM data d
            LEFT JOIN modules m ON d.id_module = m.id
            LEFT JOIN message_type mt ON d.id_message_type = mt.id
            WHERE d.id_session = %s
            ORDER BY d.id ASC
            LIMIT %s OFFSET %s
            """
    
            data_params = [session_id, limit, offset]
            data = self.db.execute(data_query, data_params, fetch=True) or []
    
            # Получаем общее количество записей
            total_count_result = self.db.execute(
                "SELECT COUNT(*) as total FROM data WHERE id_session = %s",
                params=(session_id,),
                fetch_one=True
            )
            total_count = total_count_result['total'] if total_count_result else 0
            modules_count = total_count
    
        return data, total_count, modules_count

    def get_session_data_centered_on_time(
        self, 
        session_id: int, 
        target_datetime_unix: int,
        module_ids: List[int] = None, 
        limit: int = 100
    ) -> Tuple[List[Dict], int, int, int]:
        """
        Получение данных сессии с центром на указанном времени
        """
        # Определяем позицию для центрирования
        if module_ids:
            placeholders = ','.join(['%s'] * len(module_ids))
            position_query = f"""
            SELECT COUNT(*) as position
            FROM data 
            WHERE id_session = %s AND id_module IN ({placeholders}) AND datetime_unix <= %s
            """
            position_params = [session_id] + module_ids + [target_datetime_unix]
        else:
            position_query = """
            SELECT COUNT(*) as position
            FROM data 
            WHERE id_session = %s AND datetime_unix <= %s
            """
            position_params = [session_id, target_datetime_unix]

        position_result = self.db.execute(position_query, position_params, fetch_one=True)

        if not position_result:
            raise ValueError(f"Не удалось определить позицию для времени {target_datetime_unix}")

        position = position_result['position']

        # Рассчитываем offset для центрирования
        half_limit = limit // 2
        offset = max(0, position - half_limit)

        # Используем существующий метод для получения данных
        data, total_count, modules_count = self.get_session_data(
            session_id=session_id,
            module_ids=module_ids,
            limit=limit,
            offset=offset
        )
        
        return data, total_count, modules_count, position

    def get_module_statistics(self, module_id: int, session_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Получение статистики по модулю
        """
        query = """
        SELECT 
            COUNT(*) as total_messages,
            COUNT(CASE WHEN gps_ok = true THEN 1 END) as gps_messages,
            MIN(datetime) as first_message,
            MAX(datetime) as last_message,
            AVG(rssi) as avg_rssi,
            AVG(snr) as avg_snr
        FROM data
        WHERE id_module = %s
        """
        
        params = [module_id]
        
        if session_id:
            query += " AND id_session = %s"
            params.append(session_id)
        
        stats = self.db.execute(query, params=params, fetch_one=True) or {}
        
        return {
            'module_id': format(module_id, 'X'),
            'total_messages': stats.get('total_messages', 0),
            'gps_messages': stats.get('gps_messages', 0),
            'first_message': stats.get('first_message'),
            'last_message': stats.get('last_message'),
            'avg_rssi': float(stats.get('avg_rssi', 0)) if stats.get('avg_rssi') else None,
            'avg_snr': float(stats.get('avg_snr', 0)) if stats.get('avg_snr') else None
        }

    def search_modules(self, search_term: str) -> List[Dict[str, Any]]:
        """
        Поиск модулей по имени или ID
        """
        search_pattern = f"%{search_term}%"
        
        return self.db.execute(
            """
            SELECT id, name, color 
            FROM modules 
            WHERE name ILIKE %s OR id::TEXT ILIKE %s
            ORDER BY id
            LIMIT 50
            """,
            params=(search_pattern, search_pattern),
            fetch=True
        ) or []

    def get_recent_activity(self, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Получение recent активности за указанное количество часов
        """
        return self.db.execute(
            """
            SELECT 
                d.id,
                d.id_module,
                m.name as module_name,
                m.color as module_color,
                s.name as session_name,
                d.datetime,
                d.message_number,
                d.gps_ok
            FROM data d
            JOIN modules m ON d.id_module = m.id
            JOIN sessions s ON d.id_session = s.id
            WHERE d.datetime >= NOW() - INTERVAL '%s hours'
            ORDER BY d.datetime DESC
            LIMIT 100
            """,
            params=(hours,),
            fetch=True
        ) or []

    def add_random_ffff_module_data(self) -> Dict[str, Any]:
        """
        Добавляет тестовые данные для модуля FFFF
        """
        try:
            # Получаем ID последней сессии
            last_session = self.db.execute(
                "SELECT id FROM sessions WHERE hidden = false ORDER BY id DESC LIMIT 1",
                fetch_one=True
            )

            if not last_session:
                raise ValueError("Нет доступных сессий")

            session_id = last_session['id']

            # Проверяем/создаем модуль FFFF
            module_id = 0xFFFF
            module_name = "FFFF"
            module_color = "#00ff00"
            self._ensure_module_exists(module_id, module_name, module_color)

            # Генерируем случайные координаты
            lat = 56.47 + random.uniform(-0.1, 0.1)
            lon = 84.97 + random.uniform(-0.1, 0.1)
            alt = random.uniform(100, 200)
            datetime_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            message_number = random.randint(1, 1000)

            datetime_obj = datetime.strptime(datetime_now, "%Y-%m-%d %H:%M:%S")
            datetime_unix = int(datetime_obj.timestamp())
            
            # Вставляем запись
            data_id = self._insert_data(
                module_id=module_id,
                id_session=session_id,
                message_type_code=1,
                datetime_str=datetime_now,
                datetime_unix=datetime_unix,
                lat_val=lat,
                lon_val=lon,
                alt_val=alt,
                gps_ok=True,
                message_number=message_number,
                rssi=random.randint(-120, -50),
                snr=random.randint(0, 30),
                source=None,
                jumps=None
            )

            if not data_id:
                raise ValueError("Не удалось добавить тестовые данные")

            # Получаем полные данные для возврата
            result = self._get_data_by_id(data_id)
            if result:
                result['message'] = "Тестовые данные модуля FFFF успешно добавлены"
                return result
            else:
                raise ValueError("Не удалось получить добавленные данные")
                
        except Exception as e:
            error_message = f"Ошибка при добавлении тестовых данных FFFF: {e}"
            logging.error(error_message)
            return {
                'status': "error",
                'message': error_message,
                'module_id': 0xFFFF
            }

    def cleanup_old_data(self, days_old: int = 30) -> int:
        """
        Очистка старых данных
        """
        try:
            affected = self.db.execute(
                """
                DELETE FROM data 
                WHERE datetime < NOW() - INTERVAL '%s days'
                AND id_session IN (
                    SELECT id FROM sessions WHERE hidden = true
                )
                """,
                params=(days_old,)
            )
            return affected or 0
        except Exception as e:
            logging.error(f"Ошибка при очистке старых данных: {e}")
            return 0

    def get_database_stats(self) -> Dict[str, Any]:
        """
        Получение статистики базы данных
        """
        stats_queries = [
            ("SELECT COUNT(*) as total_modules FROM modules", None),
            ("SELECT COUNT(*) as total_sessions FROM sessions WHERE hidden = false", None),
            ("SELECT COUNT(*) as total_data FROM data", None),
            ("SELECT COUNT(*) as gps_data FROM data WHERE gps_ok = true", None),
            ("SELECT MAX(datetime) as latest_data FROM data", None),
            ("SELECT COUNT(DISTINCT id_module) as active_modules FROM data WHERE datetime >= NOW() - INTERVAL '1 day'", None)
        ]
        
        results = {}
        for query, params in stats_queries:
            try:
                result = self.db.execute(query, params=params, fetch_one=True)
                if result:
                    key = list(result.keys())[0]
                    results[key] = list(result.values())[0]
            except Exception as e:
                logging.error(f"Ошибка при получении статистики: {e}")
        
        return results

# Глобальный экземпляр для использования в приложении
_postgres_manager = None

def get_postgres_manager() -> PostgreSQLDatabaseManager:
    """Получение глобального экземпляра менеджера БД"""
    global _postgres_manager
    if _postgres_manager is None:
        _postgres_manager = PostgreSQLDatabaseManager()
        # _postgres_manager.init_database()
    return _postgres_manager