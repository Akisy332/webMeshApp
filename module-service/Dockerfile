# module-service/Dockerfile
FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

COPY module-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY module-service/ .

# Копируем общие модули
COPY shared/ ./shared/

# Создаем директории для логов
RUN mkdir -p /app/logs /app/data

EXPOSE 5000 5001

CMD ["python", "main.py"]