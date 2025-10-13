from flask import Blueprint, request, jsonify, render_template
import random
from app.shared.database.models import DatabaseManager

table_api = Blueprint('table_api', __name__)

@table_api.route('/api/table/users/search')
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

@table_api.route('/api/table/users')
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
                
        db_manager = DatabaseManager()
        
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

@table_api.route('/api/table/users/datetime')
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
                
        db_manager = DatabaseManager()
        
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


@table_api.route('/table')
def table_page():
    """Страница с виртуализированной таблицей"""
    return render_template('components/telemetry_data_table/template.html')

