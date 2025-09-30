import os
from flask import Flask
from app.core.config import UPLOAD_FOLDER, DATABASE_PATH


# Иницилизация приложения
app = Flask(__name__, static_folder=None)
app.config['TODO'] = "todo"
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Инициализация БД
from app.core.database import db_executor
from app.shared.database.models import init_tables
init_tables()

# Инициализация Socket.IO
from app.core.socketio import init_socketio
init_socketio(app)

# Регистрация фич
from app.features.map_tracking import init_map_tracking
from app.features.data_management import init_data_management  
from app.features.sessions import init_sessions

init_map_tracking(app)
init_data_management(app)
init_sessions(app)

# Регистрация клиентских routes
from app.shared.web.routes import client
app.register_blueprint(client)

# TCP Client
def handle_raw_data(data):
    print(f"Received data from: {data}")

def handle_error(message):
    print(f"Error: {message}")

def handle_status(message):
    print(f"Status from: {message}")

from app.shared.tcp_client import TCPClientWorker
worker = TCPClientWorker(
    on_raw_data_received=handle_raw_data,
    on_connection_error=handle_error,
    on_status_message=handle_status
)

import threading
thread = threading.Thread(target=worker.run)
thread.daemon = True
thread.start()