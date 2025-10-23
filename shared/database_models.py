import logging

logger = logging.getLogger("database-models")

# Структура таблицы пользователей
USER_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
"""

# Таблица для refresh tokens
REFRESH_TOKENS_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    replaced_by_token_hash VARCHAR(255) DEFAULT NULL
)
"""

# Индексы для пользователей
USER_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
    "CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true",
    "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)"
]

# Индексы для refresh tokens
REFRESH_TOKEN_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked) WHERE revoked = true",
    "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)"
]

def init_user_tables(db_manager):
    """Инициализация таблиц пользователей и refresh tokens"""
    try:
        # Создаем таблицу пользователей
        db_manager.db.execute(USER_TABLE_SCHEMA)
        
        # Создаем таблицу refresh tokens
        db_manager.db.execute(REFRESH_TOKENS_TABLE_SCHEMA)
        
        # Создаем индексы
        for index_query in USER_INDEXES + REFRESH_TOKEN_INDEXES:
            db_manager.db.execute(index_query)
            
        logger.info("User tables and refresh tokens table initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing user tables: {str(e)}")
        raise