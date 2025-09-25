# Railway Database Migration Guide

## Automatic Migration (Recommended)

The application now automatically runs database migrations on startup. When you deploy to Railway, it will:

1. Connect to the PostgreSQL database
2. Create all necessary tables
3. Apply any pending migrations
4. Start the application

## Manual Migration (If Needed)

If you need to run migrations manually, you have several options:

### Option 1: Using Railway CLI

```bash
# Install Railway CLI (if not already installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Navigate to your project directory
cd /path/to/your/project

# Run migrations
railway shell --command "cd src/FChatBouncer.Server && dotnet ef database update"
```

### Option 2: Using the Migration Script

```bash
# Run the migration helper script
./railway-migrate.sh
```

### Option 3: Connect to Database Directly

```bash
# Connect to PostgreSQL shell
railway connect postgresql

# Then run SQL commands manually if needed
```

## Migration Commands Reference

### Check Migration Status
```bash
railway shell --command "cd src/FChatBouncer.Server && dotnet ef migrations list"
```

### Create New Migration
```bash
railway shell --command "cd src/FChatBouncer.Server && dotnet ef migrations add MigrationName"
```

### Update Database
```bash
railway shell --command "cd src/FChatBouncer.Server && dotnet ef database update"
```

### Reset Database (DANGER - Deletes all data)
```bash
railway shell --command "cd src/FChatBouncer.Server && dotnet ef database drop --force"
railway shell --command "cd src/FChatBouncer.Server && dotnet ef database update"
```

## Troubleshooting

### Common Issues

1. **"No migrations found"**
   - Make sure you're in the correct directory (`src/FChatBouncer.Server`)
   - Check that migrations exist in the `Migrations` folder

2. **"Database connection failed"**
   - Verify `DATABASE_URL` is set in Railway
   - Check that PostgreSQL service is running
   - Ensure services are connected in Railway dashboard

3. **"Migration already applied"**
   - This is normal - migrations are idempotent
   - Check migration status with `dotnet ef migrations list`

### Verification

After running migrations, you can verify they worked by:

1. **Check Railway logs** - Look for "Database migration completed successfully"
2. **Connect to database** - `railway connect postgresql`
3. **List tables** - `\dt` in PostgreSQL shell
4. **Test application** - Try creating a user or accessing protected endpoints

## Environment Variables

Make sure these are set in Railway:

```bash
DATABASE_URL=postgresql://postgres:password@host:port/database
JWT__SecretKey=your-jwt-secret
JWT__Issuer=F-ChatBouncer
JWT__Audience=F-ChatBouncer-Users
JWT__ExpirationInMinutes=60
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
CREDENTIAL_ENCRYPTION_KEY=your-encryption-key
DATA_PROTECTION_KEY=your-data-protection-key
```

## Success Indicators

✅ **Application starts without database errors**  
✅ **Logs show "Database migration completed successfully"**  
✅ **Can create users and authenticate**  
✅ **Database tables exist in PostgreSQL**  

Your F-ChatBouncer application should now have a properly migrated database on Railway!
