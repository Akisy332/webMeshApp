import os
from contextlib import contextmanager
from shared.executor import SQLiteExecutor


database_url = os.getenv('DATABASE_URL', 'sqlite:///app/database.db')

# Извлекаем путь к БД из URL
db_path = database_url.replace('sqlite:///', '')
print("Database path: ", db_path)

db_executor = SQLiteExecutor(db_path)


def init_db():
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
