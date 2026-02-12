#!/bin/bash
set -e

echo "🚀 Cloud File Deployment Script"
echo "================================"

# Configuration
DEPLOY_DIR="/opt/cloud-file"
REPO_URL="https://github.com/farid-asgarli/ws-cloud.git"

# Create deployment directory if it doesn't exist
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "📁 Creating deployment directory..."
    sudo mkdir -p $DEPLOY_DIR
    sudo chown $USER:$USER $DEPLOY_DIR
fi

# Navigate to deployment directory
cd $DEPLOY_DIR

# Clone or pull repository
if [ ! -d ".git" ]; then
    echo "📥 Cloning repository..."
    git clone $REPO_URL .
else
    echo "🔄 Pulling latest changes..."
    git pull origin main || git pull origin master
fi

# Create appsettings.Production.json from template if it doesn't exist
if [ ! -f "appsettings.Production.json" ]; then
    echo "⚙️  Creating appsettings.Production.json..."
    cat > appsettings.Production.json << 'EOF'
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=db;Port=5432;Database=cloudfile;Username=cloudfile;Password=cloudfile_secret"
  },
  "FileSystem": {
    "RootPath": "/app/storage"
  },
  "Jwt": {
    "SecretKey": "CHANGE-THIS-TO-A-SECURE-KEY-IN-PRODUCTION-MIN-32-CHARS",
    "Issuer": "CloudFile",
    "Audience": "CloudFileClient",
    "ExpirationMinutes": 1440
  },
  "AdminUser": {
    "Email": "admin@cloudfile.local",
    "Password": "Admin@123456",
    "DisplayName": "Administrator"
  },
  "Security": {
    "CorsOrigins": ["https://prism.atlas-forge.cloud"],
    "RateLimiting": {
      "Enabled": true,
      "WindowSeconds": 60,
      "GeneralRequestsPerWindow": 200,
      "AuthRequestsPerWindow": 10,
      "UploadRequestsPerWindow": 50
    },
    "FileTypeRestrictions": {
      "MaxFileSizeBytes": 524288000,
      "UseDefaultBlockedExtensions": true,
      "BlockedExtensions": [],
      "AllowedExtensions": []
    }
  }
}
EOF
    echo "⚠️  Please edit appsettings.Production.json with your production secrets"
fi

# Pull latest Docker images
echo "🐳 Pulling Docker images..."
docker compose pull

# Stop and remove old containers
echo "🛑 Stopping old containers..."
docker compose down

# Start new containers
echo "▶️  Starting containers..."
docker compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Show status
echo ""
echo "✅ Deployment complete!"
echo ""
docker compose ps
echo ""
echo "📊 Application should be available at:"
echo "   - App: https://prism.atlas-forge.cloud"
echo "   - API: https://prism.atlas-forge.cloud/api"
echo "   - Health: https://prism.atlas-forge.cloud/health"
