import logging
from app.config import settings
from shared.models_postgres import get_postgres_manager

logger = logging.getLogger("user-service")

# Глобальная переменная для менеджера БД
_db_manager = None

def get_db_manager():
    """Получение менеджера БД"""
    global _db_manager
    if _db_manager is None:
        try:
            _db_manager = get_postgres_manager()
            logger.info("Database manager initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing database manager: {str(e)}")
            raise
    return _db_manager

def get_db():
    """Dependency для FastAPI - возвращает менеджер БД"""
    return get_db_manager()