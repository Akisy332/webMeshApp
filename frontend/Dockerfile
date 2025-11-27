# frontend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Установка Node.js и системных зависимостей
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Копирование исходного кода
COPY frontend/ .

# Копируем общие модули
COPY shared/ ./shared/

# Установка TypeScript
RUN npm install -g typescript
RUN npm install

# Сборка TypeScript
RUN npm run build && npm run copy-css

# Установка Python зависимостей
COPY frontend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5000

CMD ["python", "run.py"]