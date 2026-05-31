FROM python:3.10-slim

WORKDIR /code

# Системные зависимости для asyncpg/psycopg
RUN apt-get update && apt-get install --no-install-recommends -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Запуск FastAPI
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]