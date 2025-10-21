import sqlite3
import psycopg2
from psycopg2.extras import execute_values
import os
import logging
from datetime import datetime
import colorsys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('migration')

def get_sqlite_value(row, key, default=None):
    """Безопасное получение значения из sqlite3.Row"""
    try:
        return row[key] if key in row.keys() else default
    except (KeyError, IndexError):
        return default

def generate_module_color(module_id):
    """Генерация цвета на основе ID модуля"""
    golden_ratio = 0.618033988749895
    hue = (module_id * golden_ratio) % 1.0
    saturation = 0.8
    value = 0.95
    r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
    return "#{:02x}{:02x}{:02x}".format(int(r * 255), int(g * 255), int(b * 255))

def migrate_data():
    """Миграция данных из SQLite в PostgreSQL"""
    
    # Подключение к SQLite
    sqlite_path = 'database.db'
    if not os.path.exists(sqlite_path):
        logger.error(f"SQLite database not found at {sqlite_path}")
        return False
    
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    
    # Подключение к PostgreSQL
    pg_conn = psycopg2.connect(os.getenv('DATABASE_URL', 'postgresql://telemetry_user:telemetry_password@localhost:5432/telemetry_db'))
    pg_cursor = pg_conn.cursor()
    
    try:
        logger.info("Starting migration from SQLite to PostgreSQL...")
        
        # ВРЕМЕННО отключаем проверку внешних ключей
        logger.info("Temporarily disabling foreign key checks...")
        pg_cursor.execute("SET session_replication_role = 'replica';")
        
        # 1. Очищаем все таблицы в правильном порядке (чтобы избежать FK violations)
        logger.info("Cleaning existing data...")
        pg_cursor.execute("DELETE FROM data")
        pg_cursor.execute("DELETE FROM modules")
        pg_cursor.execute("DELETE FROM sessions")
        
        # 2. Миграция сессий
        logger.info("Migrating sessions...")
        all_sessions = sqlite_conn.execute('SELECT * FROM sessions').fetchall()
        if all_sessions:
            session_data = []
            for s in all_sessions:
                session_data.append((
                    s['id'], 
                    s['name'], 
                    get_sqlite_value(s, 'description', ''), 
                    s['datetime'],
                    bool(get_sqlite_value(s, 'hidden', 0))
                ))
            
            execute_values(
                pg_cursor,
                'INSERT INTO sessions (id, name, description, datetime, hidden) VALUES %s',
                session_data
            )
            logger.info(f"Migrated {len(all_sessions)} sessions")
        
        # 3. Миграция модулей с правильными данными
        logger.info("Migrating modules with correct data...")
        modules = sqlite_conn.execute('SELECT * FROM module').fetchall()
        
        if modules:
            logger.info(f"Found {len(modules)} modules in SQLite")
            
            # Выводим информацию о модулях для отладки
            for i, module in enumerate(modules[:10]):
                logger.info(f"SQLite Module {i+1}: id={module['id']}, name='{module['name']}', color='{get_sqlite_value(module, 'color', 'NOT_SET')}'")
            
            module_data = []
            for m in modules:
                module_id = m['id']
                module_name = m['name']
                module_color = get_sqlite_value(m, 'color')
                
                # Если цвет не установлен или некорректный, генерируем его
                if not module_color or module_color == '#000000' or module_color == 'NOT_SET':
                    module_color = generate_module_color(module_id)
                    logger.info(f"Generated color {module_color} for module {module_id}")
                
                module_data.append((
                    module_id, 
                    module_name, 
                    module_color
                ))
            
            execute_values(
                pg_cursor,
                'INSERT INTO modules (id, name, color) VALUES %s',
                module_data
            )
            logger.info(f"Migrated {len(modules)} modules")
        
        # 4. Миграция типов сообщений
        logger.info("Ensuring message types...")
        pg_cursor.execute("""
            INSERT INTO message_type (id, type) VALUES 
            (0, 'Mesh'),
            (1, 'Sim'),
            (2, 'Mesh / Sim')
            ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type
        """)
        
        # 5. Миграция данных
        logger.info("Migrating data...")
        data = sqlite_conn.execute('SELECT * FROM data').fetchall()
        if data:
            data_records = []
            for d in data:
                data_records.append((
                    d['id_module'], 
                    d['id_session'], 
                    get_sqlite_value(d, 'id_message_type', 0),
                    d['datetime'],
                    get_sqlite_value(d, 'datetime_unix', 0),
                    get_sqlite_value(d, 'lat'),
                    get_sqlite_value(d, 'lon'),
                    get_sqlite_value(d, 'alt'),
                    bool(get_sqlite_value(d, 'gps_ok', 0)),
                    get_sqlite_value(d, 'message_number', 0),
                    get_sqlite_value(d, 'rssi'),
                    get_sqlite_value(d, 'snr'),
                    get_sqlite_value(d, 'source'),
                    get_sqlite_value(d, 'jumps')
                ))
            
            execute_values(
                pg_cursor,
                '''INSERT INTO data 
                (id_module, id_session, id_message_type, datetime, datetime_unix,
                 lat, lon, alt, gps_ok, message_number, rssi, snr, source, jumps) 
                VALUES %s''',
                data_records
            )
            logger.info(f"Migrated {len(data)} data records")
        
        # Включаем проверку внешних ключей обратно
        logger.info("Re-enabling foreign key checks...")
        pg_cursor.execute("SET session_replication_role = 'origin';")
        
        pg_conn.commit()
        logger.info("Migration completed successfully!")
        return True
        
    except Exception as e:
        pg_conn.rollback()
        logger.error(f"Migration error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False
    finally:
        sqlite_conn.close()
        pg_conn.close()

def verify_migration():
    """Проверка успешности миграции"""
    try:
        pg_conn = psycopg2.connect(os.getenv('DATABASE_URL', 'postgresql://telemetry_user:telemetry_password@localhost:5432/telemetry_db'))
        pg_cursor = pg_conn.cursor()
        
        logger.info("=== VERIFICATION ===")
        
        # Проверяем модули
        logger.info("Modules in PostgreSQL:")
        pg_cursor.execute("SELECT id, name, color FROM modules ORDER BY id")
        modules = pg_cursor.fetchall()
        for module in modules:
            logger.info(f"  Module {module[0]}: '{module[1]}' with color '{module[2]}'")
        
        # Проверяем количество записей
        tables = {
            'module': 'SELECT COUNT(*) FROM modules',
            'sessions': 'SELECT COUNT(*) FROM sessions',
            'data': 'SELECT COUNT(*) FROM data'
        }
        
        for table_name, query in tables.items():
            pg_cursor.execute(query)
            count = pg_cursor.fetchone()[0]
            logger.info(f"{table_name}: {count} records")
        
        # Проверяем целостность данных
        pg_cursor.execute("""
            SELECT COUNT(*) as data_count 
            FROM data d 
            JOIN modules m ON d.id_module = m.id 
            JOIN sessions s ON d.id_session = s.id
        """)
        valid_data_count = pg_cursor.fetchone()[0]
        logger.info(f"Valid data records (with both module and session): {valid_data_count}")
        
        pg_conn.close()
        
    except Exception as e:
        logger.error(f"Verification error: {e}")

def inspect_sqlite_data():
    """Просмотр данных в SQLite для отладки"""
    sqlite_path = 'frontend/app/database.db'
    if not os.path.exists(sqlite_path):
        logger.error(f"SQLite database not found at {sqlite_path}")
        return
    
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    
    try:
        logger.info("=== SQLITE DATA INSPECTION ===")
        
        # Модули в SQLite
        modules = sqlite_conn.execute('SELECT * FROM module ORDER BY id').fetchall()
        logger.info(f"Modules in SQLite: {len(modules)}")
        for module in modules:
            logger.info(f"  Module {module['id']}: name='{module['name']}', color='{get_sqlite_value(module, 'color', 'NOT_SET')}'")
        
        # Сессии в SQLite
        sessions = sqlite_conn.execute('SELECT * FROM sessions ORDER BY id').fetchall()
        logger.info(f"Sessions in SQLite: {len(sessions)}")
        for session in sessions:
            logger.info(f"  Session {session['id']}: '{session['name']}'")
        
        # Данные в SQLite
        data_count = sqlite_conn.execute('SELECT COUNT(*) FROM data').fetchone()[0]
        logger.info(f"Data records in SQLite: {data_count}")
        
    except Exception as e:
        logger.error(f"Error inspecting SQLite data: {e}")
    finally:
        sqlite_conn.close()

if __name__ == '__main__':
    # Сначала просмотрим данные в SQLite
    inspect_sqlite_data()
    
    # Затем выполняем миграцию
    if migrate_data():
        verify_migration()
    else:
        logger.error("Migration failed!")