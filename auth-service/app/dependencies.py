from fastapi import Depends, HTTPException, status, Header
import logging
from . import crud, auth, schemas
from .database import get_db
from typing import Optional

logger = logging.getLogger("auth-service")

def get_current_user(
    authorization: str = Header(None),
    db_manager = Depends(get_db)
) -> schemas.UserResponse:
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
        
        payload = auth.verify_token(token)
        if payload is None:
            logger.warning("Authentication failed: invalid token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        username: str = payload.get("sub")
        if username is None:
            logger.warning("Authentication failed: no username in token")
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
        return schemas.UserResponse(**user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_current_user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )