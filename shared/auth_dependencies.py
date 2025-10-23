# shared/auth_dependencies.py
from fastapi import Depends, HTTPException, Header, Request
from typing import Optional, Dict, Any
from .permissions import Permissions, has_permission
from .security import security_manager, SecurityAudit

def get_current_user(
    x_user_id: Optional[str] = Header(None),
    x_user_name: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
    x_user_roles: Optional[str] = Header(None),
    x_user_is_superuser: Optional[str] = Header(None)
) -> Dict[str, Any]:
    """Извлечение пользователя из заголовков Traefik"""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    permissions = x_user_roles.split(",") if x_user_roles else []
    
    return {
        "id": int(x_user_id),
        "username": x_user_name,
        "email": x_user_email,
        "role": permissions[0] if permissions else "user",  # Берем первую роль как основную
        "permissions": permissions,
        "is_superuser": x_user_is_superuser == "true"
    }

def require_permission(required_permission: Permissions, use_cache: bool = True):
    """Проверка конкретного разрешения"""
    def permission_checker(user: Dict = Depends(get_current_user)):
        if use_cache:
            has_perm = security_manager.check_permission_cached(user, required_permission)
        else:
            has_perm = has_permission(user.get('permissions', []), required_permission)
            
        if not has_perm:
            SecurityAudit.log_permission_denied(user, "unknown", required_permission.value)
            raise HTTPException(
                status_code=403,
                detail=f"Required permission: {required_permission.value}"
            )
        return user
    return permission_checker

def require_sensitive_access():
    """Для чувствительных операций"""
    def sensitive_checker(user: Dict = Depends(get_current_user)):
        if not user.get('is_superuser', False):
            raise HTTPException(
                status_code=403,
                detail="Sensitive operation requires admin privileges"
            )
        
        SecurityAudit.log_sensitive_access(
            user, "SENSITIVE_ENDPOINT", "ACCESS", 
            "Superuser accessed sensitive endpoint"
        )
        return user
    return sensitive_checker

# Короткие зависимости для частых случаев
require_admin = require_permission(Permissions.ADMIN)
require_developer = require_permission(Permissions.DEVELOPER)
require_curator = require_permission(Permissions.MODERATE)