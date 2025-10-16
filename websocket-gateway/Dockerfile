FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install -r requirements.txt

COPY gateway.py .

ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["python", "-u", "gateway.py"]