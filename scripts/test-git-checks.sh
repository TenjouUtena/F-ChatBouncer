#!/bin/bash

# Test script for git checks and tagging functionality

set -e

echo "🧪 Testing git checks and tagging functionality..."

# Test 1: Check if we're in a git repository
echo "📋 Test 1: Git repository check"
if git rev-parse --git-dir > /dev/null 2>&1; then
    echo "✅ In a git repository"
else
    echo "❌ Not in a git repository"
    exit 1
fi

# Test 2: Check working tree status
echo ""
echo "📋 Test 2: Working tree status"
if git diff-index --quiet HEAD --; then
    echo "✅ Working tree is clean"
else
    echo "⚠️  Working tree has uncommitted changes:"
    git diff --name-only
fi

# Test 3: Check current branch
echo ""
echo "📋 Test 3: Current branch"
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
if [ -n "$CURRENT_BRANCH" ]; then
    echo "✅ On branch: $CURRENT_BRANCH"
else
    echo "❌ In detached HEAD state"
fi

# Test 4: Check remote sync
echo ""
echo "📋 Test 4: Remote sync check"
REMOTE_BRANCH="origin/$CURRENT_BRANCH"
if git show-ref --verify --quiet "refs/remotes/$REMOTE_BRANCH"; then
    LOCAL_COMMIT=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse "$REMOTE_BRANCH")
    
    if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
        echo "✅ Local branch is up to date with remote"
    else
        echo "⚠️  Local branch is not up to date with remote"
        echo "   Local:  $LOCAL_COMMIT"
        echo "   Remote: $REMOTE_COMMIT"
    fi
else
    echo "⚠️  No remote branch found for '$CURRENT_BRANCH'"
fi

# Test 5: Test version manager
echo ""
echo "📋 Test 5: Version manager with git info"
source ./scripts/version-manager.sh patch

echo ""
echo "📋 Test 6: Git tag creation simulation"
TAG_NAME="v$BUILD_VERSION"
TAG_MESSAGE="Release $BUILD_VERSION (Build: $BUILD_ID)"

if git tag -l | grep -q "^$TAG_NAME$"; then
    echo "⚠️  Tag '$TAG_NAME' already exists"
else
    echo "✅ Tag '$TAG_NAME' would be created with message: '$TAG_MESSAGE'"
fi

# Test 7: Check if remote exists
echo ""
echo "📋 Test 7: Remote repository check"
if git remote | grep -q "origin"; then
    echo "✅ Remote 'origin' exists"
    REMOTE_URL=$(git remote get-url origin)
    echo "   URL: $REMOTE_URL"
else
    echo "⚠️  No remote 'origin' found"
fi

echo ""
echo "🎉 Git checks and tagging test completed!"
echo ""
echo "📊 Summary:"
echo "   Current branch: $CURRENT_BRANCH"
echo "   Build version: $BUILD_VERSION"
echo "   Build ID: $BUILD_ID"
echo "   Would create tag: v$BUILD_VERSION"
