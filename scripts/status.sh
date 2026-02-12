#!/bin/bash

echo "🔍 Cloud File System Status"
echo "==========================="
echo ""

cd /opt/cloud-file

# Show container status
echo "📦 Container Status:"
docker compose ps
echo ""

# Show logs for each service
echo "📋 Recent Logs (last 20 lines):"
echo ""
echo "Backend:"
docker compose logs --tail=20 backend
echo ""
echo "Database:"
docker compose logs --tail=20 db
echo ""
echo "Nginx:"
docker compose logs --tail=20 nginx
echo ""

# Show resource usage
echo "💾 Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
echo ""

# Show disk usage
echo "💿 Disk Usage:"
df -h /opt/cloud-file
docker system df
