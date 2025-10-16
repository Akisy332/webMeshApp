from flask import Flask, request, jsonify, Response
import requests
import os
import time
import logging
from datetime import datetime

app = Flask(__name__)

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('api-gateway')

# Конфигурация сервисов
SERVICES = {
    'frontend': os.getenv('FRONTEND_SERVICE_URL', 'http://frontend:5000/'),
}

def proxy_request(service_name, path, method='GET', data=None):
    """Проксирует HTTP запрос к целевому сервису"""
    service_url = SERVICES[service_name]
    url = f"{service_url}{path}"
    
    # Фильтруем заголовки (убираем host чтобы не мешал)
    headers = {key: value for key, value in request.headers if key.lower() != 'host'}
    headers['X-Forwarded-For'] = request.remote_addr
    
    try:
        if method == 'GET':
            response = requests.get(
                url, 
                params=request.args, 
                headers=headers,
                timeout=10
            )
        elif method == 'POST':
            response = requests.post(
                url, 
                json=data or request.get_json(silent=True),
                headers=headers,
                timeout=10
            )
        elif method == 'PUT':
            response = requests.put(
                url, 
                json=data or request.get_json(silent=True),
                headers=headers,
                timeout=10
            )
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=10)
        else:
            return jsonify({'error': 'Method not allowed'}), 405
        
        # Проксируем ответ как есть
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        response_headers = [
            (name, value) for (name, value) in response.raw.headers.items()
            if name.lower() not in excluded_headers
        ]
        
        return Response(response.content, response.status_code, response_headers)
    
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Service {service_name} unavailable', 'details': str(e)}), 502

# Health check
@app.route('/health')
def health():
    return jsonify({'status': 'OK', 'service': 'api-gateway'})

# Главная страница и статические маршруты
@app.route('/')
def index():
    return proxy_request('frontend', '', 'GET')

@app.route('/table')
def table_page():
    return proxy_request('frontend', 'table', 'GET')

@app.route('/database')
def database_page():
    return proxy_request('frontend', 'database', 'GET')

# API routes для frontend сервиса
@app.route('/api/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def proxy_api(path):
    return proxy_request('frontend', f'api/{path}', request.method)

# Auth routes
# @app.route('/auth/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
# def proxy_auth(path):
#     return proxy_request('auth', f'/{path}', request.method)

# Service discovery endpoint
@app.route('/services')
def list_services():
    """Показывает статус всех сервисов"""
    services_info = {}
    for name, url in SERVICES.items():
        try:
            response = requests.get(f"{url}/health", timeout=5)
            services_info[name] = {
                'url': url,
                'status': 'healthy' if response.status_code == 200 else 'unhealthy',
                'response_time': response.elapsed.total_seconds()
            }
        except:
            services_info[name] = {
                'url': url,
                'status': 'unavailable',
                'response_time': None
            }
    
    return jsonify(services_info)

if __name__ == '__main__':
    port = 8000
    logger.info(f"🚀 Starting API Gateway on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)