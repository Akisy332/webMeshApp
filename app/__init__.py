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
from app.api.database.views import database

app.register_blueprint(database)

# здесь будет api/storage системы
from app.api.map.views import map

app.register_blueprint(map)

# # здесь будет api/user системы
# from app.api.user.views import user

# app.register_blueprint(user)

# # здесь будет api/push системы
# from app.api.push.views import push

# app.register_blueprint(push)

############# api ################
