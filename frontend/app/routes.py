# frontend/app/routes.py
from flask import render_template, jsonify
from . import app, socketio
import logging

logger = logging.getLogger('frontend-routes')

# ==================== STATIC PAGES ====================

@app.route('/')
def main_page():
    """Главная страница сайта"""
    logger.info("Serving main page")
    return render_template("main_page/template.html")

@app.route('/table')
def table_page():
    """Страница с таблицей телеметрии"""
    logger.info("Serving table page")
    return render_template('telemetry_data_table/template.html')

@app.route('/database')
def database_page():
    """Страница просмотра базы данных"""
    logger.info("Serving database page")
    return render_template('database_viewer/template.html')

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