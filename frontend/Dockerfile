# frontend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Копирование requirements
COPY frontend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование исходного кода frontend
COPY frontend/ .

# Копируем общие модули
COPY shared/ ./shared/

EXPOSE 5000

CMD ["python", "run.py"]