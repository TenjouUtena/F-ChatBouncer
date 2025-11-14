#!/bin/bash

# Development Environment Variables Setup Script for FChatBouncer.Server
# This script sets all required environment variables to development defaults

echo "Setting up development environment variables for FChatBouncer.Server..."

# Redis Configuration (used for local development and Railway-style overrides)
export REDIS_CONNECTION_STRING="localhost:6379"
export REDIS_INSTANCE_NAME="FChatBouncer:Dev:"
export REDIS_USE_SSL="false"

# Database Configuration (PostgreSQL)
export PGHOST="localhost"
export PGPORT="5432"
export PGDATABASE="fchat_bouncer"
export PGUSER="postgres"
export PGPASSWORD="password"

# Alternative: Use a full connection string
# export DATABASE_URL="postgresql://postgres:password@localhost:5432/fchat_bouncer"

# JWT Configuration
export JWT__SecretKey="ca74596c3dd7b5bcd446993db916fdc4a275474a54a03a3858ac6dfe7adb180e"
export JWT__Issuer="F-ChatBouncer"
export JWT__Audience="F-ChatBouncer-Users"

# Google OAuth Configuration (set to gibberish as requested)
export GOOGLE_CLIENT_ID="dev-client-id-gibberish-12345"
export GOOGLE_CLIENT_SECRET="dev-client-secret-gibberish-67890"

# CORS Configuration (for production-like testing)
export CORS__AllowedOrigins__0="http://localhost:3000"

# Additional Development Settings
export ASPNETCORE_ENVIRONMENT="Development"
export ASPNETCORE_URLS="http://localhost:5001"

# Optional: Credential encryption key (if used elsewhere in the app)
export CREDENTIAL_ENCRYPTION_KEY="b736923bcf38dgfe0230dfe7239vcde3902"

# Optional: Ticket expiration
export TICKET_EXPIRATION_MINUTES="60"

echo "Environment variables set successfully!"
echo ""
echo "Database: $PGHOST:$PGPORT/$PGDATABASE (user: $PGUSER)"
echo "JWT Issuer: $JWT__Issuer"
echo "Google OAuth: $GOOGLE_CLIENT_ID (gibberish values)"
echo "Environment: $ASPNETCORE_ENVIRONMENT"
echo "Server URL: $ASPNETCORE_URLS"
echo ""
echo "To run the application:"
echo "  dotnet run"
echo ""
echo "To make these variables persistent in your current shell session:"
echo "  source ./set-dev-env.sh"
echo ""
echo "Note: Google OAuth is disabled with gibberish values as requested."
