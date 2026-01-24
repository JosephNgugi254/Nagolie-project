#!/bin/bash
set -e

echo "=========================================="
echo "Starting Nagolie Backend on Render"
echo "=========================================="

# Fix database URL format for SQLAlchemy
if [ -n "$DATABASE_URL" ]; then
    echo "Original DATABASE_URL: $DATABASE_URL"
    export DATABASE_URL="${DATABASE_URL/postgres:/postgresql:}"
    echo "Fixed DATABASE_URL: $DATABASE_URL"
    
    # Test database connection
    echo "Testing database connection..."
    timeout 15 bash -c 'until pg_isready -h $(echo $DATABASE_URL | cut -d@ -f2 | cut -d/ -f1) -p 5432; do sleep 1; done'
    echo "✓ Database connection successful"
fi

# Wait a moment for database to be fully ready
sleep 2

# Run migrations
echo "Running database migrations..."
python migrate.py

echo "Starting Gunicorn server..."
exec gunicorn wsgi:app \
    --workers 2 \
    --worker-class sync \
    --bind 0.0.0.0:5000 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --log-level info