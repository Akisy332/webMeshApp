from fastapi import Depends, HTTPException, status, Header
import logging
from app import crud
from app.database import get_db
from shared.user_models import UserResponse
from shared.permissions import Permissions, has_permission

logger = logging.getLogger("user-service")

def get_current_user(
    authorization: str = Header(None),
    db_manager = Depends(get_db)
) -> UserResponse:
    """Получение текущего пользователя из токена в заголовке Authorization"""
    try:
        if not authorization:
            logger.warning("Authentication failed: no authorization header")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated"
            )
        
        # Извлекаем токен из заголовка "Bearer <token>"
        parts = authorization.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            logger.warning("Authentication failed: invalid authorization header format")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header format"
            )
        
        token = parts[1]
        
        # В реальной реализации здесь должна быть проверка токена
        # Для упрощения используем базовую проверку через auth-service
        # В production следует использовать отдельный сервис проверки токенов
        
        # Получаем пользователя из токена (упрощенная версия)
        # В production здесь должен быть вызов auth-service для проверки токена
        payload = {}  # Заглушка - в реальности нужно декодировать JWT
        
        username = payload.get("sub")
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        user = crud.get_user_by_username(db_manager, username=username)
        if user is None:
            logger.warning(f"Authentication failed: user {username} not found")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        if not user.get('is_active', True):
            logger.warning(f"Authentication failed: user {username} is inactive")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Inactive user"
            )
        
        logger.info(f"User {username} authenticated via token")
        return UserResponse(**user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_current_user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

def require_role(required_roles: list):
    """Зависимость для проверки ролей пользователя"""
    def role_checker(current_user: UserResponse = Depends(get_current_user)):
        if current_user.role not in required_roles:
            logger.warning(f"Access denied for user {current_user.username} with role {current_user.role}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required roles: {required_roles}"
            )
        return current_user
    return role_checker

# Короткие зависимости для конкретных ролей
require_developer = require_role(["developer", "admin"])
require_admin = require_role(["admin", "developer"])