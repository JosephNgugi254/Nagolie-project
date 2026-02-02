#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Apply database migrations
echo "📦 Running database migrations..."
flask db upgrade

# Check if migrations succeeded
if [ $? -eq 0 ]; then
    echo "✅ Database migrations completed successfully"
else
    echo "⚠️  Migration failed, trying to initialize..."
    flask db init || true
    flask db migrate -m "Initial migration" || true
    flask db upgrade || true
fi

# Start the application
echo "🚀 Starting application..."
exec gunicorn wsgi:app --bind 0.0.0.0:$PORT --timeout 120 --workers 2