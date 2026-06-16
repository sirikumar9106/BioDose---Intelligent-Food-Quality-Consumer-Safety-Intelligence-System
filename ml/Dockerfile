FROM python:3.10-slim

WORKDIR /ml

COPY requirements.txt .
# Pre-install CPU-only torch to save build time and memory (saves ~2GB RAM/disk space)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "shadow_trainer.py"]
