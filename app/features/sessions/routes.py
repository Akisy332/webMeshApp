from flask import Blueprint, request, jsonify
import json
from app.shared.database.models import DatabaseManager
from flask_socketio import SocketIO, emit
import uuid
from datetime import datetime
from app.features.sessions.services import parseDate
from app.core.socketio import socketio
from flask_jwt_extended import jwt_required, get_jwt

sessions = Blueprint("sessions", __name__)

@sessions.route('/api/sessions', methods=['GET'])
def getSessions():
    """Получение списка всех сессий"""
    db_manager = DatabaseManager()
    return jsonify(db_manager.get_all_sessions())

@sessions.route('/api/sessions', methods=['POST'])
def create_session():
    """Создать новую сессию"""
    data = request.get_json()
    
    if not data or 'name' not in data:
        return jsonify({'error': 'Необходимо указать название сессии'}), 400
    
    datetime = parseDate(data)
    
    db_manager = DatabaseManager()
    id = db_manager._create_session(data['name'], data.get('description', ''), datetime)
    
    new_session = {
        'id': id,
        'name': data['name'],
        'description': data.get('description', ''),
        'datetime': datetime.isoformat()
    }
    
    # Уведомляем всех клиентов через WebSocket о новом списке сессий
    socketio.emit('session_updated', {'action': 'created', 'session': new_session})
    
    return jsonify(new_session), 201

@sessions.route('/api/sessions/<int:session_id>/data', methods=['GET'])
def get_session_data(session_id):
    """Получение данных конкретной сессии"""
    db_manager = DatabaseManager()
    return jsonify(db_manager.get_last_message(session_id))



# @app.route('/api/sessions/<session_id>', methods=['PUT'])
# def update_session(session_id):
#     """Обновить существующую сессию"""
#     data = request.get_json()
    
#     session = next((s for s in sessions if s['id'] == session_id), None)
#     if not session:
#         return jsonify({'error': 'Сессия не найдена'}), 404
    
#     if 'name' in data:
#         session['name'] = data['name']
#     if 'description' in data:
#         session['description'] = data['description']
#     if 'date' in data:
#         session['date'] = data['date']
    
#     session['datetime'] = datetime.now().isoformat()
    
#     # Уведомляем через WebSocket
#     socketio.emit('session_updated', {'action': 'updated', 'session': session})
    
#     return jsonify(session)

@sessions.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Удалить сессию"""
    
    db_manager = DatabaseManager()
    if not db_manager.hide_session(session_id):
        return jsonify({'error': 'Сессия не найдена'}), 404
    
    # Уведомляем через WebSocket
    socketio.emit('session_updated', {'action': 'deleted', 'session_id': session_id})
    
    return jsonify({'message': 'Сессия удалена'}), 200

# @app.route('/api/sessions/<session_id>/data', methods=['GET'])
# def get_session_data(session_id):
#     """Получить данные конкретной сессии"""
#     session = next((s for s in sessions if s['id'] == session_id), None
#     if not session:
#         return jsonify({'error': 'Сессия не найдена'}), 404
    
#     # Здесь можно добавить дополнительные данные сессии
#     return jsonify(session)