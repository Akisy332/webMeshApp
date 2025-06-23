from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import json
import threading
import time
import datetime
import random
from gevent import monkey

monkey.patch_all()

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", ping_interval=25, ping_timeout=5)

class SocketIOServer:
    def __init__(self):
        self.clients = set()
        self.markers = {}
        self.paths = {}
        self.current_view = {'lat': 55.7558, 'lon': 37.6173, 'zoom': 10}
        self.lock = threading.Lock()
        self.random_marker_path = []
        self.table_data = {}  # Данные для таблицы

    def broadcast(self, event, message):
        with self.lock:
            socketio.emit(event, message)

io_server = SocketIOServer()

@app.route('/')
def index():
    initial_view = {
        'lat': io_server.current_view.get('lat', 51.505),
        'lon': io_server.current_view.get('lon', -0.09),
        'zoom': io_server.current_view.get('zoom', 13)
    }
    return render_template('index.html', initial_view=initial_view)

@app.route('/get_table_data')
def get_table_data():
    return jsonify(io_server.table_data)

@socketio.on('connect')
def handle_connect():
    print('Client connected:', request.sid)
    io_server.clients.add(request.sid)
    
    # Отправляем текущее состояние
    initial_data = {
        'view': io_server.current_view,
        'markers': list(io_server.markers.values()),
        'paths': list(io_server.paths.values()),
        'random_marker_path': io_server.random_marker_path,
        'table_data': io_server.table_data
    }
    emit('map_init', initial_data)

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected:', request.sid)
    if request.sid in io_server.clients:
        io_server.clients.remove(request.sid)

@socketio.on('add_random_point')
def handle_add_random_point(data=None):
    lat = io_server.current_view['lat'] + (random.random() - 0.5) * 0.1
    lon = io_server.current_view['lon'] + (random.random() - 0.5) * 0.1
    
    # Всегда используем один и тот же source для случайного маркера
    source = 'random_marker'
    path_source = 'random_marker_path'
    
    # Добавляем новую точку в путь
    io_server.random_marker_path.append([lat, lon])
    
    # Обновляем данные маркера (всегда последняя точка)
    marker_data = {
        'source': source,
        'lat': lat,
        'lon': lon,
        'text': f'Random point {len(io_server.random_marker_path)}',
        'color': '#FF0000',

        'name': 'Случайный маркер',
        'alt': random.randint(0, 1000),
        'time': time.time(),
        'visible': True,
        'trace': True
    }
    
    if source in io_server.table_data:
        io_server.table_data[source].update(marker_data)
    else:
        io_server.table_data[source] = marker_data
        print(io_server.table_data)
    
    # Обновляем данные пути
    path_data = {
        'source': path_source,
        'coords': io_server.random_marker_path,
        'color': '#FF0000',
        'width': 3
    }
    
    # Обновляем данные таблицы
    table_data = {
        'name': 'Случайный маркер',
        'alt': random.randint(0, 1000),
        'time': time.time(),
        'visible': True,
        'trace': True
    }
    
    # Отправляем обновления
    io_server.broadcast('marker_update', marker_data)
    io_server.broadcast('path_update', path_data)
    io_server.broadcast('table_update', {source: table_data})    


# Обработчики для таблицы
@socketio.on('update_table_row')
def handle_update_table_row(data):
    source = data['source']
    changes = data['changes']
    
    if source not in ['random_marker', 'random_marker_path']:
        return
    
    # Обновляем данные в таблице
    if source in io_server.table_data:
        print("update", io_server.table_data[source])
        io_server.table_data[source].update(changes)
        
    else:
        
        io_server.table_data[source] = changes
        print("new", io_server.table_data[source])
    print(io_server.table_data[source])
    # Отправляем обновление всем клиентам
    io_server.broadcast('table_update', {source: io_server.table_data[source]})
    
    # Обрабатываем видимость маркера
    if 'visible' in changes:
        
        marker_data = {
            'source': 'random_marker',
            'visible': changes['visible']
        }
        io_server.table_data[source].update(marker_data)
        io_server.broadcast('marker_update', io_server.table_data[source])
    
    # Обрабатываем видимость пути
    if 'trace' in changes:
        path_visible = changes['trace'] and io_server.table_data.get(source, {}).get('visible', True)
        path_data = {
            'source': 'random_marker_path',
            'visible': path_visible
        }
        io_server.broadcast('path_update', path_data)

@socketio.on('delete_table_row')
def handle_delete_table_row(source):
    if source in io_server.table_data:
        del io_server.table_data[source]
        io_server.broadcast('table_update', io_server.table_data)

@socketio.on('add_table_row')
def handle_add_table_row(data):
    source = data.get('source')
    if source not in io_server.table_data:
        io_server.table_data[source] = {
            'name': data.get('name', 'New Row'),
            'alt': data.get('alt', 0),
            'time': time.time(),
            'visible': True,
            'trace': False
        }
        io_server.broadcast('table_update', io_server.table_data)