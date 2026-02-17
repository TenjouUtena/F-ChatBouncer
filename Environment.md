# Backend environment variables

Environment variables used by **FChatBouncer.Server**. All can be overridden in `appsettings.json` or environment; env wins at runtime.

---

## Required (production)

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT__SecretKey` | Secret key for signing JWTs. Must be set or auth fails at startup. | Base64 or long hex string (e.g. 64+ chars) |
| `CREDENTIAL_ENCRYPTION_KEY` | Key for encrypting stored F-Chat credentials and tickets. | Opaque string (e.g. 32+ chars) |

---

## Database (PostgreSQL)

One of: full URL, connection string in config, or individual vars.

| Variable | Description | Default / fallback |
|----------|-------------|--------------------|
| `DATABASE_URL` | Full PostgreSQL URL (takes precedence). | — |
| `ConnectionStrings__DefaultConnection` | Connection string (config/env). | — |
| `PGHOST` | Host. | `localhost` |
| `PGPORT` | Port. | `5432` |
| `PGDATABASE` | Database name. | `fchat_bouncer` |
| `PGUSER` | Username. | `postgres` |
| `PGPASSWORD` | Password. | `password` |

- **Example URL:** `postgresql://user:pass@host:5432/fchat_bouncer` (or `postgres://`).

---

## Redis

One of: URL, full connection string, or host/port/password.

| Variable | Description | Notes |
|----------|-------------|--------|
| `REDIS_URL` | Full Redis URL. | e.g. Railway |
| `UPSTASH_REDIS_URL` | Alternative Redis URL. | e.g. Upstash |
| `REDIS_CONNECTION_STRING` | Host:port[,password=...]. | Overrides URL if set |
| `REDIS_HOST` | Redis host. | With `REDIS_PORT` / `REDIS_PASSWORD` |
| `REDIS_PORT` | Redis port. | Default `6379` when using `REDIS_HOST` |
| `REDIS_PASSWORD` | Redis password. | Optional |
| `REDIS_DATABASE` or `REDIS_DB` | Redis database index. | Numeric |
| `REDIS_INSTANCE_NAME` | Key prefix. | e.g. `FChatBouncer:` |
| `REDIS_USE_SSL` | Use TLS. | `true` / `false` |

---

## Authentication & JWT

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT__SecretKey` | JWT signing key (required). | — |
| `JWT__Issuer` | JWT issuer claim. | `F-ChatBouncer` |
| `JWT__Audience` | JWT audience claim. | `F-ChatBouncer-Users` |
| `JWT__ExpirationInMinutes` | Token lifetime in minutes. | `60` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID. | — (Google login disabled if unset) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. | — |

---

## Encryption

| Variable | Description | Fallback |
|----------|-------------|----------|
| `ENCRYPTION_KEY` | 256-bit key for general encryption (e.g. credential encryption). Base64 or hex. | `Security:EncryptionKey` in config; if both missing, a temporary key is generated (dev only, not for production) |

---

## CORS

| Variable | Description | Notes |
|----------|-------------|--------|
| `CORS__AllowedOrigins__0` | First allowed frontend origin. | e.g. `https://your-app.vercel.app` |
| `CORS__AllowedOrigins__1` | Second origin (if used). | Add more indices as needed |

In production, if no `CORS__AllowedOrigins__*` is set, the app uses `Cors:AllowedOrigins` from config (e.g. `appsettings.json`).

---

## Frontend redirect (OAuth)

When the frontend is on a different host (e.g. Vercel), OAuth success/error redirects must point to that host.

| Variable | Description | Example |
|----------|-------------|---------|
| `FRONTEND_BASE_URL` | Base URL of the frontend (no trailing slash). | `https://your-app.vercel.app` |

Can also be set as `Frontend:BaseUrl` in config. If empty, redirects are relative (same host as API).

---

## ASP.NET Core (optional)

| Variable | Description | Example |
|----------|-------------|---------|
| `ASPNETCORE_ENVIRONMENT` | Environment name. | `Development`, `Production`, `Staging` |
| `ASPNETCORE_URLS` | Listen URLs. | `http://localhost:5001` |

---

## Summary checklist (production)

- [ ] `JWT__SecretKey`
- [ ] `CREDENTIAL_ENCRYPTION_KEY`
- [ ] `ENCRYPTION_KEY` (or set `Security:EncryptionKey` in config)
- [ ] Database: `DATABASE_URL` or `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` (or `ConnectionStrings__DefaultConnection`)
- [ ] Redis: `REDIS_URL` or `REDIS_CONNECTION_STRING` or `REDIS_HOST` (+ optional `REDIS_PORT`/`REDIS_PASSWORD`)
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (if using Google login)
- [ ] `CORS__AllowedOrigins__0` (and __1, …) or configure `Cors:AllowedOrigins` in config
- [ ] `FRONTEND_BASE_URL` (if frontend is on a different host, e.g. Vercel)
