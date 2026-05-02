FROM python:3.12-slim AS base

WORKDIR /app

ARG MAXMIND_ACCOUNT_ID
ARG MAXMIND_LICENSE_KEY

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    tar \
    && rm -rf /var/lib/apt/lists/*

# Download MaxMind GeoLite2-City database
RUN mkdir -p /app/data && \
    if [ -n "$MAXMIND_LICENSE_KEY" ]; then \
      curl -sS -L "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz" -o /tmp/GeoLite2-City.tar.gz && \
      tar xzf /tmp/GeoLite2-City.tar.gz -C /tmp && \
      mv /tmp/GeoLite2-City_*/GeoLite2-City.mmdb /app/data/ && \
      rm -rf /tmp/GeoLite2-City* ; \
    else \
      echo "No MaxMind key provided — GeoLite2 DB skipped" ; \
    fi

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
