from flask import Flask, request, jsonify, Response
import requests
import os
import time
import logging
from datetime import datetime
import jwt
from jwt import PyJWTError
from functools import wraps
import json
import secrets

app = Flask(__name__)

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('api-gateway')

# Конфигурация сервисов
SERVICES = {
    'frontend': os.getenv('FRONTEND_SERVICE_URL', 'http://frontend:5000'),
    'auth': os.getenv('AUTH_SERVICE_URL', 'http://auth-service:8003'),
}

# Конфигурация JWT
JWT_SECRET = os.getenv('JWT_SECRET', 'your-jwt-secret-key-change-in-production')
JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')

# Публичные маршруты (не требуют аутентификации)
PUBLIC_ROUTES = {
    '/health',
    '/auth/login',
    '/auth/register', 
    '/auth/refresh',
    '/auth/validate',
    '/services',
    '/circuit-breaker/status'
}

# Circuit breaker configuration
class CircuitBreaker:
    def __init__(self, failure_threshold=5, recovery_timeout=60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures = 0
        self.last_failure_time = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
    
    def record_failure(self):
        self.failures += 1
        self.last_failure_time = time.time()
        if self.failures >= self.failure_threshold:
            self.state = "OPEN"
            logger.warning(f"Circuit breaker opened for auth service")
    
    def record_success(self):
        self.failures = 0
        self.state = "CLOSED"
    
    def can_execute(self):
        if self.state == "CLOSED":
            return True
        elif self.state == "OPEN":
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = "HALF_OPEN"
                return True
            return False
        return True  # HALF_OPEN

# Circuit breaker для auth service
auth_circuit_breaker = CircuitBreaker()

def extract_user_claims(token_payload):
    """Извлечение user claims из JWT payload"""
    if not token_payload:
        return {}
    
    return {
        'X-User-Id': token_payload.get('user_id'),
        'X-User-Name': token_payload.get('sub'),
        'X-User-Email': token_payload.get('email'),
        'X-User-Roles': ','.join(token_payload.get('permissions', [])),
        'X-User-Is-Superuser': str(token_payload.get('is_superuser', False)).lower()
    }

def verify_jwt(token):
    """Проверка JWT токена через Auth Service"""
    if not auth_circuit_breaker.can_execute():
        logger.warning("Auth service circuit breaker is OPEN, skipping token verification")
        return None
    
    try:
        # Валидация токена через auth service
        response = requests.post(
            f"{SERVICES['auth']}/validate",
            json={"token": token},
            timeout=5
        )
        
        if response.status_code == 200:
            auth_circuit_breaker.record_success()
            result = response.json()
            if result.get('valid'):
                return result
            else:
                logger.warning(f"Token validation failed: {result}")
                return None
        else:
            auth_circuit_breaker.record_failure()
            logger.error(f"Auth service returned {response.status_code}: {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        auth_circuit_breaker.record_failure()
        logger.error(f"Auth service unavailable: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        return None

def is_public_route(path):
    """Проверка, является ли маршрут публичным"""
    # Нормализуем путь (убираем двойные слеши)
    normalized_path = path.replace('//', '/')
    
    # Проверяем точное совпадение
    if normalized_path in PUBLIC_ROUTES:
        return True
    
    # Проверяем префиксы
    for public_route in PUBLIC_ROUTES:
        if normalized_path.startswith(public_route):
            return True
    
    return False

def jwt_required(f):
    """Декоратор для проверки JWT токена"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Нормализуем путь запроса
        request.normalized_path = request.path.replace('//', '/')
        
        # Пропускаем публичные маршруты
        if is_public_route(request.normalized_path):
            return f(*args, **kwargs)
        
        # Извлекаем токен из заголовка Authorization
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid Authorization header'}), 401
        
        token = auth_header[7:]  # Убираем 'Bearer '
        
        # Проверяем токен
        user_claims = verify_jwt(token)
        if not user_claims:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        # Сохраняем user claims в контексте запроса
        request.user_claims = user_claims
        return f(*args, **kwargs)
    
    return decorated_function

def normalize_url(base_url, path):
    """Нормализация URL для избежания двойных слешей"""
    base_url = base_url.rstrip('/')
    path = path.lstrip('/')
    return f"{base_url}/{path}" if path else base_url

def proxy_request(service_name, path, method='GET', data=None):
    """Проксирует HTTP запрос к целевому сервису"""
    service_url = SERVICES[service_name]
    
    # Нормализуем путь
    normalized_path = path.replace('//', '/').lstrip('/')
    url = normalize_url(service_url, normalized_path)
    
    logger.info(f"Proxying request to: {url}")
    
    # Фильтруем заголовки (убираем host чтобы не мешал)
    headers = {key: value for key, value in request.headers if key.lower() != 'host'}
    headers['X-Forwarded-For'] = request.remote_addr
    
    # Добавляем user claims если они есть
    if hasattr(request, 'user_claims') and request.user_claims:
        for header_name, header_value in request.user_claims.items():
            if header_value:  # Добавляем только если значение не пустое
                headers[header_name] = str(header_value)
    
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
        logger.error(f"Service {service_name} unavailable: {str(e)}")
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

# Auth routes - публичные маршруты
@app.route('/auth/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def proxy_auth(path):
    """Проксирование запросов к auth service (публичные маршруты)"""
    normalized_path = path.replace('//', '/')
    return proxy_request('auth', normalized_path, request.method)

# API routes для frontend сервиса - защищенные маршруты
@app.route('/api/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
@jwt_required
def proxy_api(path):
    normalized_path = path.replace('//', '/')
    return proxy_request('frontend', f'api/{normalized_path}', request.method)

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
                'response_time': response.elapsed.total_seconds(),
                'circuit_breaker': auth_circuit_breaker.state if name == 'auth' else 'N/A'
            }
        except Exception as e:
            services_info[name] = {
                'url': url,
                'status': 'unavailable',
                'response_time': None,
                'circuit_breaker': auth_circuit_breaker.state if name == 'auth' else 'N/A',
                'error': str(e)
            }
    
    return jsonify(services_info)

# Эндпоинт для проверки состояния circuit breaker
@app.route('/circuit-breaker/status')
def circuit_breaker_status():
    """Статус circuit breaker'ов"""
    return jsonify({
        'auth_service': {
            'state': auth_circuit_breaker.state,
            'failures': auth_circuit_breaker.failures,
            'last_failure_time': auth_circuit_breaker.last_failure_time,
            'failure_threshold': auth_circuit_breaker.failure_threshold,
            'recovery_timeout': auth_circuit_breaker.recovery_timeout
        }
    })

# Error handlers
@app.errorhandler(401)
def unauthorized(error):
    return jsonify({'error': 'Unauthorized', 'message': 'Authentication required'}), 401

@app.errorhandler(403)
def forbidden(error):
    return jsonify({'error': 'Forbidden', 'message': 'Insufficient permissions'}), 403

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not Found', 'message': 'The requested resource was not found'}), 404

@app.errorhandler(500)
def internal_server_error(error):
    return jsonify({'error': 'Internal Server Error', 'message': 'An unexpected error occurred'}), 500

if __name__ == '__main__':
    port = 8000
    logger.info(f"🚀 Starting API Gateway on port {port}...")
    logger.info(f"Public routes: {PUBLIC_ROUTES}")
    logger.info(f"Auth service URL: {SERVICES['auth']}")
    app.run(host='0.0.0.0', port=port, debug=True)