#!/bin/bash
set -e

echo "🔄 Cloud File Update Script"
echo "==========================="

cd /opt/cloud-file

# Pull latest code
echo "📥 Pulling latest changes..."
git pull origin main || git pull origin master

# Pull latest images
echo "🐳 Pulling latest Docker images..."
docker compose pull

# Restart services with zero downtime
echo "🔄 Restarting services..."
docker compose up -d --remove-orphans

# Clean up old images
echo "🧹 Cleaning up old Docker images..."
docker image prune -af --filter "until=72h"

# Show status
echo ""
echo "✅ Update complete!"
docker compose ps
