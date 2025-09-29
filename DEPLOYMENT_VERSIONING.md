# Deployment Versioning Guide

This guide explains how to use the new versioning system for Railway deployments.

## Overview

The deployment system now automatically:
- **Git Repository Checks**: Ensures clean working tree and up-to-date branch
- **Version Management**: Increments version numbers (patch, minor, or major)
- **Build ID Generation**: Uses git commit hashes for unique build identification
- **Docker Image Tagging**: Creates versioned Docker images
- **Git Tagging**: Creates release tags in the repository
- **Version Embedding**: Embeds version information in both frontend and backend

## Version Format

- **Base Version**: `0.1.2` (semantic versioning)
- **Build ID**: `a094048` (short git hash)
- **Full Version**: `0.1.2+a094048` (used for Docker tags)

## Git Repository Requirements

Before deployment, the script automatically checks:

### ✅ Required Conditions
- **Clean Working Tree**: No uncommitted changes
- **Valid Branch**: Not in detached HEAD state
- **Remote Sync**: Local branch is up to date with remote (if remote exists)

### ❌ Common Issues
- **Uncommitted Changes**: Commit or stash your changes first
- **Detached HEAD**: Checkout a proper branch
- **Outdated Branch**: Pull the latest changes from remote

## Usage

### Basic Deployment (Patch Version)
```bash
./build-railway.sh
```
This will increment the patch version (0.1.1 → 0.1.2)

### Minor Version Increment
```bash
VERSION_INCREMENT=minor ./build-railway.sh
```
This will increment the minor version (0.1.1 → 0.2.0)

### Major Version Increment
```bash
VERSION_INCREMENT=major ./build-railway.sh
```
This will increment the major version (0.1.1 → 1.0.0)

## What Gets Updated

### 1. Version Files
- `src/fchat-bouncer-client/package.json` - Frontend version
- `src/FChatBouncer.Server/FChatBouncer.Server.csproj` - Backend version

### 2. Build Information
- `build-info.json` - Contains version, build ID, branch, and build date
- Embedded in Docker images as environment variables

### 3. Git Tags
- **Tag Format**: `v0.1.2` (version with 'v' prefix)
- **Tag Message**: `Release 0.1.2 (Build: a094048)`
- **Automatic Push**: Tags are pushed to remote repository if available

### 4. Docker Images
- **Backend**: `brendanspeer/fchat-bouncer-backend:0.1.2+a094048`
- **Frontend**: `brendanspeer/fchat-bouncer-frontend:0.1.2+a094048`

## Version Information in Applications

### Frontend
Version information is available as environment variables:
- `BUILD_VERSION`: The semantic version (e.g., "0.1.2")
- `BUILD_ID`: The git commit hash (e.g., "a094048")
- `GIT_BRANCH`: The git branch (e.g., "main")

### Backend
Version information is embedded in the .NET assembly:
- Assembly version
- File version
- Informational version

## Testing

Test the versioning system:
```bash
./scripts/test-versioning.sh
```

Test git checks and tagging:
```bash
./scripts/test-git-checks.sh
```

## Manual Version Management

If you need to manually manage versions:
```bash
# Increment patch version
./scripts/version-manager.sh patch

# Increment minor version
./scripts/version-manager.sh minor

# Increment major version
./scripts/version-manager.sh major
```

## Railway Deployment

After running the build script:
1. Images are automatically pushed to Docker Hub
2. Railway services are automatically redeployed
3. New version information is available in the deployed applications

## Troubleshooting

### Git Repository Issues
- **Not in git repository**: Run from project root with git initialized
- **Working tree not clean**: Commit or stash uncommitted changes
- **Detached HEAD**: Checkout a proper branch
- **Branch not up to date**: Pull latest changes from remote

### Version Not Updating
- Ensure you're in a git repository
- Check that the version files exist and are writable
- Verify the version manager script has execute permissions

### Docker Build Issues
- Ensure Docker is running
- Check that you have push permissions to Docker Hub
- Verify Railway CLI is installed and configured

### Git Hash Issues
- Ensure you're in a git repository with commits
- Check that git is available in your PATH
