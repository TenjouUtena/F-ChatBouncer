# Environment variables

## Backend (Railway)

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (a `postgresql://` URI; converted to an Npgsql connection string at startup) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}`. Required outside Development. |
| `JWT__SecretKey` | `openssl rand -hex 48`. Required. |
| `JWT__Issuer` | `F-ChatBouncer` |
| `JWT__Audience` | `F-ChatBouncer-Users` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (exactly 32 bytes when decoded). Required. **Back this up.** Losing or changing it makes every stored F-Chat credential unreadable. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From Google Cloud Console. Google login is disabled if either is missing. |
| `CORS__AllowedOrigins__0` | The frontend origin, e.g. `https://fchat.proactiveapathy.com`. Add `__1`, `__2`, ... for more. |
| `FRONTEND_BASE_URL` | Same value as the frontend origin. OAuth redirects land here. |
| `ASPNETCORE_ENVIRONMENT` | `Production` |

Optional:

| Variable | Default |
|---|---|
| `ProfileStaleAfter` | `1.00:00:00` (24 hours). Cached profiles older than this are refreshed in the background when viewed. |

The server refuses to start without `JWT__SecretKey`, `ENCRYPTION_KEY`, or (outside Development) `REDIS_URL`.

## Frontend (Vercel)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | The backend URL, e.g. `https://api.fchat.proactiveapathy.com` |

## Local development

`src/FChatBouncer.Server/set-dev-env.sh` sets everything needed against the `docker-compose.yml` services. Locally the backend also accepts `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` and `REDIS_CONNECTION_STRING`/`REDIS_HOST`, but production uses only `DATABASE_URL` and `REDIS_URL`.
