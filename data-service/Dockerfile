# data-service/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Установка системных зависимостей для PostgreSQL и Redis
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Создаем директорию для логов
RUN mkdir -p /app/logs
    
# Копирование requirements и установка Python зависимостей
COPY data-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование исходного кода
COPY data-service/ .

COPY database.db/ .

# Копируем общие модули (без models_postgres.py)
COPY shared/ ./shared/

# Удаляем файлы моделей БД из shared, т.к. они теперь в data-service
RUN rm -f ./shared/models_postgres.py ./shared/database_models.py

EXPOSE 8004

CMD ["python", "main.py"]