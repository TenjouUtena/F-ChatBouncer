# F-Chat Bouncer Architecture

## Overview

The F-Chat Bouncer is a multi-user system that maintains persistent connections to F-Chat servers while providing clients with real-time message delivery and historical log access. The system consists of a C# backend server and a Next.js/React frontend client.

## System Architecture

### High-Level Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js       │◄──►│   ASP.NET Core   │◄──►│   F-Chat        │
│   React Client  │    │   Backend        │    │   Servers       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │
         │                       ▼
         │              ┌──────────────────┐
         │              │   PostgreSQL     │
         │              │   Database       │
         │              └──────────────────┘
         │                       │
         └──────────────────────►▼
                        ┌──────────────────┐
                        │   In-Memory Cache │
                        │   & Pub/Sub      │
                        └──────────────────┘
```

## Technology Stack

### Backend (.NET 8+)
- **ASP.NET Core 8+** - Web API framework
- **SignalR** - Real-time WebSocket communication with clients
- **Entity Framework Core** - ORM with PostgreSQL provider
- **In-Memory Caching** - ASP.NET Core's built-in memory cache
- **System.ClientModel** - WebSocket client for F-Chat connections
- **ASP.NET Core Identity** - User authentication and management
- **Data Protection API** - Encryption for sensitive F-Chat credentials

### Database Layer
- **PostgreSQL** - Primary data store for users, messages, and configuration
- **In-Memory Cache** - Session management, real-time message distribution, rate limiting

### Frontend (Next.js 14+)
- **Next.js 14+** - React framework with App Router
- **TypeScript** - Type safety across the application
- **@microsoft/signalr** - SignalR client for real-time communication
- **Tailwind CSS** - Utility-first CSS framework
- **TanStack Query** - Server state management and caching
- **Zustand** - Client-side state management
- **React Hook Form** - Form handling and validation

## System Layers

### 1. F-Chat Gateway Layer
**Responsibilities:**
- Maintains persistent WebSocket connections to F-Chat servers (wss://chat.f-list.net/chat2)
- Handles F-Chat protocol compliance (rate limiting 1 req/sec, command formatting)
- Manages authentication with F-Chat using encrypted user credentials
- Processes and validates incoming/outgoing F-Chat messages
- Implements F-Chat bot guidelines and privacy requirements

**Key Classes:**
```csharp
public class FChatClient
public class FChatProtocolHandler
public class FChatMessageProcessor
```

### 2. Core Bouncer Server Layer
**Responsibilities:**
- Message routing between F-Chat and connected clients
- User session management and authentication
- Multi-tenancy support with complete data isolation
- Message logging with privacy compliance
- Rate limiting and connection state management
- Real-time message broadcasting via SignalR

**Key Classes:**
```csharp
public class BouncerHub : Hub  // SignalR hub
public class MessageRouter
public class UserSessionManager
public class MultiTenantManager
```

### 3. Database Layer
**Schema Design:**
```sql
-- User management
users (id, username, email, password_hash, created_at, is_active)
user_settings (user_id, retention_days, auto_purge_enabled, fchat_credentials_encrypted)

-- Session management
user_sessions (id, user_id, fchat_session_id, status, connected_at, last_activity)

-- Message storage
messages (id, user_id, channel_name, message_type, sender, content, timestamp, fchat_message_id)
channels (id, user_id, fchat_channel_name, display_name, subscribed, joined_at)

-- Log management
log_retention_policies (user_id, retention_days, auto_purge_enabled, last_purge)
```

**Indexes:**
- `(user_id, channel_name, timestamp)` - Channel log retrieval
- `(user_id, timestamp)` - User's recent messages
- `(timestamp)` - Automated log purging

### 4. Client API Layer
**SignalR Hub Methods:**
```csharp
// Client to Server
public async Task AuthenticateAsync(string token)
public async Task SubscribeToChannelsAsync(string[] channels)
public async Task SendMessageAsync(string channel, string content)
public async Task RequestHistoryAsync(string channel, DateTime since, int limit)

// Server to Client
public async Task ReceiveMessage(MessageDto message)
public async Task ReceiveHistory(HistoryDto history)
public async Task NotifyConnectionStatus(ConnectionStatusDto status)
```

**REST API Endpoints:**
```csharp
POST /api/auth/login          // Bouncer authentication
POST /api/auth/register       // User registration
GET  /api/logs/export         // Export user logs
DELETE /api/logs/purge        // Purge logs by criteria
GET  /api/user/status         // Connection and session status
PUT  /api/user/settings       // Log retention and F-Chat credentials
GET  /api/channels            // User's subscribed channels
POST /api/channels/subscribe  // Subscribe to new channel
```

### 5. Client Application Layer
**Next.js App Structure:**
```
src/
├── app/                    # App Router pages
│   ├── auth/              # Authentication pages
│   ├── chat/              # Main chat interface
│   ├── settings/          # User settings
│   └── logs/              # Log management
├── components/            # Reusable React components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and configurations
│   ├── signalr.ts        # SignalR connection management
│   ├── auth.ts           # Authentication helpers
│   └── api.ts            # API client functions
├── stores/               # Zustand state stores
└── types/                # TypeScript type definitions
```

## Security & Privacy

### F-Chat Protocol Compliance
- **No unauthorized logging** - Only log messages for authenticated users with explicit consent
- **Rate limiting** - Respect F-Chat's 1 request/second, <300 requests/hour limits
- **User consent** - Implement user-controlled logging preferences
- **Privacy protection** - Secure storage and user-controlled purging of logs

### Authentication & Authorization
- **Multi-layered auth** - Separate bouncer authentication from F-Chat credentials
- **Encrypted storage** - F-Chat credentials encrypted using ASP.NET Data Protection API
- **JWT tokens** - Stateless authentication for API and SignalR connections
- **Session management** - In-memory sessions with configurable expiration

### Data Isolation
- **Tenant separation** - Complete data isolation by user_id across all tables
- **Connection isolation** - Separate F-Chat connections per user
- **Resource isolation** - Per-user rate limiting and connection management

## Real-Time Communication Flow

### Message Flow: F-Chat → Clients
```
F-Chat Server → FChatClient → MessageProcessor → Database → SignalR Hub → React Client
```

### Message Flow: Client → F-Chat
```
React Client → SignalR Hub → MessageRouter → FChatClient → F-Chat Server
```

### Historical Log Sync
1. Client connects and authenticates via SignalR
2. Server queries last 24 hours: `WHERE user_id = ? AND timestamp > NOW() - INTERVAL 1 DAY`
3. Messages sent to client in chronological order
4. Client updates UI with historical context

## Deployment Architecture

### Production Setup
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js       │    │   ASP.NET Core   │    │   PostgreSQL    │
│   (Vercel/      │◄──►│   (Docker        │◄──►│   (Managed      │
│   Static Host)  │    │   Container)     │    │   Instance)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   In-Memory      │
                       │   (Managed       │
                       │   Instance)      │
                       └──────────────────┘
```

### Development Setup
- **Backend**: `dotnet run` with local PostgreSQL
- **Frontend**: `npm run dev` connecting to local backend
- **Database**: Docker Compose for PostgreSQL

## Scalability Considerations

### Horizontal Scaling
- **Stateless backend** - Multiple ASP.NET Core instances behind load balancer
- **SignalR scale-out** - Built-in scaling for multiple server instances
- **Database connection pooling** - Entity Framework connection management

### Performance Optimizations
- **Message batching** - Bulk insert for high-volume channels
- **Connection pooling** - Reuse F-Chat connections where possible
- **Caching strategy** - In-memory caching for frequently accessed data
- **Database indexing** - Optimized queries for log retrieval

## Monetization Architecture

### Freemium Model Support
- **Tier-based features** - Database flags for user subscription levels
- **Storage quotas** - Configurable retention periods per user tier
- **Rate limiting** - Different limits based on subscription level
- **Feature flags** - Toggle advanced features (search, export, analytics)

### Billing Integration Ready
- **Subscription tracking** - User subscription state in database
- **Usage metrics** - Message count, storage usage tracking
- **Webhook endpoints** - Ready for payment processor integration

## Development Phases

### Phase 1: Core Functionality
1. Basic F-Chat connection and message relay
2. User authentication and session management
3. Simple message logging and 24-hour sync
4. Basic Next.js chat interface

### Phase 2: Enhanced Features
1. Advanced log management (search, export, purging)
2. Channel subscription management
3. User settings and preferences
4. Improved UI/UX

### Phase 3: Production & Monetization
1. Multi-tenancy hardening and security audit
2. Performance optimization and scalability testing
3. Billing integration and subscription tiers
4. Advanced analytics and monitoring

## File Structure

### Backend Project Structure
```
FChatBouncer.Server/
├── Controllers/           # REST API controllers
├── Hubs/                 # SignalR hubs
├── Services/             # Business logic services
│   ├── FChatService.cs   # F-Chat connection management
│   ├── MessageService.cs # Message processing and storage
│   └── UserService.cs    # User management
├── Models/               # Entity Framework models
├── Data/                 # Database context and migrations
├── Configuration/        # App configuration and DI setup
└── Program.cs           # Application entry point
```

### Frontend Project Structure
```
fchat-bouncer-client/
├── src/
│   ├── app/             # Next.js App Router pages
│   ├── components/      # React components
│   │   ├── Chat/       # Chat-related components
│   │   ├── Auth/       # Authentication components
│   │   └── Settings/   # Settings components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utilities and API clients
│   ├── stores/         # Zustand state management
│   └── types/          # TypeScript definitions
├── public/             # Static assets
└── package.json        # Dependencies and scripts
```

This architecture provides a solid foundation for building a maintainable, scalable F-Chat bouncer system that respects the protocol requirements while enabling future monetization opportunities.