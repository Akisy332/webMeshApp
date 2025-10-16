FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install -r requirements.txt

COPY gateway.py .

EXPOSE 8000

CMD ["python", "gateway.py"]