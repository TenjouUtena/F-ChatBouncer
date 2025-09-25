#!/bin/bash

# F-ChatBouncer Railway Docker Build Script
# This script builds Docker images specifically for AMD64 architecture (Railway)

set -e

# Configuration
DOCKER_USERNAME=${DOCKER_USERNAME:-"brendanspeer"}
IMAGE_TAG=${IMAGE_TAG:-"latest"}
BACKEND_IMAGE="fchat-bouncer-backend"
FRONTEND_IMAGE="fchat-bouncer-frontend"
TARGET_PLATFORM="linux/amd64"

echo "🐳 Building F-ChatBouncer Docker images for Railway (AMD64)..."
echo "Docker Hub Username: $DOCKER_USERNAME"
echo "Image Tag: $IMAGE_TAG"
echo "Target Platform: $TARGET_PLATFORM"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

echo ""
echo "📦 Building Backend Image for AMD64..."


cd src/FChatBouncer.Server
dotnet publish -c Release -a amd64 --os linux -t:PublishContainer -p:EnableSdkContainerSupport=true -p ContainerRegistry=docker.io

echo "✅ Backend image built successfully for AMD64"
cd ../..
echo ""
echo "📦 Building Frontend Image for AMD64..."

# Build frontend image for AMD64
docker build \
    --platform "$TARGET_PLATFORM" \
    --tag "$DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG" \
    --file src/fchat-bouncer-client/Dockerfile \
    src/fchat-bouncer-client/

echo "✅ Frontend image built successfully for AMD64"

echo ""
echo "🚀 Pushing images to Docker Hub..."
# Push frontend image
echo "Pushing frontend image..."
docker push "$DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG"

echo ""
echo "🎉 Success! AMD64 images pushed to Docker Hub:"
echo "Backend:  docker pull $DOCKER_USERNAME/$BACKEND_IMAGE:$IMAGE_TAG"
echo "Frontend: docker pull $DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG"
echo ""
echo "📋 To deploy on Railway:"
echo "1. Go to Railway dashboard"
echo "2. Create new project"
echo "3. Add service from Docker Hub"
echo "4. Use image: $DOCKER_USERNAME/$BACKEND_IMAGE:$IMAGE_TAG"
echo "5. Add environment variables from ENVIRONMENT_CONFIG.md"
echo ""
echo "🔧 Railway-specific notes:"
echo "- Railway automatically handles AMD64 architecture"
echo "- Make sure your Dockerfile doesn't specify ARM64-specific settings"
echo "- Use the production docker-compose.yml for Railway deployment"



