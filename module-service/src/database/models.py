from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from config.settings import settings

Base = declarative_base()

class ProviderMessage(Base):
    __tablename__ = 'provider_messages'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_address = Column(String(100), nullable=False)
    hex_data = Column(Text, nullable=False)
    packet_number = Column(Integer, nullable=False)
    parsed_data = Column(JSON)  # Для хранения распаршенных данных
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'provider_address': self.provider_address,
            'hex_data': self.hex_data,
            'packet_number': self.packet_number,
            'parsed_data': self.parsed_data,
            'created_at': self.created_at.isoformat()
        }

class ProviderConnection(Base):
    __tablename__ = 'provider_connections'
    
    address = Column(String(100), primary_key=True)
    connection_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False)
    last_activity = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

# Создаем engine и сессию
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Инициализация базы данных (создание таблиц)"""
    Base.metadata.create_all(bind=engine)

def get_db_session():
    """Получение сессии БД"""
    db = SessionLocal()
    try:
        return db
    finally:
        db.close()