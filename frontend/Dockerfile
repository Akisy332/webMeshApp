FROM python:3.11-slim

WORKDIR /app

# Установка системных зависимостей для PostgreSQL
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Копирование requirements и установка Python зависимостей
COPY frontend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY database.db .

# Копирование исходного кода
COPY frontend/ .

# Копируем общие модули
COPY shared/ ./shared/

# Создание необходимых директорий
RUN mkdir -p uploads

EXPOSE 5000

CMD ["python", "run.py"]