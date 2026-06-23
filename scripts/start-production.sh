#!/bin/bash

# TimeClock API Production Startup Script
echo "🚀 Starting TimeClock API Server in Production Mode..."

# Set production environment
export NODE_ENV=production
export PORT=3000
export HOST=localhost

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing PM2..."
    npm install -g pm2
fi

# Stop any existing instances
echo "🛑 Stopping existing instances..."
pm2 stop timeclock-api 2>/dev/null || true
pm2 delete timeclock-api 2>/dev/null || true

# Start the application with PM2
echo "▶️ Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Show status
echo "📊 Application Status:"
pm2 status

# Show logs
echo "📝 Recent logs:"
pm2 logs timeclock-api --lines 10

echo "✅ TimeClock API Server started successfully!"
echo "🌐 Server should be accessible at http://localhost:3000"
echo "🔍 Health check: http://localhost:3000/health"
echo "📚 API docs: http://localhost:3000/api"