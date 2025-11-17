# frontend/app/routes.py
from flask import render_template, jsonify, request
from . import app
import requests
import logging

logger = logging.getLogger('frontend-routes')

def get_current_user(request):
    """Получаем данные пользователя через Traefik headers или напрямую"""
    
    # Способ 1: Через Traefik forwardAuth (предпочтительно)
    user_id = request.headers.get('X-User-Id')
    username = request.headers.get('X-User-Name')
    role = request.headers.get('X-User-Role')
    
    if user_id and username:
        return {
            'user_id': user_id,
            'username': username,
            'role': role or 'user',
            'authenticated': True
        }
    
    # Способ 2: Прямой запрос к auth-service (fallback)
    try:
        # Копируем cookies из входящего запроса
        cookies = {}
        for cookie_name in request.cookies:
            cookies[cookie_name] = request.cookies.get(cookie_name)
        
        auth_response = requests.get(
            'http://auth-service:8003/api/auth/current-user',
            cookies=cookies,
            timeout=3
        )
        
        if auth_response.status_code == 200:
            user_data = auth_response.json()
            return {
                'user_id': user_data.get('user_id'),
                'username': user_data.get('username'),
                'role': user_data.get('role', 'user'),
                'authenticated': True
            }
    except Exception as e:
        logger.warning(f"Direct auth check failed: {e}")
    
    # Пользователь не аутентифицирован
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