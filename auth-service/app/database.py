import logging
from shared.models_postgres import get_postgres_manager

logger = logging.getLogger("auth-service")

_db_manager = None

def get_db_manager():
    """Получение менеджера БД"""
    global _db_manager
    if _db_manager is None:
        _db_manager = get_postgres_manager()
        logger.info("Database manager initialized")
    return _db_manager

def get_db():
    """Dependency для FastAPI"""
    return get_db_manager()