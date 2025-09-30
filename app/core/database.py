# app/core/database.py
from app.shared.database.executor import SQLiteExecutor
from app.core.config import DATABASE_PATH

# Создаем глобальный экземпляр здесь
db_executor = SQLiteExecutor(DATABASE_PATH)