from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import secrets
import hashlib
import logging
from app.config import settings
from shared.permissions import get_permissions_for_role

logger = logging.getLogger("auth-service")

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False

def get_password_hash(password: str) -> str:
    """Хеширование пароля"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Создание access token с правами"""
    try:
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=15)
        
        # Добавляем права на основе роли
        role = data.get("role", "user")
        permissions = [p.value for p in get_permissions_for_role(role)]
        
        to_encode.update({
            "exp": expire,
            "type": "access",
            "jti": secrets.token_urlsafe(16),
            "permissions": permissions
        })
        
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        logger.debug(f"Access token created for {data.get('sub')} with role {role}")
        return encoded_jwt
        
    except Exception as e:
        logger.error(f"Error creating access token: {e}")
        raise

def create_refresh_token(data: dict) -> str:
    """Создание refresh token"""
    try:
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=7)
        
        to_encode.update({
            "exp": expire,
            "type": "refresh",
            "jti": secrets.token_urlsafe(32)
        })
        
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        logger.debug(f"Refresh token created for {data.get('sub')}")
        return encoded_jwt
        
    except Exception as e:
        logger.error(f"Error creating refresh token: {e}")
        raise

def verify_token(token: str) -> dict:
    """Проверка JWT токена"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as e:
        logger.warning(f"JWT token verification failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Error verifying token: {e}")
        return None

def hash_token(token: str) -> str:
    """Хеширование токена для хранения"""
    return hashlib.sha256(token.encode()).hexdigest()

def store_refresh_token(db_manager, user_id: int, refresh_token: str) -> bool:
    """Сохранение refresh token в БД"""
    try:
        token_hash = hash_token(refresh_token)
        expires_at = datetime.utcnow() + timedelta(days=7)
        
        query = """
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES (%s, %s, %s)
        """
        
        db_manager.db.execute(query, (user_id, token_hash, expires_at))
        logger.info(f"Refresh token stored for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error storing refresh token: {e}")
        return False

def revoke_refresh_token(token: str) -> str:
    """Отзыв refresh token"""
    return hash_token(token)