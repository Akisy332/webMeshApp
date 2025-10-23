from fastapi import FastAPI, Depends, HTTPException, status
import os
import logging
from app import crud, database
from app.config import settings, logger
from app.dependencies import get_current_user, require_admin
from shared.user_models import UserCreate, UserResponse, UserUpdate, RoleUpdateRequest
from shared.auth_models import PasswordChangeRequest
from typing import List

app = FastAPI(
    title="User Service",
    description="Microservice for user management",
    version="1.0.0"
)

from shared.database_models import init_user_tables

@app.on_event("startup")
async def startup_event():
    """Инициализация при запуске"""
    try:
        db_manager = database.get_db_manager()
        
        # Инициализируем таблицы пользователей
        init_user_tables(db_manager)
        
        logger.info("User service started successfully")
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        logger.info("Service will continue - tables may already exist")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        return {
            "status": "healthy",
            "service": "user-service"
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Service unhealthy"
        )

@app.post("/auth/authenticate")
async def authenticate_user(auth_data: dict, db_manager = Depends(database.get_db)):
    """Аутентификация пользователя (для внутреннего использования auth-service)"""
    try:
        username = auth_data.get("username")
        password = auth_data.get("password")
        
        user = crud.authenticate_user(db_manager, username, password)
        if not user:
            return {"authenticated": False}
        
        return {
            "authenticated": True,
            "user": user
        }
        
    except Exception as e:
        logger.error(f"Authentication error for user {auth_data.get('username')}: {str(e)}")
        return {"authenticated": False}

@app.post("/api/users", response_model=UserResponse)
async def create_user(user: UserCreate, db_manager = Depends(database.get_db)):
    """Создание нового пользователя"""
    try:
        logger.info(f"User creation attempt: {user.username}")
        
        user_data = {
            'email': user.email,
            'username': user.username,
            'password': user.password,
            'role': user.role
        }
        
        db_user = crud.create_user(db_manager, user_data)
        if db_user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email or username already registered"
            )
        
        return UserResponse(**db_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"User creation error for {user.username}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during user creation"
        )

@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db_manager = Depends(database.get_db)):
    """Получение пользователя по ID"""
    try:
        user = crud.get_user_by_id(db_manager, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.get("/users/username/{username}", response_model=UserResponse)
async def get_user_by_username(username: str, db_manager = Depends(database.get_db)):
    """Получение пользователя по username"""
    try:
        user = crud.get_user_by_username(db_manager, username)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user {username}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db_manager = Depends(database.get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Обновление информации о пользователе"""
    try:
        # Проверяем права доступа (только свой профиль или администратор)
        if current_user.id != user_id and current_user.role not in ["admin", "developer"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions to update this user"
            )
        
        updated_user = crud.update_user(db_manager, user_id, user_update.dict(exclude_unset=True))
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        return UserResponse(**updated_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during user update"
        )

@app.post("/users/{user_id}/change-password")
async def change_password(
    user_id: int,
    password_data: PasswordChangeRequest,
    db_manager = Depends(database.get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Смена пароля пользователя"""
    try:
        # Проверяем права доступа (только свой профиль)
        if current_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot change another user's password"
            )
        
        success = crud.change_password(db_manager, user_id, password_data.old_password, password_data.new_password)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect old password"
            )
        
        return {"message": "Password changed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing password for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during password change"
        )

@app.put("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: int,
    role_update: RoleUpdateRequest,
    db_manager = Depends(database.get_db),
    current_user: UserResponse = Depends(require_admin)
):
    """Обновление роли пользователя (только для администраторов)"""
    try:
        # Не позволяем изменять роль самого себя
        if user_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own role"
            )
        
        updated_user = crud.update_user_role(db_manager, user_id, role_update.role)
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        logger.info(f"User {updated_user['username']} role updated to {role_update.role.value} by {current_user.username}")
        return UserResponse(**updated_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user role: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.get("/users/role/{role}", response_model=List[UserResponse])
async def get_users_by_role(
    role: str,
    skip: int = 0,
    limit: int = 100,
    db_manager = Depends(database.get_db),
    current_user: UserResponse = Depends(require_admin)
):
    """Получение пользователей по роли (только для администраторов)"""
    try:
        users = crud.get_users_by_role(db_manager, role, skip, limit)
        return [UserResponse(**user) for user in users]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting users by role {role}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.get("/users", response_model=List[UserResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    db_manager = Depends(database.get_db),
    current_user: UserResponse = Depends(require_admin)
):
    """Получение списка пользователей (только для администраторов)"""
    try:
        users = crud.get_users_list(db_manager, skip, limit)
        return [UserResponse(**user) for user in users]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting users list: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )
        
@app.post("/init-first-admin")
async def init_first_admin(init_data: dict, db_manager = Depends(database.get_db)):
    """Инициализация первого администратора (публичный эндпоинт)"""
    try:
        # Проверяем, есть ли уже администраторы в системе
        admin_count = db_manager.db.execute(
            "SELECT COUNT(*) as count FROM users WHERE role IN ('admin', 'developer')",
            fetch_one=True
        )
        
        if admin_count and admin_count['count'] > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Administrator already exists in the system"
            )
        
        # Создаем администратора
        admin_user = {
            'email': init_data['email'],
            'username': init_data['username'],
            'password': init_data['password'],
            'role': 'admin'
        }
        
        db_user = crud.create_user(db_manager, admin_user)
        if db_user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email or username already registered"
            )
        
        logger.info(f"First admin user created: {db_user['username']}")
        return {"message": "First administrator created successfully", "user": db_user}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating first admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during admin creation"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8004,
        log_level=settings.LOG_LEVEL.lower(),
        reload=False
    )