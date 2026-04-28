FROM python:3.12-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
USER root
RUN chmod +x /app/docker-entrypoint.sh
USER appuser

ENTRYPOINT ["/app/docker-entrypoint.sh"]
