from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
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
async def login(login_data: LoginRequest, db_manager=Depends(get_db_manager)):
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
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 900,
            "user": user_data
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
async def refresh_tokens(refresh_data: dict, db_manager=Depends(get_db_manager)):
    """Обновление токенов"""
    try:
        refresh_token = refresh_data.get("refresh_token")
        if not refresh_token:
            raise HTTPException(400, "Refresh token required")
        
        # Проверка refresh token
        payload = verify_token(refresh_token)
        if not payload or payload.get('type') != 'refresh':
            raise HTTPException(401, "Invalid refresh token")
        
        # ... остальная логика обновления токенов ...
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(500, "Internal server error")

@app.post("/api/auth/logout")
async def logout(logout_data: dict, db_manager=Depends(get_db_manager)):
    """Выход пользователя"""
    try:
        refresh_token = logout_data.get("refresh_token")
        if refresh_token:
            from app.auth import revoke_refresh_token
            token_hash = revoke_refresh_token(refresh_token)
            db_manager.db.execute(
                "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = %s",
                (token_hash,)
            )
        
        return {"message": "Successfully logged out"}
        
    except Exception as e:
        logger.error(f"Logout error: {e}")
        raise HTTPException(500, "Internal server error")

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