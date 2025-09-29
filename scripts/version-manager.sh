#!/bin/bash

# Version Manager Script for F-ChatBouncer
# This script manages versioning and build IDs for deployments

set -e

# Configuration
VERSION_FILE="src/fchat-bouncer-client/package.json"
CSPROJ_FILE="src/FChatBouncer.Server/FChatBouncer.Server.csproj"
BUILD_INFO_FILE="build-info.json"

# Function to get current version from package.json
get_current_version() {
    if [ -f "$VERSION_FILE" ]; then
        grep '"version"' "$VERSION_FILE" | sed 's/.*"version": *"\([^"]*\)".*/\1/'
    else
        echo "0.1.0"
    fi
}

# Function to increment version
increment_version() {
    local version=$1
    local increment_type=${2:-"patch"}  # patch, minor, major
    
    # Remove any alpha/beta/rc suffix for incrementing
    local base_version=$(echo "$version" | sed 's/[a-zA-Z].*$//')
    
    # Split version into parts
    IFS='.' read -ra VERSION_PARTS <<< "$base_version"
    local major=${VERSION_PARTS[0]:-0}
    local minor=${VERSION_PARTS[1]:-0}
    local patch=${VERSION_PARTS[2]:-0}
    
    # Increment based on type
    case $increment_type in
        "major")
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        "minor")
            minor=$((minor + 1))
            patch=0
            ;;
        "patch"|*)
            patch=$((patch + 1))
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Function to get git hash
get_git_hash() {
    git rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

# Function to get git branch
get_git_branch() {
    git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

# Function to update package.json version
update_package_version() {
    local new_version=$1
    local temp_file=$(mktemp)
    
    # Use jq if available, otherwise use sed
    if command -v jq >/dev/null 2>&1; then
        jq --arg version "$new_version" '.version = $version' "$VERSION_FILE" > "$temp_file"
        mv "$temp_file" "$VERSION_FILE"
    else
        sed "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" "$VERSION_FILE" > "$temp_file"
        mv "$temp_file" "$VERSION_FILE"
    fi
}

# Function to update .csproj version
update_csproj_version() {
    local new_version=$1
    local temp_file=$(mktemp)
    
    # Add or update Version property in .csproj
    if grep -q "<Version>" "$CSPROJ_FILE"; then
        sed "s/<Version>[^<]*<\/Version>/<Version>$new_version<\/Version>/" "$CSPROJ_FILE" > "$temp_file"
    else
        # Add Version property after TargetFramework
        sed "/<TargetFramework>/a\\    <Version>$new_version</Version>" "$CSPROJ_FILE" > "$temp_file"
    fi
    mv "$temp_file" "$CSPROJ_FILE"
}

# Function to create build info
create_build_info() {
    local version=$1
    local git_hash=$2
    local git_branch=$3
    local build_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local docker_tag="$version-$git_hash"
    
    cat > "$BUILD_INFO_FILE" << EOF
{
  "version": "$version",
  "buildId": "$git_hash",
  "branch": "$git_branch",
  "buildDate": "$build_date",
  "fullVersion": "$version+$git_hash",
  "dockerTag": "$docker_tag"
}
EOF
}

# Main execution
main() {
    local increment_type=${1:-"patch"}
    local current_version=$(get_current_version)
    local git_hash=$(get_git_hash)
    local git_branch=$(get_git_branch)
    
    echo "🔄 Current version: $current_version"
    echo "🌿 Git branch: $git_branch"
    echo "🔗 Git hash: $git_hash"
    
    # Increment version
    local new_version=$(increment_version "$current_version" "$increment_type")
    echo "📈 New version: $new_version"
    
    # Update version files
    echo "📝 Updating package.json..."
    update_package_version "$new_version"
    
    echo "📝 Updating .csproj..."
    update_csproj_version "$new_version"
    
    # Create build info
    echo "📋 Creating build info..."
    create_build_info "$new_version" "$git_hash" "$git_branch"
    
    echo ""
    echo "✅ Version management complete!"
    echo "   Version: $new_version"
    echo "   Build ID: $git_hash"
    echo "   Full Version: $new_version+$git_hash"
    echo ""
    echo "📄 Build info saved to: $BUILD_INFO_FILE"
    
    # Export variables for use in other scripts
    export BUILD_VERSION="$new_version"
    export BUILD_ID="$git_hash"
    export FULL_VERSION="$new_version+$git_hash"
    export DOCKER_TAG="$new_version-$git_hash"
    export GIT_BRANCH="$git_branch"
}

# Run main function with all arguments
main "$@"
