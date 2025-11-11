import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    SERVICE_NAME = "provider-service"
    SERVICE_VERSION = "1.0.0"
    
    HOST = os.getenv("HOST", "0.0.0.0")
    PROVIDER_PORT = int(os.getenv("PROVIDER_PORT", "5000"))
    API_PORT = int(os.getenv("API_PORT", "5001"))
    
    # УБРАТЬ DATABASE_URL
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_DIR = os.getenv("LOG_DIR", "logs")

settings = Settings()