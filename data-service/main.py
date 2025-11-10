from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import requests
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import random
import colorsys
import math
import os
import sys

from config import settings

from models_postgres import PostgreSQLDatabaseManager
from redis_subscriber import RedisSubscriber

# Глобальные переменные
db_manager: Optional[PostgreSQLDatabaseManager] = None
redis_subscriber: Optional[RedisSubscriber] = None
logger = logging.getLogger("data-service")

# Хелперы
def get_db_manager() -> PostgreSQLDatabaseManager:
    """Безопасное получение менеджера БД"""
    if db_manager is None:
        logger.error("Database manager accessed before initialization")
        raise HTTPException(status_code=500, detail="Database service not available")
    return db_manager

def get_redis_subscriber() -> RedisSubscriber:
    """Безопасное получение Redis подписчика"""
    if redis_subscriber is None:
        logger.error("Redis subscriber accessed before initialization")
        raise HTTPException(status_code=500, detail="Redis service not available")
    return redis_subscriber

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Код при старте сервера
    global db_manager, redis_subscriber, logger 

    # Иницилизация менеджера БД
    db_manager = PostgreSQLDatabaseManager()
    logger.info(f"Main.py DB Manager instance: {id(db_manager)}")
        
    # Иницилизация подписчика Redis
    redis_subscriber = RedisSubscriber(db_manager)
    logger.info(f"RedisSubscriber instance: {id(redis_subscriber)}")
    
    # Проверка подключения к Redis
    if not redis_subscriber.redis_client:
        logger.error("REDIS CLIENT IS NONE!")
    elif not redis_subscriber.redis_client.is_connected():
        logger.error("REDIS CLIENT NOT CONNECTED!")
    else:
        logger.info("Redis client is connected")
    
    # Запуск подписчика Redis 
    redis_subscriber.start()
    logger.info("Redis subscriber started")
    
    logger.info(f"Application started! PID: {os.getpid()}")
    
    yield
    
    # Код при отключении сервера
    logger.info("Shutting down application...")
    if redis_subscriber:
        redis_subscriber.stop()
        logger.info("Redis subscriber stopped")
    
    logger.info("Application shutdown complete")

app = FastAPI(
    title="Data Service API",
    description="Unified data service for all database operations",
    version="1.1.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "data-service"}


from shared.user_models import UserCreate, UserResponse, UserUpdate, RoleUpdateRequest, UserRole
from shared.auth_models import PasswordChangeRequest

# ==================== USER ENDPOINTS ====================

@app.post("/api/users", response_model=UserResponse)
async def create_user(user: UserCreate):
    """Создание нового пользователя"""
    try:
        logger.info(f"User creation attempt: {user.username}")
        
        user_data = {
            'email': user.email,
            'username': user.username,
            'password': user.password,
            'role': user.role
        }
        
        current_db = get_db_manager()
        
        from user_crud import create_user_db
        db_user = create_user_db(current_db, user_data)
        if db_user is None:
            raise HTTPException(
                status_code=400,
                detail="Email or username already registered"
            )
        
        return UserResponse(**db_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"User creation error for {user.username}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during user creation"
        )


@app.get("/api/users/init-first-admin")
async def init_first_admin():
    """Инициализация первого администратора (публичный эндпоинт)"""
    try:
        current_db = get_db_manager()
        
        # Проверяем, есть ли уже администраторы в системе
        admin_count = current_db.db.execute(
            "SELECT COUNT(*) as count FROM users WHERE role IN ('admin', 'developer')",
            fetch_one=True
        )
        
        if admin_count and admin_count['count'] > 0:
            raise HTTPException(
                status_code=400,
                detail="Administrator already exists in the system"
            )
        
        admin_user = {
            'email': 'admin@main.ru',
            'username': 'admin',
            'password': 'Admin123!',
            'role': UserRole.ADMIN
        }
        
        from user_crud import create_user_db
        db_user = create_user_db(current_db, admin_user)
        if db_user is None:
            raise HTTPException(
                status_code=400,
                detail="Email or username already registered"
            )
        
        logger.info(f"First admin user created: {db_user['username']}")
        return {"message": "First administrator created successfully", "user": db_user}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating first admin: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during admin creation"
        )


@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int):
    """Получение пользователя по ID"""
    try:
        current_db = get_db_manager()
        
        from user_crud import get_user_by_id_db
        user = get_user_by_id_db(current_db, user_id)
        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )
        return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )

@app.get("/api/users/username/{username}", response_model=UserResponse)
async def get_user_by_username(username: str):
    """Получение пользователя по username"""
    try:
        current_db = get_db_manager()
        
        from user_crud import get_user_by_username
        user = get_user_by_username(current_db, username)
        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )
        return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user {username}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )

@app.put("/api/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate
):
    """Обновление информации о пользователе"""
    try:
        current_db = get_db_manager()
        
        from user_crud import update_user_db
        updated_user = update_user_db(current_db, user_id, user_update.dict(exclude_unset=True))
        if not updated_user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )
        
        return UserResponse(**updated_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during user update"
        )

@app.post("/api/users/{user_id}/change-password")
async def change_password(
    user_id: int,
    password_data: PasswordChangeRequest
):
    """Смена пароля пользователя"""
    try:
        current_db = get_db_manager()
        
        from user_crud import change_password_db
        success = change_password_db(current_db, user_id, password_data.old_password, password_data.new_password)
        if not success:
            raise HTTPException(
                status_code=400,
                detail="Incorrect old password"
            )
        
        return {"message": "Password changed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing password for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during password change"
        )

@app.put("/api/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: int,
    role_update: RoleUpdateRequest
):
    """Обновление роли пользователя"""
    try:
        current_db = get_db_manager()
        
        from user_crud import update_user_role_db
        updated_user = update_user_role_db(current_db, user_id, role_update.role)
        if not updated_user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )
        
        logger.info(f"User {updated_user['username']} role updated to {role_update.role.value}")
        return UserResponse(**updated_user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user role: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )

@app.get("/api/users/role/{role}", response_model=List[UserResponse])
async def get_users_by_role(
    role: str,
    skip: int = 0,
    limit: int = 100
):
    """Получение пользователей по роли"""
    try:
        current_db = get_db_manager()
        
        from user_crud import get_users_by_role_db
        users = get_users_by_role_db(current_db, role, skip, limit)
        return [UserResponse(**user) for user in users]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting users by role {role}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )

@app.get("/api/users", response_model=List[UserResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100
):
    """Получение списка пользователей"""
    try:
        current_db = get_db_manager()
        
        from user_crud import get_users_list_db
        users = get_users_list_db(current_db, skip, limit)
        return [UserResponse(**user) for user in users]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting users list: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )

# ==================== SESSIONS ENDPOINTS ====================

@app.get("/api/sessions")
async def get_sessions():
    """Получение списка всех сессий"""
    try:
        current_db = get_db_manager()
        
        sessions = current_db.get_all_sessions()
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions")
async def create_session(session_data: dict):
    """Создать новую сессию"""
    try:
        if not session_data or 'name' not in session_data:
            raise HTTPException(status_code=400, detail="Необходимо указать название сессии")
        
        current_db = get_db_manager()
        
        session_id = current_db._get_or_create_session(None, session_data['name'], session_data.get('description', ''))
        
        if not session_id:
            raise HTTPException(status_code=500, detail="Не удалось создать сессию")
            
        session_data_result = current_db._get_session_by_id(session_id)
        
        new_session = {
            'id': session_id,
            'name': session_data['name'],
            'description': session_data.get('description', ''),
            'datetime': session_data_result['datetime'].isoformat() if session_data_result and session_data_result.get('datetime') else datetime.now().isoformat()
        }
        
        return new_session
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}")
async def get_session_data(session_id: int):
    """Получение данных конкретной сессии"""
    try:
        current_db = get_db_manager()
        
        data = {}
        data["modules"] = current_db.get_last_message(session_id)
        data["map"] = current_db.get_session_map_view(session_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: int):
    """Удалить сессию"""
    try:
        current_db = get_db_manager()
        
        if not current_db.hide_session(session_id):
            raise HTTPException(status_code=404, detail="Сессия не найдена")
        
        return {"message": "Сессия удалена"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/data/{session_id}")
async def get_session_center_radius(session_id: int):
    """Получение данных конкретной сессии"""
    try:
        current_db = get_db_manager()
        
        data = current_db.get_session_map_view(session_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== TABLE DATA ENDPOINTS ====================

@app.get("/api/table/users/search")
async def search_user(
    field: str = Query(..., description="Field to search"),
    value: str = Query(..., description="Value to search")
):
    """API endpoint для поиска пользователя по полю"""
    try:
        valid_fields = ['name_module', 'id_module', 'source', 'status', 'rssi']
        if not field or field not in valid_fields:
            raise HTTPException(status_code=400, detail=f'Invalid field. Valid fields: {valid_fields}')
        
        if not value:
            raise HTTPException(status_code=400, detail='Value is required')
        
        target_id = None
        
        if field == 'name_module' and 'Module' in value:
            try:
                id_from_name = int(value.replace('Module', '').strip())
                if 1 <= id_from_name <= 10000:
                    target_id = id_from_name
            except ValueError:
                pass
        
        elif field == 'id_module' and value.startswith('MOD'):
            try:
                id_from_module = int(value.replace('MOD', ''))
                if 1 <= id_from_module <= 10000:
                    target_id = id_from_module
            except ValueError:
                pass
        
        elif field == 'source':
            target_id = random.randint(1, 10000)
        
        elif field == 'rssi':
            try:
                db_value = int(value.replace('dBm', '').replace('-', '').strip())
                target_id = random.randint(1, 10000)
            except ValueError:
                pass
        
        if not target_id:
            target_id = random.randint(1, 10000)
        
        return {
            'success': True,
            'field': field,
            'value': value,
            'target_id': target_id,
            'message': f'Found {field} = "{value}" at ID {target_id}'
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/table/users")
async def get_users_table(
    session_id: int = Query(0),
    modules: str = Query(''),
    limit: int = Query(100),
    offset: int = Query(0),
    direction: str = Query('down')
):
    """API endpoint для получения данных с пагинацией"""
    try:
        if modules:
            module_ids = [int(x.strip()) for x in modules.split(',') if x.strip()]
        else:
            module_ids = []
        
        if offset < 0 or limit <= 0 or limit > 500:
            raise HTTPException(status_code=400, detail='Invalid parameters')
        
        if direction == 'up':
            offset = offset - int((limit))
            if offset < 0:
                offset = 0
                
        current_db = get_db_manager()        
                
        data, total_count, modules_count = current_db.get_session_data(
            session_id=session_id,
            module_ids=module_ids,
            limit=limit,
            offset=offset
        )
        
        if direction == 'up':
            has_more = (offset + limit) < total_count
        else:
            has_more = (offset + limit) > 1
            
        return {
            'success': True,
            'data': data,
            'total_count': total_count,
            'session_id': session_id,
            'has_more': has_more,
            'direction': direction,
            'limit': limit,
            'offset': offset,
            'total_visible_count': modules_count,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/table/users/datetime")
async def get_users_datetime(
    session_id: int = Query(0),
    modules: str = Query(''),
    limit: int = Query(100),
    datetime_unix: int = Query(0),
    direction: str = Query('down')
):
    """API endpoint для получения данных вокруг указанного datetime_unix"""
    try:
        if modules:
            module_ids = [int(x.strip()) for x in modules.split(',') if x.strip()]
        else:
            module_ids = []
        
        if datetime_unix <= 0 or limit <= 0 or limit > 500:
            raise HTTPException(status_code=400, detail='Invalid parameters')
        
        current_db = get_db_manager()     
                
        data, total_count, modules_count, position = current_db.get_session_data_centered_on_time(
            session_id=session_id,
            module_ids=module_ids,
            limit=limit,
            target_datetime_unix=datetime_unix
        )
        
        if direction == 'up':
            has_more = (datetime_unix + limit) < total_count
        else:
            has_more = (datetime_unix + limit) > 1
            
        return {
            'success': True,
            'data': data,
            'total_count': total_count,
            'session_id': session_id,
            'has_more': has_more,
            'direction': direction,
            'limit': limit,
            'datetime_unix': datetime_unix,
            'total_visible_count': modules_count,
            'target_id': position,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== MODULES ENDPOINTS ====================

@app.get("/api/modules/trace")
async def get_trace_module(
    id_module: str = Query(...),
    id_session: int = Query(...),
    id_message_type: int = Query(None)
):
    """Получение трека модуля"""
    try:
        current_db = get_db_manager()   
        data = current_db.get_module_coordinates(int(id_module, 16), id_session, id_message_type)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/modules")
async def get_modules():
    """Получение всех модулей"""
    try:
        current_db = get_db_manager()   
        modules = current_db.get_all_modules()
        return modules
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/modules/{module_id}/stats")
async def get_module_stats(
    module_id: int,
    session_id: int = Query(None)
):
    """Получение статистики по модулю"""
    try:
        current_db = get_db_manager()  
        stats = current_db.get_module_statistics(module_id, session_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/modules/search")
async def search_modules(q: str = Query(..., description="Search term")):
    """Поиск модулей"""
    try:
        if not q:
            return []
        
        current_db = get_db_manager()  
        results = current_db.search_modules(q)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== DATABASE ENDPOINTS ====================

@app.get("/api/database/data")
async def get_data(limit: int = Query(1000)):
    """Получение всех данных"""
    try:
        current_db = get_db_manager()  
        data = current_db.get_all_data(limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/database/stats")
async def get_database_stats():
    """Получение статистики базы данных"""
    try:
        current_db = get_db_manager()  
        stats = current_db.get_database_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/database/migrate-sqlite")
async def migrate_sqlite_to_postgres():
    """Миграция данных из SQLite в PostgreSQL"""
    try:
        # Импортируем и запускаем миграцию
        from migrate_sqlite_to_postgres import migrate_data, verify_migration
        
        logger.info("Starting SQLite to PostgreSQL migration...")
        
        if migrate_data():
            verify_migration()
            return {"message": "Migration completed successfully"}
        else:
            raise HTTPException(status_code=500, detail="Migration failed")
            
    except Exception as e:
        logger.error(f"Migration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/data/parse")
async def parse_and_store_data(
    data_string: str,
    session_id: int = Query(None),
    session_name: str = Query("")
):
    """Парсинг и сохранение данных"""
    try:
        current_db = get_db_manager()  
        result = current_db.parse_and_store_data(data_string, session_id, session_name)
        if not result:
            raise HTTPException(status_code=400, detail="Failed to parse and store data")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import HTMLResponse, RedirectResponse
import urllib.parse

@app.api_route("/api/database/upload", methods=["GET", "POST"])
async def upload_file(request: Request):
    return None
    # """Комбинированный GET/POST метод для загрузки файла (аналог Flask)"""
    
    # if request.method == "POST":
    #     form_data = await request.form()
    #     file = form_data.get("file")
    #     session_name = form_data.get("session_name", "default_session")
        
    #     if not file or not hasattr(file, 'filename'):
    #         return RedirectResponse(url="/api/database/upload", status_code=303)
        
    #     if file.filename == '':
    #         return RedirectResponse(url="/api/database/upload", status_code=303)
        
    #     if file and allowed_file(file.filename):
    #         # Сохраняем файл во временную директорию
    #         with NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
    #             content = await file.read()
    #             temp_file.write(content)
    #             temp_file_path = temp_file.name
            
    #         try:
    #             # Создаем сессию
    #            current_db = get_db_manager()  
    #             session_id = current_db._get_or_create_session(None, session_name)
                
    #             # Читаем и обрабатываем файл
    #             with open(temp_file_path, 'r', encoding='utf-8') as f:
    #                 lines = f.readlines()
    #                 success_count = 0
    #                 error_count = 0
                    
    #                 for line in lines:
    #                     line = line.strip()
    #                     if line:
    #                        current_db = get_db_manager()  
    #                         result = current_db.parse_and_store_data(line, session_id, session_name)
    #                         if result:
    #                             success_count += 1
    #                         else:
    #                             error_count += 1
                
    #             # Возвращаем HTML с JavaScript alert как в оригинале
    #             html_response = f'''
    #             <script>
    #                 alert('Файл успешно обработан! Успешно: {success_count}, Ошибок: {error_count}');
    #                 window.location.href = '/';
    #             </script>
    #             '''
    #             return HTMLResponse(content=html_response)
                
    #         except Exception as e:
    #             html_response = f'''
    #             <script>
    #                 alert('Ошибка при обработке файла: {str(e)}');
    #                 window.location.href = '/';
    #             </script>
    #             '''
    #             return HTMLResponse(content=html_response)
    #         finally:
    #             # Удаляем временный файл
    #             if os.path.exists(temp_file_path):
    #                 os.remove(temp_file_path)
    
    # # GET метод - показываем форму
    # html_form = '''
    # <form method="post" enctype="multipart/form-data">
    #     <input type="file" name="file">
    #     <input type="text" name="session_name" placeholder="Session name" value="default_session">
    #     <input type="submit" value="Upload">
    # </form>
    # '''
    # return HTMLResponse(content=html_form)

# ==================== USER ENDPOINTS (для auth-service) ====================

@app.post("/auth/authenticate")
async def authenticate_user(auth_data: dict):
    """Аутентификация пользователя (для внутреннего использования auth-service)"""
    try:
        username = auth_data.get("username", None)
        password = auth_data.get("password", None)
        
        if username is None or password is None:
            return {"authenticated": False}
        
        current_db = get_db_manager()  
        
        # Используем функцию из user_crud.py
        from user_crud import authenticate_user_db
        user = authenticate_user_db(current_db, username, password)
        if not user:
            return {"authenticated": False}
        
        return {
            "authenticated": True,
            "user": user
        }
        
    except Exception as e:
        logger.error(f"Authentication error for user {auth_data.get('username')}: {str(e)}")
        return {"authenticated": False}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8004,
        workers=1,
        log_level="info",
        reload=False
    )
    
