# F-Chat Bouncer

A bouncer for [F-Chat](https://www.f-list.net/chat3/): the server holds your characters' F-Chat connections open while you are away, and a web client connects to it to read and send messages.

## How it fits together

| Piece | Path | What it does |
|---|---|---|
| Backend | `src/FChatBouncer.Server` | ASP.NET Core 9. Holds the F-Chat websockets, fetches F-List profiles, stores users, characters and messages in PostgreSQL, queues messages in Redis streams, and talks to browsers over SignalR. |
| Frontend | `src/fchat-bouncer-client` | Next.js 14. Login, chat UI, profile viewer. Caches characters, profiles and messages in the browser's IndexedDB. |

The backend runs as **exactly one instance**. F-Chat connections, the F-List ticket cache and the profile fetch queue all live in that process.

Character profiles are fetched from F-List only when someone opens a profile, one at a time, and cached in `Characters.ProfileJson`. Name colours come from the gender and status that F-Chat already broadcasts (LIS/NLN/STA/FLN), which the backend pushes to the browser as `CharacterInfo`.

## Local development

Prerequisites: .NET 9 SDK, Node.js 18+, and either Docker or a local PostgreSQL and Redis.

```bash
# 1. Postgres and Redis
docker compose up -d

# 2. Backend (http://localhost:5001). Creates the schema on first start.
cd src/FChatBouncer.Server
source ./set-dev-env.sh
dotnet run

# 3. Frontend (http://localhost:3000)
cd src/fchat-bouncer-client
npm install
npm run dev
```

`set-dev-env.sh` contains a fixed development `ENCRYPTION_KEY`. Changing it makes every stored F-Chat credential unreadable.

### Schema changes

There is a single EF Core migration, `Initial`. When the model changes, regenerate it rather than adding a second one:

```bash
cd src/FChatBouncer.Server
rm -rf Migrations
dotnet ef migrations add Initial
dotnet ef database drop --force
dotnet run
```

## Deployment

- Backend: Railway, built from `src/FChatBouncer.Server/Dockerfile`, with Railway Postgres and Redis. One replica.
- Frontend: Vercel, root directory `src/fchat-bouncer-client`, with `NEXT_PUBLIC_API_URL` set to the backend URL.

Environment variables are listed in [Environment.md](./Environment.md). The full rebuild procedure is Phase 6 of [v2 Implementation Plan.md](./v2%20Implementation%20Plan.md).
