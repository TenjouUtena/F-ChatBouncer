# Railway Deployment Guide for F-ChatBouncer

## Quick Start for Railway

### 1. Build and Push AMD64 Images
```bash
# Run the Railway build script
./build-railway.sh
```

### 2. Railway Setup Steps

#### Create Railway Project
1. Go to [Railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from Docker Hub"

#### Add Backend Service
1. Click "Add Service" → "Docker Hub"
2. Use image: `your-username/fchat-bouncer-backend:latest`
3. Railway will automatically detect it's a web service

#### Add Frontend Service
1. Click "Add Service" → "Docker Hub" 
2. Use image: `your-username/fchat-bouncer-frontend:latest`
3. Railway will automatically detect it's a web service

#### Add PostgreSQL Database
1. Click "Add Service" → "Database" → "PostgreSQL"
2. Railway will automatically provide connection variables

### 3. Environment Variables

Set these environment variables in Railway dashboard:

#### Backend Environment Variables
```bash
# Database (Railway provides these automatically)
DATABASE_URL=postgresql://...
DATABASE_PUBLIC_URL=postgresql://...
PGHOST=...
PGPORT=5432
PGDATABASE=...
PGUSER=...
PGPASSWORD=...

# JWT Configuration
JWT__SecretKey=your-super-secret-jwt-key-here
JWT__Issuer=F-ChatBouncer
JWT__Audience=F-ChatBouncer-Users
JWT__ExpirationInMinutes=60

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Security
CREDENTIAL_ENCRYPTION_KEY=your-server-encryption-key
TICKET_EXPIRATION_MINUTES=60
DATA_PROTECTION_KEY=your-data-protection-key

# CORS (update with your Railway domain)
CORS__AllowedOrigins__0=https://your-app-name.up.railway.app

# ASP.NET Core
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://0.0.0.0:$PORT
```

#### Frontend Environment Variables
```bash
# API URL (update with your Railway backend domain)
NEXT_PUBLIC_API_URL=https://your-backend-service.up.railway.app

# NextAuth
NEXTAUTH_URL=https://your-frontend-service.up.railway.app
NEXTAUTH_SECRET=your-nextauth-secret
```

### 4. Railway-Specific Configuration

#### Port Configuration
Railway automatically sets the `PORT` environment variable. Your backend should use:
```bash
ASPNETCORE_URLS=http://0.0.0.0:$PORT
```

#### Domain Configuration
Railway provides domains like:
- Backend: `your-backend-service.up.railway.app`
- Frontend: `your-frontend-service.up.railway.app`

Update your environment variables with these domains.

### 5. Database Migration

After deployment, run database migrations:
```bash
# Connect to Railway shell
railway shell

# Navigate to backend directory
cd src/FChatBouncer.Server

# Run migrations
dotnet ef database update
```

### 6. Google OAuth Setup

Update your Google OAuth settings:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to APIs & Services → Credentials
3. Edit your OAuth 2.0 Client ID
4. Add authorized redirect URIs:
   - `https://your-frontend-service.up.railway.app/api/auth/callback/google`
5. Add authorized JavaScript origins:
   - `https://your-frontend-service.up.railway.app`

### 7. Custom Domain (Optional)

To use a custom domain:
1. In Railway dashboard, go to your service
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Update DNS records as instructed
5. Update environment variables with your custom domain

### 8. Monitoring and Logs

#### View Logs
```bash
# View service logs
railway logs

# Follow logs in real-time
railway logs --follow
```

#### Check Service Status
```bash
# Check deployment status
railway status

# View service details
railway service
```

### 9. Troubleshooting

#### Common Issues

**Build Failures**
- Ensure Docker images are built for AMD64
- Check that all dependencies are included in Dockerfile
- Verify environment variables are set correctly

**Database Connection Issues**
- Check that PostgreSQL service is running
- Verify DATABASE_URL is set correctly
- Run database migrations

**CORS Issues**
- Update CORS__AllowedOrigins__0 with correct frontend domain
- Check that frontend and backend domains are correct

**Google OAuth Issues**
- Verify redirect URIs in Google Console
- Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- Ensure domains match exactly

### 10. Deployment Commands

```bash
# Build and push images
./build-railway.sh

# Deploy to Railway
railway up

# Check status
railway status

# View logs
railway logs

# Connect to database
railway connect postgresql
```

### 11. Environment Variable Generation

Generate secure keys:
```bash
# JWT Secret Key
openssl rand -base64 32

# Encryption Key
openssl rand -base64 32

# NextAuth Secret
openssl rand -base64 32
```

### 12. Success Checklist

- [ ] Docker images built and pushed to Docker Hub
- [ ] Railway project created with backend, frontend, and database services
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Google OAuth configured with correct domains
- [ ] Application accessible via Railway domains
- [ ] Custom domain configured (if desired)
- [ ] Monitoring and logging set up

Your F-ChatBouncer application should now be running on Railway!
