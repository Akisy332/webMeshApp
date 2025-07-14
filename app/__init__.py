import os
from flask import Flask

# Иницилизация приложения
app = Flask(__name__, static_folder=None)
app.config['TODO'] = "todo"
UPLOAD_FOLDER = 'uploads'
DATABASE_PATH = "./database.db"
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


from app.models.database_executor import SQLiteExecutor
db_executor = SQLiteExecutor(DATABASE_PATH)
from app.models.database import init_tables
init_tables()

from app.core.socketio import init_socketio
# Инициализация Socket.IO
init_socketio(app)



##### Клиентские blueprints #####

########### client ###############

# здесь находится client main html
from app.client.views import client

app.register_blueprint(client)

########### client ###############
#
#
#
############# api ################

##### Серверные blueprints #####

# Import the application views
# from app import views

# # здесь будет api/auth системы
# from app.api.auth.views import auth

# app.register_blueprint(auth)

# # здесь будет api/menu системы
# from app.api.menu.views import menu

# app.register_blueprint(menu)

# здесь будет api/order системы
from app.api.http.database.views import database

app.register_blueprint(database)

# здесь будет api/order системы
from app.api.http.userTable.views import userTable

app.register_blueprint(userTable)

# здесь будет api/storage системы
from app.api.http.map.views import map

app.register_blueprint(map)

# # здесь будет api/user системы
# from app.api.user.views import user

# app.register_blueprint(user)

# # здесь будет api/push системы
# from app.api.push.views import push

# app.register_blueprint(push)

############# api ################

def handle_raw_data(data):
    print(f"Received data from: {data}")

def handle_error(message):
    print(f"Error: {message}")

def handle_status(message):
    print(f"Status from: {message}")

from app.models.serverHandler import TCPClientWorker
worker = TCPClientWorker(
    on_raw_data_received=handle_raw_data,
    on_connection_error=handle_error,
    on_status_message=handle_status
)

# Запуск в отдельном потоке
import threading
thread = threading.Thread(target=worker.run)
thread.daemon = True
thread.start()