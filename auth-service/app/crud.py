from typing import Optional, Dict, Any, List
import logging
from datetime import datetime, timedelta
from . import auth, models
from .config import settings

logger = logging.getLogger("auth-service")

def get_user_by_email(db_manager, email: str) -> Optional[dict]:
    """Получение пользователя по email"""
    try:
        query = "SELECT * FROM users WHERE email = %s"
        result = db_manager.db.execute(query, (email,), fetch_one=True)
        return result
    except Exception as e:
        logger.error(f"Error getting user by email {email}: {str(e)}")
        return None

def get_user_by_username(db_manager, username: str) -> Optional[dict]:
    """Получение пользователя по username"""
    try:
        query = "SELECT * FROM users WHERE username = %s"
        result = db_manager.db.execute(query, (username,), fetch_one=True)
        return result
    except Exception as e:
        logger.error(f"Error getting user by username {username}: {str(e)}")
        return None

def get_user_by_id(db_manager, user_id: int) -> Optional[dict]:
    """Получение пользователя по ID"""
    try:
        query = "SELECT * FROM users WHERE id = %s"
        result = db_manager.db.execute(query, (user_id,), fetch_one=True)
        return result
    except Exception as e:
        logger.error(f"Error getting user by ID {user_id}: {str(e)}")
        return None

def create_user(db_manager, user_data: dict) -> Optional[dict]:
    """Создание нового пользователя"""
    try:
        # Проверяем, существует ли пользователь с таким email
        if get_user_by_email(db_manager, user_data['email']):
            logger.warning(f"User with email {user_data['email']} already exists")
            return None
        
        # Проверяем, существует ли пользователь с таким username
        if get_user_by_username(db_manager, user_data['username']):
            logger.warning(f"User with username {user_data['username']} already exists")
            return None
        
        # Хешируем пароль
        hashed_password = auth.get_password_hash(user_data['password'])
        
        # Создаем пользователя
        query = """
        INSERT INTO users (email, username, hashed_password)
        VALUES (%s, %s, %s)
        RETURNING *
        """
        
        result = db_manager.db.execute(
            query, 
            (user_data['email'], user_data['username'], hashed_password), 
            fetch_one=True
        )
        
        logger.info(f"User {user_data['username']} created successfully with ID {result['id']}")
        return result
        
    except Exception as e:
        logger.error(f"Error creating user {user_data['username']}: {str(e)}")
        return None

def authenticate_user(db_manager, username: str, password: str) -> Optional[dict]:
    """Аутентификация пользователя"""
    try:
        user = get_user_by_username(db_manager, username)
        if not user:
            logger.warning(f"Authentication failed: user {username} not found")
            return None
        
        if not auth.verify_password(password, user['hashed_password']):
            logger.warning(f"Authentication failed: invalid password for user {username}")
            return None
        
        if not user['is_active']:
            logger.warning(f"Authentication failed: user {username} is inactive")
            return None
        
        logger.info(f"User {username} authenticated successfully")
        return user
        
    except Exception as e:
        logger.error(f"Error authenticating user {username}: {str(e)}")
        return None

def get_users_list(db_manager, skip: int = 0, limit: int = 100) -> list:
    """Получение списка пользователей"""
    try:
        query = "SELECT * FROM users ORDER BY id LIMIT %s OFFSET %s"
        result = db_manager.db.execute(query, (limit, skip), fetch=True)
        return result
    except Exception as e:
        logger.error(f"Error getting users list: {str(e)}")
        return []

def store_refresh_token(db_manager, user_id: int, refresh_token: str) -> bool:
    """Сохранение refresh token в базе данных"""
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            token_hash = auth.hash_token(refresh_token)
            expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            
            query = """
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES (%s, %s, %s)
            """
            
            db_manager.db.execute(query, (user_id, token_hash, expires_at))
            logger.info(f"Refresh token stored for user {user_id}")
            return True
            
        except Exception as e:
            retry_count += 1
            if "duplicate key" in str(e).lower() and retry_count < max_retries:
                logger.warning(f"Duplicate token hash detected, retrying... (attempt {retry_count})")
                # Генерируем новый refresh token с другим jti
                from .auth import create_refresh_token
                import secrets
                new_refresh_token = create_refresh_token({"sub": f"retry_{secrets.token_urlsafe(8)}", "user_id": user_id})
                refresh_token = new_refresh_token
            else:
                logger.error(f"Error storing refresh token for user {user_id} after {retry_count} attempts: {str(e)}")
                return False
    
    return False

def get_refresh_token(db_manager, token_hash: str) -> Optional[dict]:
    """Получение refresh token по хешу"""
    try:
        query = """
        SELECT rt.*, u.username, u.is_active 
        FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token_hash = %s AND rt.revoked = FALSE AND rt.expires_at > CURRENT_TIMESTAMP
        """
        result = db_manager.db.execute(query, (token_hash,), fetch_one=True)
        return result
    except Exception as e:
        logger.error(f"Error getting refresh token: {str(e)}")
        return None

def revoke_refresh_token(db_manager, token_hash: str, replaced_by_token_hash: Optional[str] = None) -> bool:
    """Отзыв refresh token"""
    try:
        query = """
        UPDATE refresh_tokens 
        SET revoked = TRUE, replaced_by_token_hash = %s
        WHERE token_hash = %s
        """
        affected = db_manager.db.execute(query, (replaced_by_token_hash, token_hash))
        if affected > 0:
            logger.info(f"Refresh token revoked: {token_hash}")
            return True
        else:
            logger.warning(f"Refresh token not found or already revoked: {token_hash}")
            return False
    except Exception as e:
        logger.error(f"Error revoking refresh token: {str(e)}")
        return False
    
def revoke_all_user_tokens(db_manager, user_id: int) -> bool:
    """Отзыв всех refresh tokens пользователя"""
    try:
        query = "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = %s"
        db_manager.db.execute(query, (user_id,))
        logger.info(f"All refresh tokens revoked for user {user_id}")
        return True
    except Exception as e:
        logger.error(f"Error revoking all tokens for user {user_id}: {str(e)}")
        return False

def cleanup_expired_tokens(db_manager) -> int:
    """Очистка просроченных токенов"""
    try:
        query = "DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP OR revoked = TRUE"
        result = db_manager.db.execute(query)
        logger.info(f"Cleaned up expired tokens: {result} rows affected")
        return result or 0
    except Exception as e:
        logger.error(f"Error cleaning up expired tokens: {str(e)}")
        return 0