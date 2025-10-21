import os
from pydantic_settings import BaseSettings
from typing import Optional
import logging

class Settings(BaseSettings):
    # Database URL для твоего PostgreSQLExecutor
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://telemetry_user:telemetry_password@postgresql-service:5432/telemetry_db")
    
    # JWT настройки
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here-change-in-production")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    class Config:
        env_file = ".env"

settings = Settings()

# Настройка логирования
def setup_logging():
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('/app/logs/auth_service.log'),
            logging.StreamHandler()
        ]
    )

setup_logging()
logger = logging.getLogger("auth-service")