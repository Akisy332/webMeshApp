import os
from pydantic_settings import BaseSettings
from typing import Optional
import logging

class Settings(BaseSettings):
    # Database URL для PostgreSQLExecutor
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://telemetry_user:telemetry_password@postgresql-service:5432/telemetry_db")
    
    # JWT настройки (для проверки паролей)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here-change-in-production")
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Auth service URL для внутренних вызовов
    AUTH_SERVICE_URL: str = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8003")
    
    class Config:
        env_file = ".env"

settings = Settings()

# Настройка логирования
def setup_logging():
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('/app/logs/user_service.log'),
            logging.StreamHandler()
        ]
    )

setup_logging()
logger = logging.getLogger("user-service")