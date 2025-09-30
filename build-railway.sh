#!/bin/bash

# F-ChatBouncer Railway Docker Build Script
# This script builds Docker images specifically for AMD64 architecture (Railway)

set -e

# Configuration
DOCKER_USERNAME=${DOCKER_USERNAME:-"brendanspeer"}
BACKEND_IMAGE="fchat-bouncer-backend"
FRONTEND_IMAGE="fchat-bouncer-frontend"
TARGET_PLATFORM="linux/amd64"

# Version management
VERSION_INCREMENT=${VERSION_INCREMENT:-"patch"}  # patch, minor, major

# Git repository checks
echo "🔍 Checking git repository status..."

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not in a git repository. Please run this script from the project root."
    exit 1
fi

# Check if working tree is clean
if ! git diff-index --quiet HEAD --; then
    echo "❌ Working tree is not clean. Please commit or stash your changes before deploying."
    echo "   Uncommitted changes:"
    git diff --name-only
    exit 1
fi

# Check if we're on a branch (not detached HEAD)
if [ -z "$(git symbolic-ref --short HEAD 2>/dev/null)" ]; then
    echo "❌ You are in a detached HEAD state. Please checkout a branch before deploying."
    exit 1
fi

# Check if local branch is up to date with remote
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
REMOTE_BRANCH="origin/$CURRENT_BRANCH"

if git show-ref --verify --quiet "refs/remotes/$REMOTE_BRANCH"; then
    LOCAL_COMMIT=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse "$REMOTE_BRANCH")
    
    if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
        echo "❌ Local branch '$CURRENT_BRANCH' is not up to date with remote."
        echo "   Please pull the latest changes before deploying."
        echo "   Local:  $LOCAL_COMMIT"
        echo "   Remote: $REMOTE_COMMIT"
        exit 1
    fi
else
    echo "⚠️  No remote branch found for '$CURRENT_BRANCH'. Proceeding without remote sync check."
fi

echo "✅ Git repository checks passed"

# Run version management
echo "🔄 Managing version and build ID..."
source ./scripts/version-manager.sh "$VERSION_INCREMENT"

echo "Git Check-in started"
git add build-info.json src/fchat-bouncer-client/package.json src/FChatBouncer.Server/FChatBouncer.Server.csproj
git commit -m "Build $BUILD_ID"

echo "Git Check-in completed"


# Set image tag to Docker-compatible format (version-buildId)
IMAGE_TAG="$DOCKER_TAG"

echo "🐳 Building F-ChatBouncer Docker images for Railway (AMD64)..."
echo "Docker Hub Username: $DOCKER_USERNAME"
echo "Version: $BUILD_VERSION"
echo "Build ID: $BUILD_ID"
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
dotnet publish -c Release -a amd64 --os linux -t:PublishContainer \
    -p:EnableSdkContainerSupport=true \
    -p:ContainerRegistry=docker.io \
    -p:ContainerImageTag="$IMAGE_TAG" \
    -p:Version="$BUILD_VERSION" \
    -p:AssemblyVersion="$BUILD_VERSION" \
    -p:FileVersion="$BUILD_VERSION"

echo "✅ Backend image built successfully for AMD64"

# Tag the backend image with 'latest' for Railway
echo "🏷️  Tagging backend image with 'latest'..."
docker tag "$DOCKER_USERNAME/$BACKEND_IMAGE:$IMAGE_TAG" "$DOCKER_USERNAME/$BACKEND_IMAGE:latest"
cd ../..
echo ""
echo "📦 Building Frontend Image for AMD64..."

# Build frontend image for AMD64 with build-time environment variables
docker build \
    --platform "$TARGET_PLATFORM" \
    --build-arg NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://api.fchat.proactiveapathy.com}" \
    --build-arg BUILD_VERSION="$BUILD_VERSION" \
    --build-arg BUILD_ID="$BUILD_ID" \
    --build-arg GIT_BRANCH="$GIT_BRANCH" \
    --tag "$DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG" \
    --file src/fchat-bouncer-client/Dockerfile \
    src/fchat-bouncer-client/

echo "✅ Frontend image built successfully for AMD64"

# Tag the frontend image with 'latest' for Railway
echo "🏷️  Tagging frontend image with 'latest'..."
docker tag "$DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG" "$DOCKER_USERNAME/$FRONTEND_IMAGE:latest"

echo ""
echo "🚀 Pushing images to Docker Hub..."

# Push backend image with both versioned and latest tags
echo "Pushing backend image..."
docker push "$DOCKER_USERNAME/$BACKEND_IMAGE:$IMAGE_TAG"
docker push "$DOCKER_USERNAME/$BACKEND_IMAGE:latest"

# Push frontend image with both versioned and latest tags
echo "Pushing frontend image..."
docker push "$DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG"
docker push "$DOCKER_USERNAME/$FRONTEND_IMAGE:latest"


echo "Redeploying Railway project..."
railway redeploy -y -s fchat-bouncer-frontend
railway redeploy -y -s fchat-bouncer-backend

# Create git tag for this build
echo ""
echo "🏷️  Creating git tag for build..."
TAG_NAME="v$BUILD_VERSION"
TAG_MESSAGE="Release $BUILD_VERSION (Build: $BUILD_ID)"

# Check if tag already exists
if git tag -l | grep -q "^$TAG_NAME$"; then
    echo "⚠️  Tag '$TAG_NAME' already exists. Skipping tag creation."
else
    # Create and push the tag
    git tag -a "$TAG_NAME" -m "$TAG_MESSAGE"
    echo "✅ Created git tag: $TAG_NAME"
    
    # Push tag to remote if remote exists
    if git remote | grep -q "origin"; then
        echo "📤 Pushing tag to remote..."
        git push origin "$TAG_NAME"
        echo "✅ Tag pushed to remote"
    else
        echo "⚠️  No remote 'origin' found. Tag created locally only."
    fi
fi

echo ""
echo "🎉 Success! AMD64 images pushed to Docker Hub:"
echo "Backend:  docker pull $DOCKER_USERNAME/$BACKEND_IMAGE:$IMAGE_TAG"
echo "Backend:  docker pull $DOCKER_USERNAME/$BACKEND_IMAGE:latest"
echo "Frontend: docker pull $DOCKER_USERNAME/$FRONTEND_IMAGE:$IMAGE_TAG"
echo "Frontend: docker pull $DOCKER_USERNAME/$FRONTEND_IMAGE:latest"
echo ""
echo "📊 Build Summary:"
echo "   Version: $BUILD_VERSION"
echo "   Build ID: $BUILD_ID"
echo "   Branch: $GIT_BRANCH"
echo "   Full Version: $FULL_VERSION"
echo "   Git Tag: v$BUILD_VERSION"
