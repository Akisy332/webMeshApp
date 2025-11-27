# frontend/app/routes.py
from flask import render_template, jsonify, request, session
from . import app
import requests
import logging
import jwt

logger = logging.getLogger('frontend-routes')

def get_current_user(request):
    """Получаем данные пользователя из JWT токена в cookies"""
    
    access_token = request.cookies.get('access_token')
    
    if not access_token:
        logger.debug("No access token found in cookies")
        return {'authenticated': False, 'role': 'public'}
    
    try:
        # Декодируем JWT токен (в production добавьте verify_signature=True)
        payload = jwt.decode(access_token, options={"verify_signature": False})
        
        logger.debug(f"User authenticated: {payload.get('sub')} with role {payload.get('role')}")
        
        return {
            'user_id': payload.get('user_id'),
            'username': payload.get('sub'),
            'role': payload.get('role', 'user'),
            'authenticated': True
        }
        
    except jwt.ExpiredSignatureError:
        logger.warning("Access token expired")
        return {'authenticated': False, 'role': 'public'}
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return {'authenticated': False, 'role': 'public'}
    except Exception as e:
        logger.error(f"Unexpected error decoding token: {e}")
        return {'authenticated': False, 'role': 'public'}

# ==================== STATIC PAGES ====================

@app.route('/')
def main_page():
    """Главная страница"""
    user_data = get_current_user(request)
    is_admin = user_data.get('role') in ['admin', 'developer']
    
    return render_template(
        "main_page/template.html",
        user_data=user_data,
        is_admin=is_admin
    )

@app.route('/table')
def table_page():
    """Страница таблицы"""
    user_data = get_current_user(request)
    is_admin = user_data.get('role') in ['admin', 'developer']
    
    return render_template(
        'telemetry_data_table/template.html',
        user_data=user_data,
        is_admin=is_admin
    )

@app.route('/admin')
def admin_panel():
    """Админ-панель (скрыта от обычных пользователей)"""
    user_data = get_current_user(request)
    
    if not user_data.get('authenticated') or user_data.get('role') not in ['admin', 'developer']:
        # Возвращаем 404 чтобы скрыть существование страницы
        return jsonify({
            "error": "Not found",
            "message": "The requested resource was not found"
        }), 404
    
    return render_template(
        'admin_panel/template.html',
        user_data=user_data,
        is_admin=True
    )

@app.route('/api/protected-data')
def protected_data():
    """Пример protected API endpoint"""
    user_data = get_current_user(request)
    
    if not user_data.get('authenticated'):
        return jsonify({'error': 'Authentication required'}), 401
    
    # Проверка ролей
    if user_data.get('role') not in ['admin', 'developer', 'curator']:
        return jsonify({'error': 'Insufficient permissions'}), 403
    
    # Возвращаем данные в зависимости от роли
    if user_data.get('role') in ['admin', 'developer']:
        # data = get_all_sensitive_data()
        data = "all data"
    else:
        data = "limited data"
        # data = get_limited_data()
    
    return jsonify(data)

# ==================== HEALTH ENDPOINT ====================

@app.route('/health-check')
def health_check():
    """Проверка здоровья сервиса"""
    from . import redis_bridge
    
    redis_status = "connected" if redis_bridge and redis_bridge.is_connected() else "disconnected"
    
    return jsonify({
        'status': 'OK', 
        'service': 'frontend-static',
        'redis': redis_status,
        'websocket': 'active'
    })

@app.route('/test-redis')
def test_redis():
    """Тестовый endpoint для проверки Redis"""
    from . import redis_bridge
    
    if redis_bridge and redis_bridge.is_connected():
        return jsonify({
            'status': 'success',
            'message': 'Redis is connected',
            'bridge_running': redis_bridge.running
        })
    else:
        return jsonify({
            'status': 'error',
            'message': 'Redis is not connected'
        }), 500