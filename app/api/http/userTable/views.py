from flask import Blueprint, request, jsonify
import json
from app.models.database import DatabaseManager


from flask_jwt_extended import jwt_required, get_jwt

userTable = Blueprint("userTable", __name__)

@userTable.route('/api/sessions', methods=['GET'])
def getSessions():
    """Получение списка всех сессий"""
    db_manager = DatabaseManager()
    return jsonify(db_manager.get_all_sessions())

@userTable.route('/api/sessions/<int:session_id>/data', methods=['GET'])
def get_session_data(session_id):
    """Получение данных конкретной сессии"""
    db_manager = DatabaseManager()
    return jsonify(db_manager.get_last_message(session_id))

# @app.route('/api/sessions', methods=['POST'])
# def create_session():
#     """Создание новой сессии"""
#     data = request.get_json()
    
#     if not data or 'name' not in data:
#         return jsonify({'error': 'Name is required'}), 400
    
#     new_id = max(sessions_db.keys()) + 1 if sessions_db else 1
    
#     sessions_db[new_id] = {
#         'id': new_id,
#         'name': data['name'],
#         'description': data.get('description', ''),
#         'created_at': datetime.now().isoformat(),
#         'data': []
#     }
    
#     return jsonify(sessions_db[new_id]), 201

# @app.route('/api/delete-module', methods=['POST'])
# def delete_module():
#     """Удаление модуля из сессии"""
#     data = request.get_json()
    
#     if not data or 'id' not in data or 'id_session' not in data:
#         return jsonify({'error': 'Invalid request'}), 400
    
#     session_id = data['id_session']
#     module_id = data['id']
    
#     if session_id not in sessions_db:
#         return jsonify({'error': 'Session not found'}), 404
    
#     # Удаляем модуль из данных сессии
#     sessions_db[session_id]['data'] = [
#         m for m in sessions_db[session_id]['data'] 
#         if m['id_module'] != module_id
#     ]
    
#     return jsonify({'success': True})