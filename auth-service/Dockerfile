FROM python:3.9-slim

WORKDIR /app

# Установка зависимостей для PostgreSQL
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY auth-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY auth-service/ .

# Копируем общие модули
COPY shared/ ./shared/

# Создаем директорию для логов
RUN mkdir -p /app/logs

CMD ["python", "main.py"]