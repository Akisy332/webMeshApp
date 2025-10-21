from fastapi import FastAPI, Depends, HTTPException, status, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import os
import logging
from app import crud, schemas, auth, models, database
from app.config import settings, logger
from app.dependencies import get_current_user
from datetime import timedelta

app = FastAPI(
    title="Auth Service",
    description="Microservice for user authentication and authorization",
    version="1.0.0"
)

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Создание таблиц при запуске
@app.on_event("startup")
async def startup_event():
    """Инициализация при запуске"""
    try:
        # Инициализируем менеджер БД
        db_manager = database.get_db_manager()
        
        # Инициализируем таблицы пользователей и refresh tokens
        models.init_user_tables(db_manager)
        
        # Очищаем просроченные токены при старте
        crud.cleanup_expired_tokens(db_manager)
        
        logger.info("Auth service started successfully")
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        # Не падаем полностью, продолжаем работу
        logger.info("Service will continue - tables may already exist")

# HTML страница для тестирования
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Главная страница для тестирования API"""
    return templates.TemplateResponse("index.html", {"request": request})

# Эндпоинт для получения логов
@app.get("/logs")
async def get_logs():
    """Получение логов сервиса"""
    try:
        log_file_path = "/app/logs/auth_service.log"
        if os.path.exists(log_file_path):
            with open(log_file_path, "r") as log_file:
                logs = log_file.read()
            return logs
        else:
            return "Log file not found"
    except Exception as e:
        logger.error(f"Error reading logs: {str(e)}")
        return f"Error reading logs: {str(e)}"

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        return {
            "status": "healthy",
            "service": "auth-service"
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Service unhealthy"
        )

@app.post("/register", response_model=schemas.UserResponse)
async def register(user: schemas.UserCreate, db_manager = Depends(database.get_db)):
    """Регистрация нового пользователя"""
    try:
        logger.info(f"Registration attempt for user: {user.username}")
        
        user_data = {
            'email': user.email,
            'username': user.username,
            'password': user.password
        }
        
        db_user = crud.create_user(db_manager, user_data)
        if db_user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email or username already registered"
            )
        
        return schemas.UserResponse(**db_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error for user {user.username}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during registration"
        )

@app.post("/login", response_model=schemas.Token)
async def login(login_data: schemas.LoginRequest, db_manager = Depends(database.get_db)):
    """Аутентификация пользователя и выдача токенов"""
    try:
        logger.info(f"Login attempt for user: {login_data.username}")
        
        user = crud.authenticate_user(db_manager, login_data.username, login_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password"
            )
        
        # Создаем access token
        access_token = auth.create_access_token(
            data={"sub": user['username'], "user_id": user['id'], "is_superuser": user['is_superuser']}
        )
        
        # Создаем refresh token
        refresh_token = auth.create_refresh_token(
            data={"sub": user['username'], "user_id": user['id']}
        )
        
        # Сохраняем refresh token в базе
        if not crud.store_refresh_token(db_manager, user['id'], refresh_token):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to store refresh token"
            )
        
        logger.info(f"User {login_data.username} logged in successfully")
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # в секундах
            "user": schemas.UserResponse(**user)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error for user {login_data.username}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during login"
        )

@app.post("/refresh", response_model=schemas.Token)
async def refresh_tokens(
    refresh_data: schemas.RefreshRequest, 
    db_manager = Depends(database.get_db),
    background_tasks: BackgroundTasks = None
):
    """Обновление access token с помощью refresh token"""
    try:
        logger.info("Refresh token request received")
        
        # Проверяем refresh token
        payload = auth.verify_token(refresh_data.refresh_token)
        if not payload or payload.get('type') != 'refresh':
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # Проверяем наличие токена в базе
        token_hash = auth.hash_token(refresh_data.refresh_token)
        stored_token = crud.get_refresh_token(db_manager, token_hash)
        if not stored_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token not found or revoked"
            )
        
        # Получаем пользователя
        user = crud.get_user_by_id(db_manager, stored_token['user_id'])
        if not user or not user['is_active']:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        # Отзываем старый refresh token
        old_token_hash = token_hash
        
        # Создаем новые токены
        new_access_token = auth.create_access_token(
            data={"sub": user['username'], "user_id": user['id'], "is_superuser": user['is_superuser']}
        )
        
        new_refresh_token = auth.create_refresh_token(
            data={"sub": user['username'], "user_id": user['id']}
        )
        
        # Сохраняем новый refresh token
        if not crud.store_refresh_token(db_manager, user['id'], new_refresh_token):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to store new refresh token"
            )
        
        # Теперь отзываем старый токен, используя хеш нового токена как replaced_by
        new_token_hash = auth.hash_token(new_refresh_token)
        crud.revoke_refresh_token(db_manager, old_token_hash, new_token_hash)
        
        logger.info(f"Tokens refreshed successfully for user {user['username']}")
        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": schemas.UserResponse(**user)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during token refresh"
        )

@app.post("/logout")
async def logout(
    logout_data: schemas.LogoutRequest,
    db_manager = Depends(database.get_db),
    current_user: schemas.UserResponse = Depends(get_current_user)
):
    """Выход пользователя и отзыв refresh token"""
    try:
        logger.info(f"Logout request for user: {current_user.username}")
        
        # Отзываем конкретный refresh token
        token_hash = auth.hash_token(logout_data.refresh_token)
        crud.revoke_refresh_token(db_manager, token_hash)
        
        logger.info(f"User {current_user.username} logged out successfully")
        return {"message": "Successfully logged out"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Logout error for user {current_user.username}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during logout"
        )

@app.post("/logout-all")
async def logout_all(
    db_manager = Depends(database.get_db),
    current_user: schemas.UserResponse = Depends(get_current_user)
):
    """Выход со всех устройств (отзыв всех refresh tokens)"""
    try:
        logger.info(f"Logout-all request for user: {current_user.username}")
        
        crud.revoke_all_user_tokens(db_manager, current_user.id)
        
        logger.info(f"All sessions terminated for user {current_user.username}")
        return {"message": "Successfully logged out from all devices"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Logout-all error for user {current_user.username}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during logout"
        )

@app.post("/validate", response_model=schemas.TokenValidationResponse)
async def validate_token_for_gateway(
    token_data: schemas.TokenValidationRequest,
    db_manager = Depends(database.get_db)
):
    """Проверка валидности токена для API Gateway"""
    try:
        payload = auth.verify_token(token_data.token)
        if not payload or payload.get('type') != 'access':
            return schemas.TokenValidationResponse(valid=False)
        
        username = payload.get("sub")
        user_id = payload.get("user_id")
        is_superuser = payload.get("is_superuser", False)
        
        if not username or not user_id:
            return schemas.TokenValidationResponse(valid=False)
        
        # Проверяем, что пользователь все еще существует и активен
        user = crud.get_user_by_username(db_manager, username)
        if not user or not user.get('is_active', True):
            return schemas.TokenValidationResponse(valid=False)
        
        # Формируем список permissions (можно расширить)
        permissions = []
        if is_superuser:
            permissions.extend(["admin", "read", "write", "delete"])
        else:
            permissions.extend(["read", "write"])
        
        return schemas.TokenValidationResponse(
            valid=True,
            username=username,
            user_id=user_id,
            email=user.get('email'),
            is_superuser=is_superuser,
            permissions=permissions
        )
        
    except Exception as e:
        logger.error(f"Token validation error: {str(e)}")
        return schemas.TokenValidationResponse(valid=False)

# Остальные endpoints остаются без изменений...
from pydantic import BaseModel
from typing import Optional

class TokenVerificationRequest(BaseModel):
    token: str

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

# Эндпоинт проверки токена (через POST с телом)
@app.post("/verify-token")
async def verify_token(request: TokenVerificationRequest, db_manager = Depends(database.get_db)):
    """Проверка валидности токена"""
    try:
        payload = auth.verify_token(request.token)
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        username = payload.get("sub")
        if username:
            # Проверяем, что пользователь все еще существует и активен
            user = crud.get_user_by_username(db_manager, username)
            if user and user.get('is_active', True):
                return {
                    "valid": True, 
                    "username": username,
                    "user_id": user.get('id'),
                    "email": user.get('email')
                }
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token or user not found"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during token verification"
        )

# Эндпоинт получения информации о себе (использует заголовок Authorization)
@app.get("/me", response_model=schemas.UserResponse)
async def get_current_user_info(current_user: schemas.UserResponse = Depends(get_current_user)):
    """Получение информации о текущем пользователе"""
    try:
        return current_user
    except Exception as e:
        logger.error(f"Error getting current user info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

# Эндпоинт смены пароля (использует заголовок Authorization и тело запроса)
@app.post("/change-password")
async def change_password(
    request: PasswordChangeRequest,
    db_manager = Depends(database.get_db),
    current_user: schemas.UserResponse = Depends(get_current_user)
):
    """Смена пароля"""
    try:
        # Проверяем старый пароль
        user = crud.authenticate_user(db_manager, current_user.username, request.old_password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect old password"
            )
        
        # Хешируем новый пароль
        hashed_password = auth.get_password_hash(request.new_password)
        
        # Обновляем пароль в БД
        query = "UPDATE users SET hashed_password = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
        db_manager.db.execute(query, (hashed_password, current_user.id))
        
        # Отзываем все refresh tokens пользователя при смене пароля
        crud.revoke_all_user_tokens(db_manager, current_user.id)
        
        logger.info(f"Password changed successfully for user {current_user.username}, all sessions terminated")
        return {"message": "Password changed successfully. Please login again."}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing password for user {current_user.username}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during password change"
        )

# Остальные endpoints (update_user, get_users, make_admin, remove_admin) остаются без изменений...
@app.put("/users/{user_id}", response_model=schemas.UserResponse)
async def update_user(
    user_id: int,
    user_update: schemas.UserUpdate,
    db_manager = Depends(database.get_db),
    current_user: schemas.UserResponse = Depends(get_current_user)
):
    """Обновление информации о пользователе"""
    try:
        # Проверяем права доступа (только свой профиль или superuser)
        if current_user.id != user_id and not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        
        # Получаем текущие данные пользователя
        user = crud.get_user_by_id(db_manager, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Проверяем уникальность email, если он обновляется
        if user_update.email and user_update.email != user['email']:
            existing_user = crud.get_user_by_email(db_manager, user_update.email)
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
        
        # Проверяем уникальность username, если он обновляется
        if user_update.username and user_update.username != user['username']:
            existing_user = crud.get_user_by_username(db_manager, user_update.username)
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken"
                )
        
        # Формируем запрос для обновления
        update_fields = []
        params = []
        
        if user_update.email is not None:
            update_fields.append("email = %s")
            params.append(user_update.email)
        
        if user_update.username is not None:
            update_fields.append("username = %s")
            params.append(user_update.username)
        
        if user_update.is_active is not None and current_user.is_superuser:
            update_fields.append("is_active = %s")
            params.append(user_update.is_active)
        
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        update_query = f"""
        UPDATE users 
        SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        RETURNING *
        """
        params.append(user_id)
        
        updated_user = db_manager.db.execute(update_query, tuple(params), fetch_one=True)
        
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found after update"
            )
        
        logger.info(f"User {user_id} updated successfully")
        return schemas.UserResponse(**updated_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during user update"
        )

@app.get("/users", response_model=list[schemas.UserResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    db_manager = Depends(database.get_db),
    current_user: schemas.UserResponse = Depends(get_current_user)
):
    """Получение списка пользователей (только для superuser)"""
    try:
        if not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        
        query = "SELECT * FROM users ORDER BY id LIMIT %s OFFSET %s"
        users = db_manager.db.execute(query, (limit, skip), fetch=True)
        
        return [schemas.UserResponse(**user) for user in users]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting users list: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.post("/users/{user_id}/make-admin")
async def make_user_admin(
    user_id: int,
    db_manager = Depends(database.get_db),
    current_user: schemas.UserResponse = Depends(get_current_user)
):
    """Назначение пользователя администратором (только для существующих администраторов)"""
    try:
        # Проверяем, что текущий пользователь - администратор
        if not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        
        # Находим пользователя
        user = crud.get_user_by_id(db_manager, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Назначаем администратором
        query = "UPDATE users SET is_superuser = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *"
        updated_user = db_manager.db.execute(query, (user_id,), fetch_one=True)
        
        logger.info(f"User {user['username']} (ID: {user_id}) promoted to admin by {current_user.username}")
        return schemas.UserResponse(**updated_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error promoting user to admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.post("/users/{user_id}/remove-admin")
async def remove_user_admin(
    user_id: int,
    db_manager = Depends(database.get_db),
    current_user: schemas.UserResponse = Depends(get_current_user)
):
    """Удаление прав администратора (только для существующих администраторов)"""
    try:
        # Проверяем, что текущий пользователь - администратор
        if not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        
        # Не позволяем снять права с самого себя
        if user_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove admin rights from yourself"
            )
        
        # Находим пользователя
        user = crud.get_user_by_id(db_manager, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Снимаем права администратора
        query = "UPDATE users SET is_superuser = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *"
        updated_user = db_manager.db.execute(query, (user_id,), fetch_one=True)
        
        logger.info(f"User {user['username']} (ID: {user_id}) demoted from admin by {current_user.username}")
        return schemas.UserResponse(**updated_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error demoting user from admin: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8003,
        log_level=settings.LOG_LEVEL.lower(),
        reload=False
    )