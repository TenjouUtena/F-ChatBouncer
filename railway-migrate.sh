#!/bin/bash

# Railway Database Migration Script
# This script helps you run database migrations on Railway

set -e

echo "🚀 Railway Database Migration Helper"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed."
    echo "Please install it from: https://docs.railway.app/develop/cli"
    echo ""
    echo "Installation commands:"
    echo "npm install -g @railway/cli"
    echo "or"
    echo "curl -fsSL https://railway.app/install.sh | sh"
    exit 1
fi

echo "✅ Railway CLI found"
echo ""

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Please run: railway login"
    exit 1
fi

echo "✅ Logged in to Railway"
echo ""

# Show current project
echo "Current Railway project:"
railway status
echo ""

echo "📋 Migration Options:"
echo "1. Run migrations automatically (recommended)"
echo "2. Connect to database shell manually"
echo "3. Show database connection info"
echo ""

read -p "Choose an option (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🔄 Running database migrations..."
        echo ""
        
        # Run migrations using Railway shell
        railway shell --command "cd src/FChatBouncer.Server && dotnet ef database update"
        
        echo ""
        echo "✅ Migrations completed!"
        ;;
    2)
        echo ""
        echo "🔗 Connecting to PostgreSQL shell..."
        echo "You can run SQL commands directly here."
        echo "Type '\\q' to exit."
        echo ""
        
        railway connect postgresql
        ;;
    3)
        echo ""
        echo "📊 Database Connection Information:"
        echo ""
        
        # Show environment variables
        railway variables | grep -E "(DATABASE|PG)"
        
        echo ""
        echo "To connect manually:"
        echo "railway connect postgresql"
        ;;
    *)
        echo "❌ Invalid option. Please choose 1, 2, or 3."
        exit 1
        ;;
esac

echo ""
echo "🎉 Done!"
