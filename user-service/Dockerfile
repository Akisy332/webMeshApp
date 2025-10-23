FROM python:3.9-slim

WORKDIR /app

# Установка системных зависимостей для PostgreSQL
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Копируем зависимости
COPY user-service/requirements.txt .

# Устанавливаем Python зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код
COPY user-service/ .

# Копируем общие модули
COPY shared/ ./shared/

# Создаем директорию для логов
RUN mkdir -p /app/logs

EXPOSE 8004

CMD ["python", "main.py"]