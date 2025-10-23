from typing import Optional, Dict, Any, List
import logging
from shared.user_models import UserRole
from app import auth

logger = logging.getLogger("user-service")

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
        
        # Определяем роль (по умолчанию 'user')
        role = user_data.get('role', UserRole.USER)
        
        # Создаем пользователя
        query = """
        INSERT INTO users (email, username, hashed_password, role)
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """
        
        result = db_manager.db.execute(
            query, 
            (user_data['email'], user_data['username'], hashed_password, role.value), 
            fetch_one=True
        )
        
        logger.info(f"User {user_data['username']} created successfully with ID {result['id']} and role {role}")
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

def update_user(db_manager, user_id: int, update_data: dict) -> Optional[dict]:
    """Обновление информации о пользователе"""
    try:
        # Получаем текущие данные пользователя
        user = get_user_by_id(db_manager, user_id)
        if not user:
            return None
        
        # Проверяем уникальность email, если он обновляется
        if 'email' in update_data and update_data['email'] != user['email']:
            existing_user = get_user_by_email(db_manager, update_data['email'])
            if existing_user:
                return None
        
        # Проверяем уникальность username, если он обновляется
        if 'username' in update_data and update_data['username'] != user['username']:
            existing_user = get_user_by_username(db_manager, update_data['username'])
            if existing_user:
                return None
        
        # Формируем запрос для обновления
        update_fields = []
        params = []
        
        if 'email' in update_data:
            update_fields.append("email = %s")
            params.append(update_data['email'])
        
        if 'username' in update_data:
            update_fields.append("username = %s")
            params.append(update_data['username'])
        
        if 'is_active' in update_data:
            update_fields.append("is_active = %s")
            params.append(update_data['is_active'])
        
        if 'role' in update_data:
            update_fields.append("role = %s")
            params.append(update_data['role'].value if hasattr(update_data['role'], 'value') else update_data['role'])
        
        if not update_fields:
            return None
        
        update_query = f"""
        UPDATE users 
        SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        RETURNING *
        """
        params.append(user_id)
        
        updated_user = db_manager.db.execute(update_query, tuple(params), fetch_one=True)
        
        if updated_user:
            logger.info(f"User {user_id} updated successfully")
            return updated_user
        return None
        
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {str(e)}")
        return None

def change_password(db_manager, user_id: int, old_password: str, new_password: str) -> bool:
    """Смена пароля пользователя"""
    try:
        # Получаем пользователя
        user = get_user_by_id(db_manager, user_id)
        if not user:
            return False
        
        # Проверяем старый пароль
        if not auth.verify_password(old_password, user['hashed_password']):
            return False
        
        # Хешируем новый пароль
        hashed_password = auth.get_password_hash(new_password)
        
        # Обновляем пароль в БД
        query = "UPDATE users SET hashed_password = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
        db_manager.db.execute(query, (hashed_password, user_id))
        
        logger.info(f"Password changed successfully for user {user['username']}")
        return True
        
    except Exception as e:
        logger.error(f"Error changing password for user {user_id}: {str(e)}")
        return False

def get_users_list(db_manager, skip: int = 0, limit: int = 100) -> list:
    """Получение списка пользователей"""
    try:
        query = "SELECT * FROM users ORDER BY id LIMIT %s OFFSET %s"
        result = db_manager.db.execute(query, (limit, skip), fetch=True)
        return result or []
    except Exception as e:
        logger.error(f"Error getting users list: {str(e)}")
        return []

def get_users_by_role(db_manager, role: str, skip: int = 0, limit: int = 100) -> list:
    """Получение пользователей по роли"""
    try:
        query = "SELECT * FROM users WHERE role = %s ORDER BY id LIMIT %s OFFSET %s"
        result = db_manager.db.execute(query, (role, limit, skip), fetch=True)
        return result or []
    except Exception as e:
        logger.error(f"Error getting users by role {role}: {str(e)}")
        return []

def update_user_role(db_manager, user_id: int, new_role: UserRole) -> Optional[dict]:
    """Обновление роли пользователя"""
    try:
        query = """
        UPDATE users 
        SET role = %s, updated_at = CURRENT_TIMESTAMP 
        WHERE id = %s 
        RETURNING *
        """
        result = db_manager.db.execute(query, (new_role.value, user_id), fetch_one=True)
        
        if result:
            logger.info(f"User {user_id} role updated to {new_role.value}")
            return result
        return None
        
    except Exception as e:
        logger.error(f"Error updating user {user_id} role: {str(e)}")
        return None