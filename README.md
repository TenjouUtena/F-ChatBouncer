# F-Chat Bouncer

A modern bouncer system for F-Chat that provides persistent connections, message logging, and multi-user support.

## Architecture

- **Backend**: ASP.NET Core 8 with SignalR for real-time communication
- **Frontend**: Next.js 14 with TypeScript and Tailwind CSS
- **Database**: PostgreSQL for data storage
- **Cache**: In-memory caching for session management and real-time messaging

## Prerequisites

- .NET 8 SDK
- Node.js 18+
- Docker and Docker Compose (for databases)

## Quick Start

### 1. Start Database Services

```bash
docker-compose up -d
```

### 2. Run Backend

```bash
cd src/FChatBouncer.Server
dotnet restore
dotnet run
```

Backend will be available at `http://localhost:5000`

### 3. Run Frontend

```bash
cd src/fchat-bouncer-client
npm install
npm run dev
```

Frontend will be available at `http://localhost:3000`

## Development

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design and implementation details.

## Project Structure

```
├── src/
│   ├── FChatBouncer.Server/     # ASP.NET Core backend
│   └── fchat-bouncer-client/    # Next.js frontend
├── ARCHITECTURE.md              # System architecture documentation
├── docker-compose.yml           # Development databases
└── README.md                    # This file
```