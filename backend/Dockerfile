FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Run with eventlet worker for WebSocket support
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--worker-class", "eventlet", "-w", "1", "wsgi:app"]