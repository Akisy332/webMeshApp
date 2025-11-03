import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    SERVICE_NAME = "provider-service"
    SERVICE_VERSION = "1.0.0"
    
    HOST = os.getenv("HOST", "0.0.0.0")
    PROVIDER_PORT = int(os.getenv("PROVIDER_PORT", "5000"))
    API_PORT = int(os.getenv("API_PORT", "5001"))
    
    # PostgreSQL настройки
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://telemetry_user:telemetry_password@localhost:5432/telemetry_db")
    
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_DIR = os.getenv("LOG_DIR", "logs")
    
    BATCH_SIZE = int(os.getenv("BATCH_SIZE", "100"))
    FLUSH_INTERVAL = float(os.getenv("FLUSH_INTERVAL", "1.0"))
    MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
    RETRY_DELAY = float(os.getenv("RETRY_DELAY", "1.0"))

settings = Settings()