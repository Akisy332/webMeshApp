from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import logging
import signal
from auth_config import AuthConfig
from app.auth import verify_token, create_access_token, create_refresh_token, store_refresh_token
from app.database import get_db_manager
from shared.auth_models import LoginRequest, TokenValidationRequest

# Инициализация
app = FastAPI(
    title="Auth-Service",
    version="2.0.0",
    description="Authentication and Authorization Service",
    docs_url="/api/auth/docs",  # Эндпоинт для Swagger UI
    redoc_url="/api/auth/redoc",  # Эндпоинт для ReDoc
    openapi_url="/api/auth/openapi.json"  # Эндпоинт для OpenAPI spec
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://frontend-service:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("auth-service")
auth_config = AuthConfig()

USER_SERVICE_URL = "http://data-service:8004"

# Обработчик сигналов для перезагрузки конфига
def handle_sighup(signum, frame):
    logger.info("Received SIGHUP, reloading config...")
    auth_config.force_reload()

signal.signal(signal.SIGHUP, handle_sighup)

@app.on_event("startup")
async def startup():
    logger.info("Auth-Service started with role hierarchy system")

@app.get("/auth/validate")
async def validate_for_traefik(request: Request, db_manager=Depends(get_db_manager)):
    logger.info("test")
    """Forward Auth endpoint для Traefik"""
    try:
        method = request.headers.get("X-Forwarded-Method", "")
        path = request.headers.get("X-Forwarded-Uri", "")
        
        logger.info(f"Validating: {method} {path}")
        
        # Если это сам /auth/validate - всегда разрешаем
        if path == "/auth/validate" and method == "GET":
            logger.info("Auth validate endpoint - always public")
            return Response(status_code=200)
        
        # 1. Проверка публичных эндпоинтов через роль public
        if auth_config.can_access("public", method, path):
            logger.info(f"Public endpoint allowed: {method} {path}")
            return Response(status_code=200)
        
        # 2. Проверка аутентификации
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            logger.warning(f"Missing Authorization header for {method} {path}")
            return Response(status_code=401)
        
        token = auth_header[7:]
        payload = verify_token(token)
        
        if not payload or payload.get('type') != 'access':
            logger.warning(f"Invalid token for {method} {path}")
            return Response(status_code=401)
        
        # 3. Извлечение данных пользователя
        username = payload.get("sub")
        user_id = payload.get("user_id")
        role = payload.get("role", "public")
        
        if not username or not user_id:
            logger.warning(f"Missing user data in token for {method} {path}")
            return Response(status_code=401)
        
        # 4. Проверка доступа по ролям (с иерархией)
        if not auth_config.can_access(role, method, path):
            logger.warning(f"Access denied for {username} ({role}) to {method} {path}")
            return Response(status_code=403)
        
        # 5. Успешная аутентификация и авторизация
        logger.info(f"Access granted for {username} ({role}) to {method} {path}")
        
        response = Response(status_code=200)
        response.headers.update({
            "X-User-Id": str(user_id),
            "X-User-Name": username,
            "X-User-Role": role,
            "X-User-Permissions": ",".join(payload.get("permissions", []))
        })
        
        return response
        
    except Exception as e:
        logger.error(f"Auth validation error: {e}")
        return Response(status_code=500)

@app.post("/api/auth/login")
async def login(login_data: LoginRequest, response: Response, db_manager=Depends(get_db_manager)):
    """Аутентификация пользователя"""
    try:
        import requests
        
        # Аутентификация через User-Service
        auth_response = requests.post(
            f"{USER_SERVICE_URL}/auth/authenticate",
            json={"username": login_data.username, "password": login_data.password},
            timeout=10
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(401, "Invalid credentials")
        
        auth_result = auth_response.json()
        if not auth_result.get("authenticated"):
            raise HTTPException(401, "Invalid credentials")
        
        user_data = auth_result["user"]
        
        # Создание токенов
        access_token = create_access_token({
            "sub": user_data["username"],
            "user_id": user_data["id"],
            "role": user_data["role"]
        })
        
        refresh_token = create_refresh_token({
            "sub": user_data["username"],
            "user_id": user_data["id"]
        })
        
        # Сохранение refresh token
        store_refresh_token(db_manager, user_data["id"], refresh_token)
        
         # 🔐 УСТАНАВЛИВАЕМ HTTP-ONLY COOKIES
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=False,  # True в production (HTTPS)
            samesite="lax",
            max_age=900,  # 15 минут
            path="/"
        )
        
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=7*24*60*60,  # 7 дней
            path="/api/auth/refresh"  # Только для эндпоинта обновления
        )
        
        # Возвращаем только данные пользователя (без токенов)
        return {
            "user": user_data,
            "message": "Login successful"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(500, "Internal server error")

@app.post("/api/auth/validate-token")
async def validate_token(token_data: TokenValidationRequest):
    """Валидация токена для других сервисов"""
    payload = verify_token(token_data.token)
    
    if not payload or payload.get('type') != 'access':
        return {"valid": False}
    
    return {
        "valid": True,
        "username": payload.get("sub"),
        "user_id": payload.get("user_id"),
        "role": payload.get("role"),
        "permissions": payload.get("permissions", [])
    }

@app.post("/api/auth/refresh")
async def refresh_tokens(request: Request, response: Response, db_manager=Depends(get_db_manager)):
    """Обновление токенов через HTTP-Only cookie"""
    try:
        # Получаем refresh token из cookie
        refresh_token = request.cookies.get("refresh_token")
        if not refresh_token:
            raise HTTPException(401, "Refresh token required")
        
        # Проверка refresh token
        payload = verify_token(refresh_token)
        if not payload or payload.get('type') != 'refresh':
            raise HTTPException(401, "Invalid refresh token")
        
        # Создаем новые токены
        access_token = create_access_token({
            "sub": payload.get("sub"),
            "user_id": payload.get("user_id"),
            "role": payload.get("role", "user")
        })
        
        # Обновляем access token cookie
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=900,
            path="/"
        )
        
        return {"message": "Tokens refreshed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(500, "Internal server error")

@app.post("/api/auth/logout")
async def logout(response: Response):
    """Выход пользователя с очисткой cookies"""
    try:
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/api/auth/refresh")
        return {"message": "Successfully logged out"}
    except Exception as e:
        logger.error(f"Logout error: {e}")
        raise HTTPException(500, "Internal server error")

@app.get("/api/auth/current-user")
async def get_current_user(request: Request):
    """Получение текущего пользователя из access token"""
    access_token = request.cookies.get("access_token")
    
    if not access_token:
        raise HTTPException(401, "Not authenticated")
    
    payload = verify_token(access_token)
    if not payload or payload.get('type') != 'access':
        raise HTTPException(401, "Invalid token")
    
    return {
        "username": payload.get("sub"),
        "user_id": payload.get("user_id"),
        "role": payload.get("role"),
        "permissions": payload.get("permissions", [])
    }

@app.get("/api/auth/health")
async def health_check():
    """Health check endpoint"""
    # Фоновая перезагрузка конфига при health check
    auth_config._load_and_compile()
    return {
        "status": "healthy",
        "service": "auth-service",
        "version": "2.0.0"
    }

@app.get("/api/auth/config-status")
async def config_status():
    """Публичный статус конфигурации"""
    return auth_config.get_stats()

@app.get("/api/auth/reload-config")
async def reload_config():
    """Перезагрузка конфигурации (требует админских прав)"""
    auth_config.force_reload()
    return {
        "status": "config reloaded", 
        "stats": auth_config.get_stats()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8003,
        log_level="debug",
        reload=False
    )