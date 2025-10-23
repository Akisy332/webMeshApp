# shared/security.py
import logging
from functools import lru_cache
from typing import Dict, List, Optional, Any
from datetime import datetime
from .permissions import Permissions, has_permission

logger = logging.getLogger('security')

class SecurityManager:
    def __init__(self):
        self._permission_cache = {}
        
    def check_permission_cached(self, user: Dict, permission: Permissions) -> bool:
        """Кэшированная проверка прав"""
        cache_key = f"{user.get('id')}:{permission.value}"
        
        if cache_key in self._permission_cache:
            return self._permission_cache[cache_key]
        
        has_perm = has_permission(user.get('permissions', []), permission)
        self._permission_cache[cache_key] = has_perm
        return has_perm
    
    def invalidate_user_cache(self, user_id: int):
        """Сброс кэша для пользователя"""
        keys_to_remove = [k for k in self._permission_cache.keys() 
                         if k.startswith(f"{user_id}:")]
        for key in keys_to_remove:
            self._permission_cache.pop(key, None)

security_manager = SecurityManager()

class SecurityAudit:
    @staticmethod
    def log_sensitive_access(user: Dict, endpoint: str, method: str, details: str = ""):
        logger.warning(
            f"SECURITY_AUDIT | {datetime.utcnow().isoformat()} | "
            f"user={user.get('username', 'unknown')} | role={user.get('role', 'unknown')} | "
            f"endpoint={method} {endpoint} | {details}"
        )
    
    @staticmethod
    def log_permission_denied(user: Dict, endpoint: str, required_permission: str):
        logger.warning(
            f"PERMISSION_DENIED | user={user.get('username', 'unknown')} | "
            f"endpoint={endpoint} | required={required_permission} | "
            f"user_permissions={user.get('permissions', [])}"
        )