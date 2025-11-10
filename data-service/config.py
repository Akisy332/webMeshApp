import os
import logging
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://telemetry_user:telemetry_password@postgresql-service:5432/telemetry_db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-jwt-secret-key-change-in-production")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis-service:6379/0")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    class Config:
        env_file = ".env"

settings = Settings()

# Настройка логирования
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/logs/data_service.log'),
        logging.StreamHandler()
    ]
)