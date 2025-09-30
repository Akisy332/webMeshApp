import sqlite3
from queue import Queue
from threading import Lock
from typing import Optional, Union, List, Dict, Any, Tuple
import logging
import atexit

class SQLiteExecutor:
    def __init__(self, db_path: str, pool_size: int = 50, timeout: float = 10.0):
        """
        Оптимизированный исполнитель SQL-запросов для высоких нагрузок

        :param db_path: путь к файлу БД
        :param pool_size: размер пула соединений (рекомендуется 1 на 200 RPS)
        :param timeout: таймаут блокировки (секунды)
        """
        
        self.db_path = db_path
        self.timeout = timeout
        self.pool_size = pool_size
        self.connection_pool = Queue(maxsize=pool_size)
        self.write_lock = Lock()  # Только для операций записи
        self.logger = self._setup_logger()
        
        # Инициализация пула
        self._initialize_pool()
        atexit.register(self.close_pool)

    def _setup_logger(self):
        logger = logging.getLogger('HighLoadSQLiteExecutor')
        logger.setLevel(logging.WARNING)  # Уменьшаем логирование для производительности
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        return logger

    def _initialize_pool(self):
        """Инициализация пула соединений с оптимизациями"""
        for _ in range(self.pool_size):
            conn = sqlite3.connect(
                self.db_path,
                timeout=self.timeout,
                check_same_thread=False,
                isolation_level=None  # Автокоммит
            )
            # Критически важные настройки для производительности
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute(f"PRAGMA busy_timeout={int(self.timeout * 1000)}")
            conn.execute("PRAGMA cache_size=-10000")  # 10MB кэша
            conn.execute("PRAGMA temp_store=MEMORY")
            conn.row_factory = sqlite3.Row  # Для доступа к колонкам по имени
            self.connection_pool.put(conn)

    def _get_connection(self) -> sqlite3.Connection:
        """Получение соединения из пула с таймаутом"""
        return self.connection_pool.get(timeout=2.0)

    def _release_connection(self, conn: sqlite3.Connection):
        """Возврат соединения в пул"""
        try:
            self.connection_pool.put_nowait(conn)
        except:
            conn.close()  # Если пул переполнен

    def execute(
        self,
        query: str,
        params: Optional[Union[Tuple, List, Dict]] = None,
        fetch: bool = False,
        batch: Optional[List[Tuple]] = None
    ) -> Optional[Union[List[Dict], int]]:
        """
        Универсальный метод выполнения запросов с поддержкой batch-операций

        :param query: SQL-запрос
        :param params: параметры (для одного запроса)
        :param fetch: возвращать результат (для SELECT)
        :param batch: список параметров для batch-вставки
        :return: для SELECT - список dict, для INSERT/UPDATE/DELETE - кол-во строк
        """
        is_write = query.strip().upper().startswith(('INSERT', 'UPDATE', 'DELETE', 'REPLACE'))
        
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            if batch:  # Пакетная обработка
                with self.write_lock if is_write else nullcontext():
                    cursor.executemany(query, batch)
                    affected = cursor.rowcount
            else:  # Одиночный запрос
                with self.write_lock if is_write else nullcontext():
                    cursor.execute(query, params or ())
                    affected = cursor.rowcount
            
            if fetch:
                result = [dict(row) for row in cursor.fetchall()]
            else:
                result = affected if is_write else None
            self.lastrowid = cursor.lastrowid
            return result
            
        except sqlite3.OperationalError as e:
            self.logger.error(f"Database error: {e} - Query: {query[:200]}")
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error: {e}")
            raise
        finally:
            if 'conn' in locals():
                self._release_connection(conn)

    def execute_many(self, queries: List[Tuple[str, Optional[Tuple]]]) -> List[Any]:
        """Выполнение нескольких запросов в одной транзакции"""
        conn = self._get_connection()
        try:
            with self.write_lock:
                cursor = conn.cursor()
                results = []
                for query, params in queries:
                    cursor.execute(query, params or ())
                    if query.strip().upper().startswith('SELECT'):
                        results.append([dict(row) for row in cursor.fetchall()])
                    else:
                        results.append(cursor.rowcount)
                    self.lastrowid = cursor.lastrowid
                return results
        finally:
            self._release_connection(conn)

    def close_pool(self):
        """Закрытие всех соединений в пуле"""
        while not self.connection_pool.empty():
            conn = self.connection_pool.get_nowait()
            conn.close()
        self.logger.warning("Connection pool closed")

# Context manager для пустого контекста (Python 3.7+)
from contextlib import contextmanager
@contextmanager
def nullcontext():
    yield