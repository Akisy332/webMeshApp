"""
Общие утилиты для аутентификации и авторизации
"""

from functools import wraps
from flask import request, jsonify
import logging
from typing import List, Optional
from shared.permissions import Permissions, has_permission, has_any_permission

logger = logging.getLogger('auth-utils')

def get_user_context():
    """Извлечение user context из заголовков запроса"""
    return {
        'user_id': request.headers.get('X-User-Id'),
        'username': request.headers.get('X-User-Name'),
        'role': request.headers.get('X-User-Role', 'public'),
        'permissions': request.headers.get('X-User-Permissions', '').split(','),
        'request_id': request.headers.get('X-Request-Id')
    }

def require_permission(required_permission: Permissions):
    """Декоратор для проверки конкретного разрешения в микросервисах"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_context = get_user_context()
            user_permissions = user_context.get('permissions', [])
            
            if not has_permission(user_permissions, required_permission):
                logger.warning(
                    f"Permission denied for user {user_context.get('username')}: "
                    f"required {required_permission.value}, has {user_permissions}"
                )
                return jsonify({
                    'error': 'Forbidden',
                    'message': f'Required permission: {required_permission.value}'
                }), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def require_any_permission(required_permissions: List[Permissions]):
    """Декоратор для проверки любого из разрешений"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_context = get_user_context()
            user_permissions = user_context.get('permissions', [])
            
            if not has_any_permission(user_permissions, required_permissions):
                required_perms_str = [p.value for p in required_permissions]
                logger.warning(
                    f"Permission denied for user {user_context.get('username')}: "
                    f"required any of {required_perms_str}, has {user_permissions}"
                )
                return jsonify({
                    'error': 'Forbidden',
                    'message': f'Required any permission: {required_perms_str}'
                }), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def require_role(minimal_role: str):
    """Декоратор для проверки минимальной роли"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_context = get_user_context()
            user_role = user_context.get('role', 'public')
            
            role_hierarchy = {
                'developer': 4,
                'admin': 3, 
                'curator': 2,
                'user': 1,
                'public': 0
            }
            
            user_level = role_hierarchy.get(user_role, 0)
            required_level = role_hierarchy.get(minimal_role, 0)
            
            if user_level < required_level:
                logger.warning(
                    f"Role denied for user {user_context.get('username')}: "
                    f"required {minimal_role}, has {user_role}"
                )
                return jsonify({
                    'error': 'Forbidden',
                    'message': f'Required role: {minimal_role}'
                }), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def get_current_user():
    """Получение информации о текущем пользователе из контекста"""
    return get_user_context()

def log_user_action(action: str, resource: str, details: str = ""):
    """Логирование действий пользователя"""
    user_context = get_user_context()
    logger.info(
        f"USER_ACTION: user={user_context.get('username')} "
        f"action={action} resource={resource} {details}"
    )