import os
import json
import requests
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
import logging
from datetime import datetime, timezone

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('websocket-gateway')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'websocket-secret-key'

socketio = SocketIO(
    app, 
    cors_allowed_origins="*",
    async_mode='eventlet',
    logger=True,
    engineio_logger=True
)

# Конфигурация сервисов
SERVICES = {
    'frontend': os.getenv('FRONTEND_SERVICE_URL', 'http://frontend:5000/'),
}

# Хранилище сессий пользователей
user_sessions = {} # пользовательские подключения
socket_sessions = {} # технические данные соединений

@app.route('/health')
def health():
    return jsonify({'status': 'OK', 'service': 'websocket-gateway'})

# HTTP endpoint для рассылки сообщений от сервисов
@app.route('/broadcast', methods=['POST'])
def broadcast_message():
    """Сервисы могут отправлять сообщения всем клиентам через этот endpoint"""
    data = request.get_json()
    event_name = data.get('event')
    event_data = data.get('data', {})
    
    # Отправляем всем подключенным клиентам
    socketio.emit(event_name, event_data, broadcast=True)
    
    return jsonify({'status': 'broadcasted', 'event': event_name})

@app.route('/send_to_user', methods=['POST'])
def send_to_user():
    """Отправка сообщения конкретному пользователю"""
    data = request.get_json()
    user_id = data.get('user_id')
    event_name = data.get('event')
    event_data = data.get('data', {})
    logger.info(f'Sending data : to user: {request.sid}')
    # Отправляем конкретному пользователю
    if user_id in user_sessions:
        for sid in user_sessions[user_id]:
            socketio.emit(event_name, event_data, room=sid)
    
    return jsonify({'status': 'sent', 'user_id': user_id, 'event': event_name})

# WebSocket события
@socketio.on('connect')
def handle_connect():
    """Обработка подключения клиента"""
    logger.info(f'✅ Client connected: {request.sid}')
    
    # Пока просто сохраняем подключение без пользователя
    socket_sessions[request.sid] = {'authenticated': False}
    
    emit('connected', {
        'message': 'Connected to WebSocket Gateway', 
        'sid': request.sid,
        'status': 'success',
        'authenticated': False
    })

# @socketio.on('authenticate')
# def handle_authentication(data):
#     """Аутентификация пользователя"""
#     logger.info(f'🔐 Authentication attempt from {request.sid}')
    
#     token = data.get('token', 'demo-token')
#     user = authenticate_token(token)
    
#     if user:
#         # Сохраняем сессию
#         user_id = user['id']
#         socket_sessions[request.sid] = {
#             'authenticated': True,
#             'user_id': user_id,
#             'user_data': user
#         }
        
#         # Добавляем в user_sessions
#         if user_id not in user_sessions:
#             user_sessions[user_id] = []
#         user_sessions[user_id].append(request.sid)
        
#         emit('authenticated', {
#             'success': True,
#             'user': user,
#             'message': 'Authentication successful'
#         })
#         logger.info(f"✅ User {user['username']} authenticated and added to sessions")
#     else:
#         emit('auth_error', {'error': 'Invalid token'})

@socketio.on('disconnect')
def handle_disconnect():
    """Обработка отключения клиента"""
    logger.info(f'❌ Client disconnected: {request.sid}')
    
    # Удаляем из сессий
    session_data = socket_sessions.get(request.sid)
    if session_data and session_data.get('authenticated'):
        user_id = session_data['user_id']
        if user_id in user_sessions:
            user_sessions[user_id] = [sid for sid in user_sessions[user_id] if sid != request.sid]
            if not user_sessions[user_id]:
                del user_sessions[user_id]
    
    # Удаляем из socket_sessions
    if request.sid in socket_sessions:
        del socket_sessions[request.sid]

@socketio.on('ping')
def handle_ping(data):
    """Проверка соединения"""
    emit('pong', {
        'message': 'pong',
        'timestamp': data.get('timestamp'),
        'server_time': datetime.now(timezone.utc).isoformat()
    })

# @socketio.on('get_tasks')
# def handle_get_tasks():
#     """Запрос списка задач"""
#     print(f'📋 Tasks request from {request.sid}')
    
#     try:
#         # Запрашиваем задачи из сервиса web
#         response = requests.get(f"{SERVICES['web']}/api/tasks", timeout=5)
#         if response.status_code == 200:
#             tasks = response.json()
#             emit('tasks_list', {'tasks': tasks})
#             print(f"✅ Sent {len(tasks)} tasks to {request.sid}")
#         else:
#             emit('error', {'error': 'Failed to fetch tasks'})
#     except Exception as e:
#         print(f"❌ Error fetching tasks: {e}")
#         emit('error', {'error': f'Failed to get tasks: {str(e)}'})

# @socketio.on('get_stats')
# def handle_get_stats():
#     """Запрос статистики"""
#     print(f'📊 Stats request from {request.sid}')
    
#     try:
#         response = requests.get(f"{SERVICES['web']}/api/stats", timeout=5)
#         if response.status_code == 200:
#             stats = response.json()
#             emit('stats_update', {'stats': stats})
#             print(f"✅ Sent stats to {request.sid}")
#     except Exception as e:
#         print(f"❌ Error fetching stats: {e}")
#         emit('error', {'error': f'Failed to get stats: {str(e)}'})

# @socketio.on('create_task')
# def handle_create_task(data):
#     """Создание новой задачи"""
    
#     import logging
#     logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
#     logging.info("Это сообщение точно появится в логах")

#     user_data = socket_sessions.get(request.sid)
#     if not user_data:
#         emit('error', {'error': 'Not authenticated'})
#         return

#     print(f'🆕 Task creation from {user_data["username"]}: {data.get("title")}')
    
#     try:
#         response = requests.post(
#             f"{SERVICES['web']}/api/tasks",
#             json={
#                 'title': data.get('title'),
#                 'description': data.get('description', ''),
#                 'user_id': user_data['id']
#             },
#             timeout=5
#         )
        
#         if response.status_code == 200:
#             task = response.json().get('task')
#             emit('task_created', {
#                 'message': 'Task created successfully',
#                 'task': task
#             })
            
#             # Уведомляем всех подключенных клиентов
#             emit('task_created_broadcast', {
#                 'task': task,
#                 'user': user_data
#             }, broadcast=True, include_self=False)
            
#             print(f"✅ Task created: {task['title']}")
#         else:
#             emit('error', {'error': 'Failed to create task'})
#     except Exception as e:
#         print(f"❌ Error creating task: {e}")
#         emit('error', {'error': f'Failed to create task: {str(e)}'})

if __name__ == '__main__':
    port = 8001
    logger.info(f"🚀 Starting WebSocket Gateway on port {port}...")
    socketio.run(
        app, 
        host='0.0.0.0', 
        port=port, 
        debug=False, 
        allow_unsafe_werkzeug=False
    )