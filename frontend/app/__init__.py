from flask import Flask
from flask_socketio import SocketIO
import os

app = Flask(__name__, 
           static_folder='static',
           template_folder='templates')

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'mysecretkey')

socketio = SocketIO(app, cors_allowed_origins="*", ping_interval=25, ping_timeout=5)

# Инициализация маршрутов
from . import routes

@app.route('/health')
def health():
    return "Frontend static server is running"