#!/bin/bash

# Test script for version management system

set -e

echo "🧪 Testing version management system..."

# Test the version manager script
echo "📋 Testing version manager..."
source ./scripts/version-manager.sh patch

echo ""
echo "✅ Version management test completed!"
echo "   Current version: $BUILD_VERSION"
echo "   Build ID: $BUILD_ID"
echo "   Full version: $FULL_VERSION"

# Check if build-info.json was created
if [ -f "build-info.json" ]; then
    echo ""
    echo "📄 Build info file created:"
    cat build-info.json | jq '.' 2>/dev/null || cat build-info.json
else
    echo "❌ Build info file not found"
fi

# Check if package.json was updated
echo ""
echo "📦 Package.json version:"
grep '"version"' src/fchat-bouncer-client/package.json

# Check if .csproj was updated
echo ""
echo "🔧 .csproj version:"
grep '<Version>' src/FChatBouncer.Server/FChatBouncer.Server.csproj || echo "Version property not found"

echo ""
echo "🎉 Version management test completed successfully!"
