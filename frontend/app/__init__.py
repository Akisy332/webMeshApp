from flask import Flask
from flask_socketio import SocketIO
import os

print("start")

app = Flask(__name__, 
           static_folder='static',
           template_folder='templates')

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'mysecretkey')
app.config['DATABASE_URL'] = os.getenv('DATABASE_URL', 'sqlite:///app/database.db')
app.config['UPLOAD_FOLDER'] = 'uploads'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

socketio = SocketIO(app, cors_allowed_origins="*", ping_interval=25, ping_timeout=5
)

# Инициализация БД
from shared.database import init_db
init_db()

# Инициализация маршрутов и WebSocket
from . import routes, websockets


# Запуск TCP клиента
from shared.tcp_client import start_tcp_client
start_tcp_client(socketio)

@app.route('/health-check')
def health_check():
    return "Health check OK - routes are working"