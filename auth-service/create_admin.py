#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db_manager
from app.auth import get_password_hash
from app.config import logger

def create_admin_user(email: str, username: str, password: str):
    """Создание пользователя с правами администратора"""
    try:
        db_manager = get_db_manager()
        
        # Проверяем, существует ли пользователь
        query = "SELECT * FROM users WHERE email = %s OR username = %s"
        existing_user = db_manager.db.execute(query, (email, username), fetch_one=True)
        
        if existing_user:
            logger.info(f"User {username} already exists. Updating to admin...")
            # Обновляем существующего пользователя до администратора
            query = "UPDATE users SET is_superuser = TRUE, hashed_password = %s WHERE id = %s"
            db_manager.db.execute(query, (get_password_hash(password), existing_user['id']))
            logger.info(f"User {username} updated to admin")
        else:
            # Создаем нового администратора
            query = """
            INSERT INTO users (email, username, hashed_password, is_superuser)
            VALUES (%s, %s, %s, TRUE)
            """
            db_manager.db.execute(query, (email, username, get_password_hash(password)))
            logger.info(f"Admin user {username} created successfully")
        
        return True
        
    except Exception as e:
        logger.error(f"Error creating admin user: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python create_admin.py <email> <username> <password>")
        sys.exit(1)
    
    email = sys.argv[1]
    username = sys.argv[2]
    password = sys.argv[3]
    
    if create_admin_user(email, username, password):
        print(f"✅ Admin user '{username}' created/updated successfully")
    else:
        print("❌ Failed to create admin user")
        sys.exit(1)