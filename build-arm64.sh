#!/bin/bash

# F-ChatBouncer ARM64 Docker Build Script
# This script builds Docker images specifically for ARM64 architecture

set -e

# Configuration
DOCKER_USERNAME=${DOCKER_USERNAME:-"brendanspeer"}
IMAGE_TAG=${IMAGE_TAG:-"latest"}
BACKEND_IMAGE="fchat-bouncer-backend"
FRONTEND_IMAGE="fchat-bouncer-frontend"
TARGET_PLATFORM="linux/arm64"

echo "🐳 Building F-ChatBouncer Docker images for ARM64..."
echo "Docker Hub Username: $DOCKER_USERNAME"
echo "Image Tag: $IMAGE_TAG"
echo "Target Platform: $TARGET_PLATFORM"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Buildx is available
if ! docker buildx version > /dev/null 2>&1; then
    echo "❌ Docker Buildx is not available. Please install Docker Buildx."
    exit 1
fi

echo ""
echo "📦 Building Backend Image for ARM64..."

# Build backend image with ARM64 support
docker buildx build \
    --platform "$TARGET_PLATFORM" \
    --tag "$DOCKER_USERNAME/$BACKEND_IMAGE:$IMAGE_TAG" \
    --file src/FChatBouncer.Server/Dockerfile \
    --load \
    src/FChatBouncer.Server/

echo "✅ Backend image built successfully for ARM64"

echo ""
echo "📦 Building Frontend Image for ARM64..."

# Build frontend image with ARM64 support
docker buildx build \
    --platform "$TARGET_PLATFORM" \
    --tag "$DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG" \
    --file src/fchat-bouncer-client/Dockerfile \
    --load \
    src/fchat-bouncer-client/

echo "✅ Frontend image built successfully for ARM64"

echo ""
echo "🚀 Pushing images to Docker Hub..."

# Push backend image
echo "Pushing backend image..."
docker push "$DOCKER_USERNAME/$BACKEND_IMAGE:$IMAGE_TAG"

# Push frontend image
echo "Pushing frontend image..."
docker push "$DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG"

echo ""
echo "🎉 Success! ARM64 images pushed to Docker Hub:"
echo "Backend:  docker pull $DOCKER_USERNAME/$BACKEND_IMAGE:$IMAGE_TAG"
echo "Frontend: docker pull $DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG"
echo ""
echo "📋 To deploy on ARM64 EC2:"
echo "1. Use the ARM64 images on your EC2 instance"
echo "2. Update docker-compose.yml to use the correct images"
echo "3. Deploy with: docker-compose up -d"
