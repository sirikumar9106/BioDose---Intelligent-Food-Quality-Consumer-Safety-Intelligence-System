FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System deps for OpenCV, psycopg2, and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    libglib2.0-0 \
    libgl1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

# Run migrations then start gunicorn (production WSGI server)
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn biodose.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120"]