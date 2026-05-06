#!/bin/bash
set -e

# Fix ownership of the uploads volume (host bind-mount may be root-owned)
if [ -d /app/uploads ]; then
    chown -R appuser:appuser /app/uploads
fi

echo "Running database migrations..."
su appuser -c "alembic upgrade head"

echo "Starting FastAPI..."
exec su appuser -c "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"
