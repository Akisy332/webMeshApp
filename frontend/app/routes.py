from flask import render_template, jsonify, make_response, request, redirect, url_for, current_app
from werkzeug.utils import secure_filename
from . import app, socketio
from shared.models_postgres import get_postgres_manager
import os
import random
from datetime import datetime

db_manager = get_postgres_manager()

# /////////////////////////////////////////////////////////// #
# //---------------------- Template -----------------------// #
# /////////////////////////////////////////////////////////// #

@app.route('/')
def main_page():
    """Главная страница сайта"""
    # print("test ", app.template_folder)
    # print("Available templates:", os.listdir(app.template_folder))
    # return render_template("main_page/template.html")
    response = make_response(render_template("main_page/template.html"))
    return response

@app.route('/table')
def table_page():
    """Страница с таблицей телеметрии"""
    return render_template('telemetry_data_table/template.html')

@app.route('/database')
def database_page():
    """Страница просмотра базы данных"""
    return render_template('database_viewer/template.html')

# /////////////////////////////////////////////////////////// #
# //----------------------- Sessions ----------------------// #
# /////////////////////////////////////////////////////////// #

@app.route('/api/sessions', methods=['GET'])
def getSessions():
    """Получение списка всех сессий"""
    try:
        sessions = db_manager.get_all_sessions()
        return jsonify(sessions)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sessions', methods=['POST'])
def create_session():
    """Создать новую сессию"""
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'error': 'Необходимо указать название сессии'}), 400
        
        # Используем встроенный метод создания сессии
        session_id = db_manager._get_or_create_session(None, data['name'], data.get('description', ''))
        
        if not session_id:
            return jsonify({'error': 'Не удалось создать сессию'}), 500
            
        # Получаем данные созданной сессии
        session_data = db_manager._get_session_by_id(session_id)
        
        new_session = {
            'id': session_id,
            'name': data['name'],
            'description': data.get('description', ''),
            'datetime': session_data['datetime'].isoformat() if session_data and session_data.get('datetime') else datetime.now().isoformat()
        }
        
        # Уведомляем всех клиентов через WebSocket о новом списке сессий
        socketio.emit('session_updated', {'action': 'created', 'session': new_session})
        
        return jsonify(new_session), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/sessions/<int:session_id>', methods=['GET'])
def get_session_data(session_id):
    """Получение данных конкретной сессии"""
    try:
        data = {}
        data["modules"] = db_manager.get_last_message(session_id)
        data["map"] = db_manager.get_session_map_view(session_id)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Удалить сессию"""
    try:
        if not db_manager.hide_session(session_id):
            return jsonify({'error': 'Сессия не найдена'}), 404
        
        # Уведомляем через WebSocket
        socketio.emit('session_updated', {'action': 'deleted', 'session_id': session_id})
        
        return jsonify({'message': 'Сессия удалена'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sessions/data/<int:session_id>', methods=['GET'])
def get_session_center_radius(session_id):
    """Получение данных конкретной сессии"""
    try:
        data = db_manager.get_session_map_view(session_id)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# /////////////////////////////////////////////////////////// #
# //------------------------ Table ------------------------// #
# /////////////////////////////////////////////////////////// #

@app.route('/api/table/users/search')
def search_user():
    """API endpoint для поиска пользователя по полю"""
    try:
        field = request.args.get('field', '').strip()
        value = request.args.get('value', '').strip()
        
        valid_fields = ['name_module', 'id_module', 'source', 'status', 'rssi']
        if not field or field not in valid_fields:
            return jsonify({'success': False, 'error': f'Invalid field. Valid fields: {valid_fields}'}), 400
        
        if not value:
            return jsonify({'success': False, 'error': 'Value is required'}), 400
        
        target_id = None
        
        if field == 'name_module' and 'Module' in value:
            try:
                id_from_name = int(value.replace('Module', '').strip())
                if 1 <= id_from_name <= 10000:
                    target_id = id_from_name
            except ValueError:
                pass
        
        elif field == 'id_module' and value.startswith('MOD'):
            try:
                id_from_module = int(value.replace('MOD', ''))
                if 1 <= id_from_module <= 10000:
                    target_id = id_from_module
            except ValueError:
                pass
        
        elif field == 'source':
            # Для source ищем случайное совпадение
            target_id = random.randint(1, 10000)
        
        elif field == 'rssi':
            # Для RSSI ищем по значению dBm
            try:
                db_value = int(value.replace('dBm', '').replace('-', '').strip())
                target_id = random.randint(1, 10000)
            except ValueError:
                pass
        
        if not target_id:
            target_id = random.randint(1, 10000)
        
        return jsonify({
            'success': True,
            'field': field,
            'value': value,
            'target_id': target_id,
            'message': f'Found {field} = "{value}" at ID {target_id}'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/table/users')
def get_users():
    """API endpoint для получения данных с пагинацией"""
    try: 
               
        session_id = int(request.args.get('session_id', 0))
        modules_str = request.args.get('modules', '')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        direction = request.args.get('direction', 'down')
        
        # Преобразуем строку в список integers
        if modules_str:
            module_ids = [int(x.strip()) for x in modules_str.split(',') if x.strip()]
        else:
            module_ids = []
        
        if offset < 0 or limit <= 0 or limit > 500:
            return jsonify({'error': 'Invalid parameters'}), 400
        
        if direction == 'up':
            offset = offset - int((limit))
            if offset < 0:
                offset = 0
                
        data, total_count, modules_count = db_manager.get_session_data(
            session_id=session_id,
            module_ids=module_ids,
            limit=limit,
            offset=offset
        )         
        
        if direction == 'up':
            has_more = (offset + limit) < total_count
        else:
            has_more = (offset + limit) > 1
            
        print({
            'success': True,
            'total_count': total_count,
            'session_id': session_id,
            'has_more': has_more,
            'direction': direction,
            'limit': limit,
            'offset': offset,
            'total_visible_count': modules_count,
        })
        
        return jsonify({
            'success': True,
            'data': data,
            'total_count': total_count,
            'session_id': session_id,
            'has_more': has_more,
            'direction': direction,
            'limit': limit,
            'offset': offset,
            'total_visible_count': modules_count,
        })

        
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500                
    
@app.route('/api/table/users/datetime')
def get_users_datetime():
    """API endpoint для получения данных вокруг указанного datetime_unix"""
    try:         
        session_id = int(request.args.get('session_id', 0))
        modules_str = request.args.get('modules', '')
        limit = int(request.args.get('limit', 100))
        datetime_unix = int(request.args.get('datetime', 0))
        direction = request.args.get('direction', 'down')
        
        # Преобразуем строку в список integers
        if modules_str:
            module_ids = [int(x.strip()) for x in modules_str.split(',') if x.strip()]
        else:
            module_ids = []
        
        if datetime_unix <= 0 or limit <= 0 or limit > 500:
            return jsonify({'error': 'Invalid parameters'}), 400
                
        data, total_count, modules_count, position = db_manager.get_session_data_centered_on_time(
            session_id=session_id,
            module_ids=module_ids,
            limit=limit,
            target_datetime_unix=datetime_unix
        )         
        
        if direction == 'up':
            has_more = (datetime_unix + limit) < total_count
        else:
            has_more = (datetime_unix + limit) > 1
            
        print({
            'success': True,
            'total_count': total_count,
            'session_id': session_id,
            'has_more': has_more,
            'direction': direction,
            'limit': limit,
            'datetime_unix': datetime_unix,
            'total_visible_count': modules_count,
            'target_id': position,
        })
        
        return jsonify({
            'success': True,
            'data': data,
            'total_count': total_count,
            'session_id': session_id,
            'has_more': has_more,
            'direction': direction,
            'limit': limit,
            'datetime_unix': datetime_unix,
            'total_visible_count': modules_count,
            'target_id': position,
        })

        
    except ValueError as e:
        print(e)
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        print(e)
        return jsonify({'success': False, 'error': str(e)}), 500            


# /////////////////////////////////////////////////////////// #
# //----------------------- Modules -----------------------// #
# /////////////////////////////////////////////////////////// #

@app.route('/api/modules/trace', methods=['GET'])
def get_trace_module():
    id_module = request.args.get('id_module', type=str)
    id_session = request.args.get('id_session', type=int)
    id_message_type = request.args.get('id_message_type', type=int)
    
    data = db_manager.get_module_coordinates(int(id_module, 16), id_session, id_message_type)
   
    return jsonify(data)

@app.route('/api/modules', methods=['GET'])
def get_modules():
    modules = db_manager.get_all_modules()
    return jsonify(modules)

@app.route('/api/modules/<int:module_id>/stats', methods=['GET'])
def get_module_stats(module_id):
    """Получение статистики по модулю"""
    try:
        session_id = request.args.get('session_id', type=int)
        stats = db_manager.get_module_statistics(module_id, session_id)
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/modules/search', methods=['GET'])
def search_modules():
    """Поиск модулей"""
    try:
        search_term = request.args.get('q', '')
        if not search_term:
            return jsonify([])
        
        results = db_manager.search_modules(search_term)
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# /////////////////////////////////////////////////////////// #
# //------------------------ Other ------------------------// #
# /////////////////////////////////////////////////////////// #

@app.route('/api/database/data')
def get_data():
    data = db_manager.get_all_data()
    return jsonify(data)

@app.route('/api/database/sessions')
def get_sessions():
    sessions = db_manager.get_all_sessions()
    return jsonify(sessions)

@app.route('/api/database/upload', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        if 'file' not in request.files:
            return redirect(request.url)
        
        file = request.files['file']
        session_name = request.form.get('session_name', 'default_session')
        
        if file.filename == '':
            return redirect(request.url)
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            session_id = db_manager._get_or_create_session(None, session_name)
            try:
                with open(filepath, 'r') as f:
                    lines = f.readlines()
                    success_count = 0
                    error_count = 0
                    
                    for line in lines:
                        line = line.strip()
                        if line:
                            result = db_manager.parse_and_store_data(line, session_id, session_name)
                            if result:
                                success_count += 1
                            else:
                                error_count += 1
                
                return f'''
                    <script>
                        alert('Файл успешно обработан! Успешно: {success_count}, Ошибок: {error_count}');
                        window.location.href = '/';
                    </script>
                '''
            except Exception as e:
                return f'''
                    <script>
                        alert('Ошибка при обработке файла: {str(e)}');
                        window.location.href = '/';
                    </script>
                '''
            finally:
                if os.path.exists(filepath):
                    os.remove(filepath)
    
    return '''
    <form method="post" enctype="multipart/form-data">
        <input type="file" name="file">
        <input type="text" name="session_name" placeholder="Session name">
        <input type="submit" value="Upload">
    </form>
    '''

def allowed_file(filename):
    ALLOWED_EXTENSIONS = {'txt', 'csv'}
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/database/stats')
def get_database_stats():
    """Получение статистики базы данных"""
    try:
        stats = db_manager.get_database_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health():
    return jsonify({'status': 'OK', 'service': 'frontend'})
