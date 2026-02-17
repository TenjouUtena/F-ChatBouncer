# Deploying the frontend to Vercel

## Frontend (Vercel)

1. **Root directory:** Set the Vercel project root to `src/fchat-bouncer-client`.
2. **Environment variables:** In Vercel project settings, add:
   - `NEXT_PUBLIC_API_URL` = your backend base URL (e.g. `https://api.fchat.proactiveapathy.com`).
3. **Build:** Default `next build` is used. Standalone output is only built when `BUILD_STANDALONE=true` (used by the Docker build).

## Backend (after frontend is on Vercel)

1. **CORS:** Add your Vercel frontend origin so the API and SignalR accept requests.
   - In `appsettings.json`: add your URL to `Cors:AllowedOrigins`, e.g. `"https://your-app.vercel.app"`.
   - Or via environment (e.g. on Railway): set `CORS__AllowedOrigins__0` to your current frontend URL; use `CORS__AllowedOrigins__1` for a second origin (e.g. preview) if needed.
2. **OAuth redirects:** Set the frontend base URL so Google OAuth redirects land on the Vercel app.
   - In `appsettings.json`: set `Frontend:BaseUrl` to your frontend URL, e.g. `"https://your-app.vercel.app"` (no trailing slash).
   - Or set environment variable: `FRONTEND_BASE_URL=https://your-app.vercel.app`.
   - Leave empty if the frontend is served from the same host as the API (relative redirects).

## Google OAuth

- The callback URL stays your backend (e.g. `https://api.fchat.proactiveapathy.com/api/auth/google-callback`). No change in Google Cloud Console unless you change the backend URL.
