FROM python:3.10-slim

WORKDIR /app

# Копируем общие модули
COPY shared/ ./shared/

# Копируем requirements frontend сервиса
COPY frontend/requirements.txt .

RUN pip install -r requirements.txt

COPY frontend/app/static/ ./app/static/
COPY frontend/app/templates/ ./app/templates/

# Копируем код frontend сервиса
COPY frontend/ ./

EXPOSE 5000
EXPOSE 5010

CMD ["python", "run.py"]