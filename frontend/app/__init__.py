from flask import Flask
from flask_socketio import SocketIO
import os
import logging

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('frontend')

logger.info("Starting frontend service")

app = Flask(__name__, 
           static_folder='static',
           template_folder='templates')

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'mysecretkey')
app.config['DATABASE_URL'] = os.getenv('DATABASE_URL', 'postgresql://telemetry_user:telemetry_password@postgresql-service:5432/telemetry_db')
app.config['UPLOAD_FOLDER'] = 'uploads'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

socketio = SocketIO(app, cors_allowed_origins="*", ping_interval=25, ping_timeout=5)

# Инициализация БД
from shared.models_postgres import get_postgres_manager
db_manager = get_postgres_manager()

# Проверяем и выполняем миграцию если нужно
def check_and_migrate():
    sqlite_path = 'database.db'
    if os.path.exists(sqlite_path):
        logger.info("SQLite database found, checking if migration is needed...")
        try:
            from shared.migrate_sqlite_to_postgres import migrate_data
            if migrate_data():
                logger.info("Migration completed successfully!")
                # переименовать старую базу
                os.rename(sqlite_path, sqlite_path + '.backup')
            else:
                logger.info("Migration failed or not needed")
        except Exception as e:
            logger.info(f"Migration check failed: {e}")

# Запускаем проверку миграции при старте
check_and_migrate()

# Инициализация маршрутов и WebSocket
from . import routes, websockets


# # Запуск TCP клиента
# from shared.tcp_client import start_tcp_client
# start_tcp_client(socketio)

@app.route('/health-check')
def health_check():
    return "Health check OK - routes are working"

# Предоставляем доступ к менеджеру БД для routes
@app.context_processor
def inject_db_manager():
    return dict(db_manager=db_manager)