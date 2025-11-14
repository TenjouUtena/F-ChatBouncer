# F-ChatBouncer Backend Architecture

## Table of Contents
1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Diagram](#architecture-diagram)
4. [Data Models](#data-models)
5. [Service Layer](#service-layer)
6. [Controllers](#controllers)
7. [Real-Time Communication](#real-time-communication)
8. [External Integrations](#external-integrations)
9. [Authentication & Security](#authentication--security)
10. [Background Processing](#background-processing)
11. [Key Workflows](#key-workflows)
12. [Issues & Recommendations](#issues--recommendations)

---

## Overview

F-ChatBouncer is a .NET Core WebSocket proxy service that acts as a persistent "bouncer" between users and the F-Chat/F-List roleplay chat platform. It maintains persistent WebSocket connections to F-Chat servers while allowing users to connect/disconnect from the web frontend without losing their F-Chat session.

**Core Purpose**: Enable users to remain "online" in F-Chat channels while not actively connected to the frontend, capturing messages and maintaining presence.

---

## Technology Stack

- **Framework**: ASP.NET Core 6.0+
- **Database**: PostgreSQL with Entity Framework Core
- **Authentication**: ASP.NET Core Identity + JWT + Google OAuth
- **Real-Time Communication**: SignalR (WebSocket)
- **External Communication**: WebSocket (F-Chat), HTTP/REST (F-List API)
- **Logging**: Serilog (File + Console)
- **Deployment**: Docker + Railway

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER (Next.js)                          │
│                    WebSocket (SignalR) + HTTP (REST)                    │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────────────┐
│                          ASP.NET CORE SERVER                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    PRESENTATION LAYER                            │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                  │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │  │
│  │  │ SignalR Hub    │  │ Controllers    │  │ Middleware       │  │  │
│  │  ├────────────────┤  ├────────────────┤  ├──────────────────┤  │  │
│  │  │ BouncerHub     │  │ AuthController │  │ JWT Auth         │  │  │
│  │  │                │  │ FChatCtrlr     │  │ CORS             │  │  │
│  │  │ • OnConnected  │  │ CharacterCtrlr │  │ Session          │  │  │
│  │  │ • SendMessage  │  │ UserController │  │ Cookie Policy    │  │  │
│  │  │ • JoinChannel  │  │ LogsController │  │ Exception        │  │  │
│  │  │ • GetProfile   │  │ ProfileQueue   │  │ Handler          │  │  │
│  │  │ • Multi-Char   │  │                │  │                  │  │  │
│  │  └────────────────┘  └────────────────┘  └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│  ┌──────────────────────────────┴──────────────────────────────────┐  │
│  │                    SERVICE LAYER (Business Logic)                │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │ Core Services                                           │    │  │
│  │  ├─────────────────────────────────────────────────────────┤    │  │
│  │  │ FChatService: WebSocket management, character handling  │    │  │
│  │  │ MessageService: Message persistence & retrieval         │    │  │
│  │  │ CharacterService: Character data management             │    │  │
│  │  │ UserService: User management & settings                 │    │  │
│  │  │ ProfileService: Profile caching & requests              │    │  │
│  │  │ MemoService: Character notes/memos                      │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │ F-List API Integration Services                         │    │  │
│  │  ├─────────────────────────────────────────────────────────┤    │  │
│  │  │ FListTicketManager: F-Chat authentication tickets       │    │  │
│  │  │ FListMappingService: ID/name mapping                    │    │  │
│  │  │ FListCharacterDataService: Character profile data       │    │  │
│  │  │ FListImageService: Avatar/image retrieval               │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │ Support Services                                        │    │  │
│  │  ├─────────────────────────────────────────────────────────┤    │  │
│  │  │ ProfileQueueService: Profile request queue management   │    │  │
│  │  │ ProfileRateLimiter: Rate limiting for profile requests  │    │  │
│  │  │ TicketManager: Singleton ticket cache                   │    │  │
│  │  │ FChatWebSocketClient: Low-level WebSocket handler       │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│  ┌──────────────────────────────┴──────────────────────────────────┐  │
│  │                    DATA ACCESS LAYER                             │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                  │  │
│  │  ┌──────────────────┐      ┌──────────────────────────────┐     │  │
│  │  │ BouncerDbContext │◄─────┤ Entity Framework Core       │     │  │
│  │  │                  │      │ (PostgreSQL Provider)        │     │  │
│  │  │ • DbSets         │      └──────────────────────────────┘     │  │
│  │  │ • Relationships  │                                           │  │
│  │  │ • Indexes        │                                           │  │
│  │  └──────────────────┘                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│  ┌──────────────────────────────┴──────────────────────────────────┐  │
│  │                    BACKGROUND SERVICES                           │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                  │  │
│  │  ProfileQueueProcessor: Processes profile requests with          │  │
│  │                         30-second delays to avoid rate limits    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                             │                │
              ┌──────────────┴────────┐      │
              │                       │      │
    ┌─────────▼─────────┐   ┌────────▼──────▼────┐
    │ F-Chat WebSocket  │   │ F-List HTTP API     │
    │ chat.f-list.net   │   │ www.f-list.net      │
    │                   │   │                     │
    │ • IDN/VAR/LIS    │   │ • Ticket endpoint   │
    │ • MSG/PRI        │   │ • Mapping endpoint  │
    │ • JCH/LCH        │   │ • Character data    │
    │ • STA/PRO        │   │ • Memo endpoint     │
    └───────────────────┘   └─────────────────────┘
```

---

## Data Models

### Core Domain Models

#### **BouncerUser** (Identity User)
```
BouncerUser (inherits IdentityUser)
├── Id: string (PK)
├── UserName: string
├── Email: string
├── PasswordHash: string (Identity managed)
├── GoogleId: string?
├── GoogleEmail: string?
├── GoogleName: string?
├── GooglePicture: string?
├── HasFChatCredentials: bool
├── IsActive: bool
├── FailedLoginAttempts: int
├── LockoutEnd: DateTime?
├── CreatedAt: DateTime
├── LastLoginAt: DateTime
├── LastPasswordChange: DateTime?
└── LastFChatCredentialsUpdate: DateTime?

Navigation Properties:
├── Settings: UserSettings (1:1)
├── Sessions: ICollection<UserSession> (1:N)
├── Messages: ICollection<Message> (1:N)
├── Channels: ICollection<Channel> (1:N)
├── QueuedMessages: ICollection<QueuedMessage> (1:N)
├── Profiles: ICollection<Profile> (1:N)
├── CharacterConnections: ICollection<CharacterConnection> (1:N)
└── CharacterChannels: ICollection<CharacterChannel> (1:N)
```

#### **Character** (Unified Character Model)
```
Character
├── Id: int (PK)
├── Name: string (UNIQUE) - Global character identifier
├── Status: string - online/away/busy/dnd/offline
├── StatusMessage: string?
├── Gender: string
├── IsOnline: bool
├── ProfileData: string? (JSON)
├── StructuredProfileData: string? (JSON)
├── RawProData: string? (Debug)
├── Memo: string?
├── MemoLastUpdated: DateTime?
├── LastSeen: DateTime
├── FirstSeen: DateTime
└── LastUpdated: DateTime

Navigation Properties:
├── Connections: ICollection<CharacterConnection> (1:N)
└── Channels: ICollection<CharacterChannel> (1:N)
```

**Design Note**: Characters are global entities shared across all user connections. The same character seen by multiple users is the same database record.

#### **CharacterConnection** (User-Character Relationship)
```
CharacterConnection
├── Id: int (PK)
├── UserId: string (FK -> BouncerUser)
├── CharacterId: int (FK -> Character)
├── FChatUsername: string
├── FChatPasswordEncrypted: string
├── IsActive: bool - Currently selected character
├── IsConnected: bool - WebSocket connection status
├── ConnectedAt: DateTime
├── LastActivityAt: DateTime
└── CreatedAt: DateTime

Navigation Properties:
├── User: BouncerUser
├── Character: Character
└── CharacterChannels: ICollection<CharacterChannel> (1:N)

Unique Index: (UserId, CharacterId)
```

**Design Note**: Represents a user's connection to a specific character. Allows multi-character support where one user can be connected as multiple characters simultaneously.

#### **Message**
```
Message
├── Id: int (PK)
├── UserId: string (FK -> BouncerUser)
├── ChannelName: string
├── CharacterName: string - Which character received/sent this
├── Sender: string
├── Content: string
├── MessageType: MessageType (Chat/Action/System/Private/etc.)
├── Timestamp: DateTime
└── FChatMessageId: string?

Navigation Property:
└── User: BouncerUser

Indexes:
├── (UserId, ChannelName, Timestamp)
├── (UserId, Timestamp)
└── (Timestamp)
```

#### **QueuedMessage**
```
QueuedMessage
├── Id: int (PK)
├── UserId: string (FK -> BouncerUser)
├── ChannelName: string
├── CharacterName: string
├── Content: string
├── MessageType: MessageType
├── QueuedAt: DateTime
├── ProcessedAt: DateTime?
└── Status: QueuedMessageStatus

Navigation Property:
└── User: BouncerUser
```

#### **Profile** (Legacy)
```
Profile
├── Id: int (PK)
├── UserId: string (FK -> BouncerUser)
├── CharacterName: string
├── ProfileData: string (JSON)
├── RawProData: string? (Debug)
├── CreatedAt: DateTime
└── UpdatedAt: DateTime

Navigation Property:
└── User: BouncerUser
```

**Migration Note**: Profile data is being consolidated into the Character model's StructuredProfileData field.

#### **ProfileQueueItem**
```
ProfileQueueItem
├── Id: int (PK)
├── UserId: string
├── CharacterName: string
├── RequestedAt: DateTime
├── ProcessedAt: DateTime?
├── RequestType: ProfileRequestType (StaleRefresh/ManualRequest/etc.)
├── Priority: ProfileRequestPriority (Low/Normal/High/Critical)
├── RetryCount: int
├── MaxRetries: int
├── ErrorMessage: string?
├── Status: ProfileQueueStatus (Pending/Processing/Completed/Failed)
├── CreatedAt: DateTime
└── UpdatedAt: DateTime

Indexes:
├── (UserId, CharacterName, Status)
├── (Status, Priority, RequestedAt)
└── (UpdatedAt)
```

#### **Channel**
```
Channel
├── Id: int (PK)
├── UserId: string (FK -> BouncerUser)
├── FChatChannelName: string
├── Title: string?
├── Description: string?
└── IsSubscribed: bool

Navigation Property:
└── User: BouncerUser

Unique Index: (UserId, FChatChannelName)
```

#### **CharacterChannel** (Character-Channel Join)
```
CharacterChannel
├── Id: int (PK)
├── CharacterConnectionId: int (FK -> CharacterConnection)
├── ChannelId: string (F-Chat channel ID)
├── ChannelName: string
├── JoinedAt: DateTime
├── LastSeenAt: DateTime
└── Status: ChannelCharacterStatus

Navigation Property:
└── CharacterConnection: CharacterConnection

Unique Index: (CharacterConnectionId, ChannelId)
```

#### **UserSettings**
```
UserSettings
├── UserId: string (PK, FK -> BouncerUser)
├── RetentionDays: int (default: 30)
├── AutoPurgeEnabled: bool (default: true)
├── FChatCredentialsEncrypted: string? (Base64 encoded)
└── LastPurge: DateTime

Navigation Property:
└── User: BouncerUser (1:1)
```

#### **UserSession**
```
UserSession
├── Id: int (PK)
├── UserId: string (FK -> BouncerUser)
├── SessionToken: string
├── CreatedAt: DateTime
├── ExpiresAt: DateTime
└── LastActivityAt: DateTime

Navigation Property:
└── User: BouncerUser
```

### Supporting Models

#### **FChatCharacter** (DTO - Not persisted)
```
FChatCharacter
├── Name: string
├── Status: string
├── StatusMessage: string
└── Gender: string
```

#### **FChatChannel** (DTO - Not persisted)
```
FChatChannel
├── Id: string
├── Name: string
├── Title: string?
├── UserCount: int
└── Mode: ChannelMode (Public/Private/Both)
```

#### **ProfileData** (Structured Profile Model)
```
ProfileData
├── CharacterName: string
├── Description: string
├── Gender: string
├── Orientation: string
├── Species: string
├── Age: string
├── Furryprefs: string
├── Views: int
├── Info: Dictionary<string, string>
├── Kinks: Dictionary<string, List<int>>
├── CustomKinks: Dictionary<string, string>
├── Images: List<ImageData>
├── InlineImages: List<ImageData>
└── Timestamp: DateTime
```

---

## Service Layer

### Core Services

#### **IFChatService / FChatService**
**Responsibility**: Central service for F-Chat WebSocket communication and state management.

**Key Operations**:
- **Connection Management**
  - `ConnectUserAsync()` - Legacy single-character connection
  - `ConnectCharacterAsync()` - Multi-character connection
  - `DisconnectUserAsync()` / `DisconnectCharacterAsync()`
  - `IsUserConnectedAsync()` / `IsCharacterConnectedAsync()`
  - `RefreshUserConnectionAsync()` - Reconnection logic

- **Character Management**
  - `GetCharactersAsync()` - Fetch user's available characters
  - `SelectCharacterAsync()` - Switch active character
  - `SetActiveCharacterAsync()` - Set active character for multi-char
  - `GetActiveCharacterAsync()` - Get currently active character
  - `GetSelectedCharacterAsync()` - Get selected character details

- **Channel Operations**
  - `JoinChannelAsync()` / `LeaveChannelAsync()`
  - `GetChannelListAsync()` - All available channels
  - `GetJoinedChannelsAsync()` - User's joined channels
  - `GetChannelCharactersAsync()` - Characters in a channel
  - `RequestChannelOperatorListAsync()` - Refresh channel list

- **Messaging**
  - `SendMessageAsync()` - Send channel message
  - `SendPRIMessageAsync()` - Send private message
  - `SendTypingNotificationAsync()`
  - `ProcessQueuedMessagesAsync()` - Retry failed messages

- **Profile & Social**
  - `RequestProfileAsync()` - Request character profile from F-Chat
  - `GetFriendsAndBookmarksAsync()`
  - `AddBookmarkAsync()` / `RemoveBookmarkAsync()`
  - `SearchCharactersAsync()`

- **Internal State**
  - `GetUserCharacterConnectionsAsync()` - Get all user's character connections
  - `GetCharacterConnectionAsync()` - Get specific character connection
  - `HasWebSocketConnectionAsync()` - Check WebSocket connection status
  - `CleanupInvalidCharactersAsync()` - Remove stale connections
  - `ClearChannelCacheAsync()` - Clear channel cache

**Dependencies**:
- `BouncerDbContext` - Database access
- `IHubContext<BouncerHub>` - Push notifications to clients
- `FChatWebSocketClient` - Low-level WebSocket management
- `IFListTicketManager` - F-Chat authentication
- `ILogger`

**Design Pattern**: Singleton (maintains persistent WebSocket connections)

---

#### **IMessageService / MessageService**
**Responsibility**: Message persistence, retrieval, and queue management.

**Key Operations**:
- **Message Management**
  - `SaveMessageAsync()` - Store incoming/outgoing messages
  - `GetMessagesAsync()` - Retrieve messages by channel/time
  - `GetRecentMessagesAsync()` - Get recent messages for all channels
  - `PurgeMessagesAsync()` - Delete old messages based on retention policy

- **Queue Management**
  - `QueueMessageAsync()` - Queue message when disconnected
  - `GetQueuedMessagesAsync()` - Get pending messages
  - `ProcessQueuedMessageAsync()` - Send queued message
  - `ClearQueuedMessagesAsync()` - Clear all queued messages

- **Log Retrieval** (New endpoints)
  - `GetCharactersWithLogsAsync()` - Summary of logged characters
  - `GetChannelsWithLogsAsync()` - Summary of logged channels
  - `GetCharacterLogsAsync()` - Logs for specific character
  - `GetChannelLogsAsync()` - Logs for specific channel
  - `GetCharacterChannelLogsAsync()` - Logs for character in channel
  - `SearchLogsAsync()` - Search logs with filters

**Dependencies**:
- `BouncerDbContext`
- `ILogger`

**Design Pattern**: Scoped

---

#### **IProfileService / ProfileService**
**Responsibility**: Profile data caching and retrieval from F-List API.

**Key Operations**:
- `GetCachedProfileAsync()` - Get cached profile with staleness check
- `RequestProfileAsync()` - Queue new profile request
- `ProcessProfileRequestAsync()` - Fetch profile from F-List API
- `UpdateProfileCacheAsync()` - Store profile in cache

**Dependencies**:
- `BouncerDbContext`
- `IFListCharacterDataService` - F-List API client
- `IProfileQueueService` - Queue management
- `IProfileRateLimiter` - Rate limiting
- `ICharacterService` - Character data updates
- `ILogger`

**Design Pattern**: Scoped

---

#### **ICharacterService / CharacterService**
**Responsibility**: Character entity management.

**Key Operations**:
- `GetOrCreateCharacterAsync()` - Find or create character record
- `UpdateCharacterAsync()` - Update character data
- `UpdateCharacterStatusAsync()` - Update online status
- `UpdateCharacterProfileAsync()` - Update profile data
- `GetCharacterAsync()` - Retrieve character by name/ID
- `SearchCharactersAsync()` - Search characters by criteria

**Dependencies**:
- `BouncerDbContext`
- `ILogger`

**Design Pattern**: Scoped

---

#### **IUserService / UserService**
**Responsibility**: User management and settings.

**Key Operations**:
- `GetUserAsync()` - Get user by ID
- `GetUserSettingsAsync()` - Get user settings
- `UpdateUserSettingsAsync()` - Update user settings
- `ValidateCredentialsAsync()` - Validate F-Chat credentials
- `PurgeOldMessagesAsync()` - Auto-purge based on retention policy

**Dependencies**:
- `BouncerDbContext`
- `UserManager<BouncerUser>`
- `ILogger`

**Design Pattern**: Scoped

---

#### **IMemoService / MemoService**
**Responsibility**: Character memo/note management via F-List API.

**Key Operations**:
- `GetMemoAsync()` - Get memo from F-List
- `RefreshMemoAsync()` - Refresh memo from F-List
- `UpdateMemoAsync()` - Update memo on F-List

**Dependencies**:
- `HttpClient`
- `IFListTicketManager`
- `ICharacterService`
- `ILogger`

**Design Pattern**: Scoped

---

### F-List API Integration Services

#### **IFListTicketManager / FListTicketManager**
**Responsibility**: Manage F-Chat authentication tickets.

**Key Operations**:
- `GetTicketAsync()` - Get cached or new ticket
- `RefreshTicketAsync()` - Force ticket refresh
- `InvalidateTicketAsync()` - Remove invalid ticket from cache

**External Endpoint**: `POST https://www.f-list.net/json/getApiTicket.php`

**Design Pattern**: Singleton (in-memory ticket cache)

---

#### **IFListMappingService / FListMappingService**
**Responsibility**: Map F-List character IDs to names.

**Key Operations**:
- `GetMappingAsync()` - Get ID to name mappings
- `GetCharacterIdAsync()` - Get ID for specific character
- `GetCharacterNameAsync()` - Get name for specific ID

**External Endpoint**: `POST https://www.f-list.net/json/api/mapping.php`

**Design Pattern**: Scoped (with caching)

---

#### **IFListCharacterDataService / FListCharacterDataService**
**Responsibility**: Fetch character profile data from F-List API.

**Key Operations**:
- `GetCharacterDataAsync()` - Get full character profile

**External Endpoint**: `POST https://www.f-list.net/json/api/character-data.php`

**Design Pattern**: Scoped

---

#### **FListImageService**
**Responsibility**: Fetch character images from F-List.

**Key Operations**:
- `GetCharacterImagesAsync()` - Get all images for character
- `GetAvatarUrlAsync()` - Get avatar URL

**External Endpoint**: `GET https://static.f-list.net/images/avatar/...`

**Design Pattern**: Scoped

---

### Support Services

#### **IProfileQueueService / ProfileQueueService**
**Responsibility**: Manage profile request queue.

**Key Operations**:
- `EnqueueProfileRequestAsync()` - Add profile request to queue
- `DequeueProfileRequestAsync()` - Get next request from queue
- `CompleteProfileRequestAsync()` - Mark request as completed
- `FailProfileRequestAsync()` - Mark request as failed
- `GetQueueStatusAsync()` - Get queue statistics

**Design Pattern**: Scoped

---

#### **IProfileRateLimiter / ProfileRateLimiter**
**Responsibility**: Rate limit profile requests (30-second delay).

**Key Operations**:
- `CanMakeRequestAsync()` - Check if request is allowed
- `RecordRequestAsync()` - Record request timestamp
- `GetNextAvailableTimeAsync()` - When next request can be made

**Design Pattern**: Singleton (in-memory state)

---

#### **TicketManager**
**Responsibility**: In-memory F-Chat ticket cache.

**Design Pattern**: Singleton (thread-safe dictionary)

---

#### **FChatWebSocketClient**
**Responsibility**: Low-level WebSocket communication with F-Chat server.

**Key Operations**:
- `ConnectAsync()` - Establish WebSocket connection
- `DisconnectAsync()` - Close WebSocket connection
- `SendAsync()` - Send message to F-Chat
- `ReceiveAsync()` - Receive messages from F-Chat (event handlers)

**F-Chat Protocol Commands**:
- `IDN` - Identify (login)
- `VAR` - Server variables
- `LIS` - Character list
- `MSG` - Channel message
- `PRI` - Private message
- `JCH` - Join channel
- `LCH` - Leave channel
- `STA` - Status update
- `PRO` - Profile request
- `ORS` - Operator list request
- `FRL` - Friends list
- `IGN` - Ignore list

**Design Pattern**: Scoped (per-connection)

---

#### **ProfileQueueProcessor** (Background Service)
**Responsibility**: Process profile requests from queue with 30-second delays.

**Workflow**:
1. Dequeue next pending profile request
2. Call `ProfileService.ProcessProfileRequestAsync()`
3. Mark as completed or failed
4. Notify frontend via SignalR
5. Wait 30 seconds
6. Repeat

**Design Pattern**: Hosted Service (Background Worker)

---

## Controllers

### **AuthController** (`/api/auth`)
**Responsibility**: User authentication and registration.

**Endpoints**:
- `POST /login` - Username/password login
- `POST /register` - User registration
- `GET /google` - Initiate Google OAuth flow
- `GET /google-callback` - Google OAuth callback
- `POST /update-fchat-credentials` - Update F-Chat credentials
- `POST /refresh` - Refresh JWT token

**Authentication Flow**:
1. User logs in with username/password or Google OAuth
2. Server validates credentials
3. JWT token generated and returned
4. Client includes JWT in Authorization header for subsequent requests
5. SignalR uses JWT from query string (`?access_token=...`)

---

### **FChatController** (`/api/fchat`)
**Responsibility**: F-Chat operations (REST alternative to SignalR).

**Endpoints**:
- `GET /characters` - Get available characters
- `POST /character/select` - Select character
- `GET /status` - Get F-Chat connection status
- `GET /profile/{characterName}` - Get character profile
- `POST /profile/request` - Request profile refresh
- `GET /channel/{channelId}/characters` - Get channel character list
- `POST /channel/{channelId}/characters/refresh` - Refresh channel list
- `POST /status/update` - Update character status
- `GET /friends` - Get friends and bookmarks
- `POST /search` - Search characters
- `POST /bookmark/add` - Add bookmark
- `POST /bookmark/remove` - Remove bookmark
- `GET /memo/{characterName}` - Get character memo
- `POST /memo/{characterName}/refresh` - Refresh memo

**Authorization**: JWT Bearer token required (`[Authorize]`)

---

### **CharacterController** (`/api/character`)
**Responsibility**: Character management (assumed based on project structure).

**Note**: Not fully examined, but likely contains:
- Character CRUD operations
- Character search
- Character relationship management

---

### **UserController** (`/api/user`)
**Responsibility**: User profile and settings management.

**Note**: Not fully examined, but likely contains:
- Get user profile
- Update user settings
- Change password
- Delete account

---

### **LogsController** (`/api/logs`)
**Responsibility**: Message log retrieval.

**Note**: Not fully examined, but likely exposes:
- `MessageService.GetCharactersWithLogsAsync()`
- `MessageService.GetChannelLogsAsync()`
- `MessageService.SearchLogsAsync()`

---

### **ProfileQueueController** (`/api/profile-queue`)
**Responsibility**: Profile queue management and monitoring.

**Note**: Not fully examined, but likely contains:
- Get queue status
- Cancel queued requests
- Get queue statistics

---

## Real-Time Communication

### **BouncerHub** (`/bouncerHub`)
**Technology**: SignalR (WebSocket with fallback)

**Client-to-Server Methods**:

#### Connection Management
- `OnConnectedAsync()` - Client connects, loads state
- `OnDisconnectedAsync()` - Client disconnects (F-Chat stays connected!)

#### Character Management
- `GetCharacters()` - Request character list
- `SelectCharacter(characterName)` - Select active character
- `SetSelectedCharacter(characterName)` - Restore selected character
- `ConnectCharacter(characterName, username, password)` - Connect new character
- `DisconnectCharacter(characterName)` - Disconnect character
- `SetActiveCharacter(characterName)` - Switch active character
- `SwitchActiveCharacter(characterName)` - Switch active character (multi-char)
- `GetActiveCharacters()` - Get all connected characters

#### Channel Management
- `GetChannelList()` - Get available channels
- `SubscribeToChannels(channels[])` - Join channels
- `JoinChannelForCharacter(characterName, channel)` - Join channel as character
- `LeaveChannelForCharacter(characterName, channel)` - Leave channel as character
- `GetChannelCharacters(channelId, characterName?)` - Get characters in channel
- `RefreshChannelCharacters(channelId, characterName?)` - Refresh channel list

#### Messaging
- `SendMessage(channel, content)` - Send message to channel
- `SendMessageFromCharacter(characterName, channel, content)` - Send as character
- `RequestHistory(channel, since, limit)` - Get message history
- `ClearAllHistory()` - Clear all message history
- `SendTypingNotification(characterName, status)` - Send typing notification

#### Profile & Social
- `RequestProfile(characterName)` - Request character profile
- `RequestProfileFromCharacter(characterName, requestingCharacter)` - Request profile as character
- `GetBasicInfo(characterName)` - Get cached basic info

#### Credential Management (Secure Flow)
- `RequestFChatCredentials(characterName)` - Request credentials from client
- `ProvideFChatCredentials(requestId, encryptedCredentials)` - Provide credentials

**Server-to-Client Events**:

#### Connection Status
- `BouncerReconnected` - Bouncer reconnected with state
- `NotifyConnectionStatus` - Connection status update
- `FChatConnectionEstablished` - F-Chat connection established
- `FChatConnectionFailed` - F-Chat connection failed

#### Character Events
- `ReceiveCharacters` - Character list
- `CharacterSelected` - Character selected successfully
- `CharacterRestored` - Character restored from saved state
- `CharacterConnected` - Character connected successfully
- `CharacterDisconnected` - Character disconnected
- `CharacterError` - Character operation error
- `ActiveCharacterSwitched` - Active character switched
- `ReceiveActiveCharacters` - Active characters list

#### Channel Events
- `ReceiveChannelList` - Channel list
- `ChannelsSubscribed` - Successfully subscribed to channels
- `ChannelJoined` - Joined channel
- `ChannelLeft` - Left channel
- `ChannelListError` - Channel list error
- `ChannelError` - Channel operation error
- `ReceiveChannelCharacters` - Channel character list
- `ChannelCharactersRefreshed` - Channel list refreshed

#### Messaging Events
- `ReceiveMessage` - New message received
- `MessageSent` - Message sent successfully
- `MessageQueued` - Message queued for later delivery
- `MessageError` - Message send error
- `ReceiveHistory` - Message history
- `ReceiveRecentMessages` - Recent messages on connect
- `HistoryCleared` - History cleared

#### Profile Events
- `ProfileRequested` - Profile request sent
- `ProfileAvailable` - Profile data available
- `ProfileError` - Profile request error
- `ReceiveBasicInfo` - Basic character info
- `BasicInfoError` - Basic info error

#### Credential Events
- `RequestFChatCredentials` - Server requesting credentials
- `CredentialRequestExpired` - Credential request expired

**Design Patterns**:
- **User Groups**: Clients grouped by `user-{userId}` for targeted broadcasts
- **Bouncer Pattern**: Server maintains persistent F-Chat connection even when client disconnects
- **Message Queueing**: Messages queued when F-Chat disconnected, sent when reconnected

---

## External Integrations

### F-Chat WebSocket (`wss://chat.f-list.net/chat2`)

**Protocol**: JSON-based command/response over WebSocket

**Connection Flow**:
1. Connect to WebSocket
2. Receive `IDN` (identify) command
3. Send `IDN` with ticket and character name
4. Receive character list, channel list
5. Send commands (`MSG`, `JCH`, `LCH`, etc.)
6. Receive events (`MSG`, `PRI`, `STA`, `JCH`, `LCH`, etc.)

**Key Commands**:
- `IDN` - Identify/login
- `VAR` - Server variables
- `LIS` - Character list
- `CHA` - Channel list
- `JCH` - Join channel
- `LCH` - Leave channel
- `MSG` - Send channel message
- `PRI` - Send private message
- `STA` - Set status
- `PRO` - Request profile
- `ORS` - Request operator list
- `FRL` - Friends list
- `IGN` - Ignore list
- `FKS` - Search characters

**Events from Server**:
- `IDN` - Connection acknowledged
- `VAR` - Server variables
- `LIS` - Character list
- `CHA` - Channel list
- `JCH` - Character joined channel
- `LCH` - Character left channel
- `MSG` - Channel message
- `PRI` - Private message
- `STA` - Status update
- `PRD` - Profile data
- `COL` - Operator list
- `FRL` - Friends list
- `NLN` - Character online
- `FLN` - Character offline

---

### F-List HTTP API (`https://www.f-list.net/json/`)

**Endpoints Used**:

#### 1. Get API Ticket
- **Endpoint**: `POST /json/getApiTicket.php`
- **Payload**: `{ account, password, no_characters, no_bookmarks, no_friends }`
- **Response**: `{ ticket, characters, bookmarks, friends }`
- **Used By**: `FListTicketManager`
- **Purpose**: Authenticate and get ticket for WebSocket connection

#### 2. Character Mapping
- **Endpoint**: `POST /json/api/mapping.php`
- **Payload**: `{ ticket, ids, names }`
- **Response**: `{ ids: { id: name }, names: { name: id } }`
- **Used By**: `FListMappingService`
- **Purpose**: Map character IDs to names and vice versa

#### 3. Character Data
- **Endpoint**: `POST /json/api/character-data.php`
- **Payload**: `{ ticket, name }`
- **Response**: Character profile data (JSON)
- **Used By**: `FListCharacterDataService`
- **Purpose**: Get full character profile

#### 4. Character Memo
- **Endpoint**: `POST /json/api/character-memo-get.php`
- **Payload**: `{ ticket, target_name }`
- **Response**: `{ note }`
- **Used By**: `MemoService`
- **Purpose**: Get user's memo for character

#### 5. Images
- **Endpoint**: `GET /images/avatar/{character}.png`
- **Used By**: `FListImageService`
- **Purpose**: Get character avatar image

**Rate Limiting**: 30-second delay enforced by `ProfileRateLimiter` and `ProfileQueueProcessor`

---

## Authentication & Security

### Authentication Mechanisms

#### 1. **Local Authentication**
- Username/password stored in database
- Passwords hashed by ASP.NET Core Identity
- JWT tokens issued on login
- Refresh tokens for token renewal

#### 2. **Google OAuth 2.0**
- Flow: `/api/auth/google` → Google → `/api/auth/google-callback`
- Scopes: `email`, `profile`
- User info stored in `BouncerUser.Google*` fields
- Linked to existing account by email or creates new account

#### 3. **F-Chat Credentials**
- Stored encrypted (Base64 encoded) in `UserSettings.FChatCredentialsEncrypted`
- Format: `{username}:{password}`
- **Security Concern**: Current encryption is weak (Base64 only)

### Security Features

#### JWT Authentication
- **Algorithm**: HMAC SHA256
- **Secret Key**: Environment variable `JWT__SecretKey`
- **Issuer**: Environment variable `JWT__Issuer` (default: "F-ChatBouncer")
- **Audience**: Environment variable `JWT__Audience` (default: "F-ChatBouncer-Users")
- **Expiration**: Environment variable `JWT__ExpirationInMinutes` (default: 60)
- **Claims**: NameIdentifier, Name, Email, Sub, Jti

#### Account Lockout
- **Max Failed Attempts**: 5 (configurable)
- **Lockout Duration**: 15 minutes (configurable)
- **Tracking**: `BouncerUser.FailedLoginAttempts`, `LockoutEnd`

#### Password Requirements
- **Min Length**: 8 (configurable)
- **Require Special Chars**: Yes (configurable)
- **Require Numbers**: Yes (configurable)
- **Require Uppercase**: Yes (configurable)
- **Require Lowercase**: Always

#### CORS
- **Development**: `http://localhost:3000`, `https://localhost:3000`
- **Production**: Configured via environment variables (`CORS__AllowedOrigins__0`)
- **Credentials**: Allowed (for cookies and SignalR)

#### HTTPS
- **Configurable**: `Security:RequireHttps` (default: false for dev)
- **Production**: Should be enforced

#### Session & Cookies
- **Session Timeout**: 30 minutes
- **Cookie Policy**: HttpOnly, SameSite=Lax
- **Secure Policy**: Based on `RequireHttps` setting

---

## Background Processing

### ProfileQueueProcessor

**Type**: Hosted Service (Background Worker)

**Purpose**: Process profile requests with rate limiting (30-second delay)

**Workflow**:
```
┌──────────────────────────────────────────────────────────────┐
│                   ProfileQueueProcessor                      │
│                                                              │
│  while (running)                                            │
│  {                                                           │
│      1. Dequeue next pending ProfileQueueItem               │
│         (ordered by Priority DESC, RequestedAt ASC)         │
│                                                              │
│      2. Call ProfileService.ProcessProfileRequestAsync()    │
│         ├─> FListCharacterDataService.GetCharacterDataAsync() │
│         ├─> CharacterService.UpdateCharacterProfileAsync()  │
│         └─> Save to Character.StructuredProfileData         │
│                                                              │
│      3. Mark as completed or failed                         │
│         ProfileQueueService.CompleteProfileRequestAsync()   │
│                                                              │
│      4. Notify frontend via SignalR                         │
│         HubContext.Clients.Group(user-{userId})             │
│            .SendAsync("ProfileAvailable", data)             │
│                                                              │
│      5. Wait 30 seconds (rate limiting)                     │
│                                                              │
│      6. Repeat                                              │
│  }                                                           │
└──────────────────────────────────────────────────────────────┘
```

**Rate Limiting**: Enforced by 30-second delay between requests to avoid F-List API rate limits

**Error Handling**:
- Retry up to 3 times (configurable per queue item)
- Exponential backoff (implicit through queue reordering)
- Error message stored in `ProfileQueueItem.ErrorMessage`

**Priority Levels**:
- **Critical** (3): User-requested profiles
- **High** (2): Stale profile refresh for active characters
- **Normal** (1): Background refresh
- **Low** (0): Bulk refresh

---

## Key Workflows

### 1. User Login & Connection Flow

```
┌──────┐                 ┌────────┐                 ┌─────────┐
│Client│                 │ Server │                 │ F-Chat  │
└──┬───┘                 └───┬────┘                 └────┬────┘
   │                         │                           │
   │ POST /api/auth/login    │                           │
   ├────────────────────────>│                           │
   │                         │                           │
   │ JWT Token + User Data   │                           │
   │<────────────────────────┤                           │
   │                         │                           │
   │ WebSocket Connect       │                           │
   │ (SignalR with JWT)      │                           │
   ├────────────────────────>│                           │
   │                         │                           │
   │ OnConnectedAsync()      │                           │
   │                         │ Check existing F-Chat     │
   │                         │ connection                │
   │                         │                           │
   │                         │ If not connected:         │
   │                         │ ConnectCharacterAsync()   │
   │                         ├──────────────────────────>│
   │                         │ IDN (identify)            │
   │                         │                           │
   │                         │ VAR, LIS (character list) │
   │                         │<──────────────────────────┤
   │                         │                           │
   │ BouncerReconnected      │                           │
   │ (state: characters,     │                           │
   │  joined channels)       │                           │
   │<────────────────────────┤                           │
   │                         │                           │
```

### 2. Message Flow (Client → F-Chat)

```
┌──────┐                 ┌────────┐                 ┌─────────┐
│Client│                 │ Server │                 │ F-Chat  │
└──┬───┘                 └───┬────┘                 └────┬────┘
   │                         │                           │
   │ SendMessage(channel,    │                           │
   │             content)    │                           │
   ├────────────────────────>│                           │
   │                         │                           │
   │                         │ Check F-Chat connected    │
   │                         │                           │
   │                         │ If connected:             │
   │                         │ FChatService.SendMessage  │
   │                         ├──────────────────────────>│
   │                         │ MSG command               │
   │                         │                           │
   │                         │ MessageService.SaveMessage│
   │                         │ (store in database)       │
   │                         │                           │
   │ ReceiveMessage          │                           │
   │ (echo to all clients)   │                           │
   │<────────────────────────┤                           │
   │                         │                           │
   │                         │ If disconnected:          │
   │                         │ MessageService.QueueMessage│
   │                         │                           │
   │ MessageQueued           │                           │
   │<────────────────────────┤                           │
   │                         │                           │
```

### 3. Message Flow (F-Chat → Client)

```
┌──────┐                 ┌────────┐                 ┌─────────┐
│Client│                 │ Server │                 │ F-Chat  │
└──┬───┘                 └───┬────┘                 └────┬────┘
   │                         │                           │
   │                         │ MSG event                 │
   │                         │<──────────────────────────┤
   │                         │                           │
   │                         │ FChatWebSocketClient      │
   │                         │ receives and parses       │
   │                         │                           │
   │                         │ MessageService.SaveMessage│
   │                         │ (store in database)       │
   │                         │                           │
   │                         │ HubContext.Clients.Group  │
   │                         │ ("user-{userId}")         │
   │                         │ .SendAsync("ReceiveMessage")│
   │                         │                           │
   │ ReceiveMessage          │                           │
   │<────────────────────────┤                           │
   │ (even if client was     │                           │
   │  disconnected, will     │                           │
   │  receive on reconnect)  │                           │
   │                         │                           │
```

### 4. Profile Request Flow

```
┌──────┐         ┌────────┐         ┌──────────┐         ┌─────────┐
│Client│         │ Server │         │ BG Worker│         │ F-List  │
└──┬───┘         └───┬────┘         └────┬─────┘         └────┬────┘
   │                 │                   │                    │
   │ RequestProfile  │                   │                    │
   ├────────────────>│                   │                    │
   │                 │                   │                    │
   │                 │ ProfileService.   │                    │
   │                 │ RequestProfile    │                    │
   │                 │ (queue request)   │                    │
   │                 │                   │                    │
   │ ProfileRequested│                   │                    │
   │<────────────────┤                   │                    │
   │                 │                   │                    │
   │                 │                   │ ProfileQueueProcessor│
   │                 │                   │ dequeues request  │
   │                 │                   │                    │
   │                 │ ProcessProfile    │                    │
   │                 │<──────────────────┤                    │
   │                 │                   │                    │
   │                 │ FListCharacterData│                    │
   │                 │ Service.GetData   │                    │
   │                 ├───────────────────┴───────────────────>│
   │                 │                                        │
   │                 │ Character profile data (JSON)          │
   │                 │<───────────────────────────────────────┤
   │                 │                   │                    │
   │                 │ CharacterService. │                    │
   │                 │ UpdateProfile     │                    │
   │                 │ (save to DB)      │                    │
   │                 │                   │                    │
   │                 │ Complete request  │                    │
   │                 ├──────────────────>│                    │
   │                 │                   │                    │
   │                 │ HubContext.Clients│                    │
   │                 │ .Group("user-{userId}")│                    │
   │                 │ .SendAsync("ProfileAvailable")│               │
   │                 │                   │                    │
   │ ProfileAvailable│                   │                    │
   │<────────────────┤                   │                    │
   │                 │                   │                    │
   │                 │                   │ Wait 30 seconds    │
   │                 │                   │ (rate limiting)    │
   │                 │                   │                    │
```

### 5. Multi-Character Connection Flow

```
┌──────┐                 ┌────────┐                 ┌─────────────┐
│Client│                 │ Server │                 │ F-Chat (x2) │
└──┬───┘                 └───┬────┘                 └──────┬──────┘
   │                         │                             │
   │ SetActiveCharacter      │                             │
   │ ("Character A")         │                             │
   ├────────────────────────>│                             │
   │                         │                             │
   │                         │ Check if Character A        │
   │                         │ has WebSocket connection    │
   │                         │                             │
   │                         │ If not:                     │
   │                         │ ConnectCharacterAsync()     │
   │                         ├────────────────────────────>│
   │                         │ WebSocket 1: IDN (Char A)   │
   │                         │                             │
   │                         │ SetActiveCharacterAsync()   │
   │                         │ (mark as active in DB)      │
   │                         │                             │
   │ ActiveCharacterSwitched │                             │
   │<────────────────────────┤                             │
   │                         │                             │
   │ SwitchActiveCharacter   │                             │
   │ ("Character B")         │                             │
   ├────────────────────────>│                             │
   │                         │                             │
   │                         │ Check if Character B        │
   │                         │ has WebSocket connection    │
   │                         │                             │
   │                         │ If not:                     │
   │                         │ ConnectCharacterAsync()     │
   │                         ├────────────────────────────>│
   │                         │ WebSocket 2: IDN (Char B)   │
   │                         │                             │
   │                         │ SetActiveCharacterAsync()   │
   │                         │ (mark Char B as active,     │
   │                         │  Char A as inactive)        │
   │                         │                             │
   │ ActiveCharacterSwitched │                             │
   │<────────────────────────┤                             │
   │                         │                             │
   │ (Both Character A and   │                             │
   │  Character B remain     │                             │
   │  connected to F-Chat,   │                             │
   │  but only Character B   │                             │
   │  is "active" for UI)    │                             │
   │                         │                             │
```

---

## Issues & Recommendations

### Current Issues

#### 1. **Weak Credential Encryption**
- **Issue**: F-Chat credentials stored as Base64 encoded strings, not true encryption
- **Risk**: If database is compromised, credentials are easily decoded
- **Recommendation**: Implement proper encryption using AES with key stored in environment variables or Key Vault

#### 2. **Mixed Character Management Paradigms**
- **Issue**: Codebase supports both:
  - Legacy single-character mode (`ConnectUserAsync`, `SelectCharacterAsync`)
  - New multi-character mode (`ConnectCharacterAsync`, `SetActiveCharacterAsync`)
- **Risk**: Confusing code paths, potential bugs from mixed usage
- **Recommendation**: Deprecate legacy methods and migrate fully to multi-character model

#### 3. **Profile Data Duplication**
- **Issue**: Profile data stored in both:
  - `Profile` table (legacy, per-user)
  - `Character.StructuredProfileData` (new, global)
- **Risk**: Data inconsistency, wasted storage
- **Recommendation**: Complete migration to global Character model, remove Profile table

#### 4. **In-Memory State Management**
- **Issue**: WebSocket connections and some state stored in-memory (singleton FChatService)
- **Risk**: State lost on server restart, difficult to scale horizontally
- **Recommendation**: Consider using Redis or similar for distributed state management

#### 5. **Rate Limiting Implementation**
- **Issue**: Rate limiting done with simple 30-second delays in background worker
- **Risk**: Not granular enough, may miss edge cases
- **Recommendation**: Implement proper rate limiting library (e.g., `AspNetCoreRateLimit`) with token bucket or sliding window algorithm

#### 6. **Error Handling in SignalR Hub**
- **Issue**: Many hub methods have try-catch blocks that log errors but may not always notify client
- **Risk**: Client may not know request failed
- **Recommendation**: Standardize error responses and ensure all errors are communicated to client

#### 7. **Message Queue Persistence**
- **Issue**: Queued messages stored in database but processing relies on in-memory state
- **Risk**: Queued messages may not be sent if server restarts at wrong time
- **Recommendation**: Implement dedicated message queue service (e.g., Azure Service Bus, RabbitMQ)

#### 8. **No Graceful Shutdown for WebSocket Connections**
- **Issue**: When server shuts down, WebSocket connections may be abruptly closed
- **Risk**: Loss of in-flight messages, poor user experience
- **Recommendation**: Implement graceful shutdown with notification to clients

#### 9. **Logging Verbosity**
- **Issue**: Mix of logging levels, some verbose logging in production
- **Risk**: Performance impact, log noise
- **Recommendation**: Review and standardize logging levels, use structured logging

#### 10. **No Health Checks for External Dependencies**
- **Issue**: Only database health check exists
- **Risk**: Server may appear healthy but F-Chat/F-List connectivity issues not detected
- **Recommendation**: Add health checks for F-Chat WebSocket and F-List API endpoints

---

### Architectural Recommendations for Refactor/v2

#### 1. **Separate Concerns: API Gateway Pattern**
```
Frontend
    ↓
API Gateway (Reverse Proxy)
    ├─> Auth Service (Authentication/Authorization)
    ├─> Chat Service (WebSocket Proxy, Message Handling)
    ├─> Profile Service (Profile Caching, F-List Integration)
    ├─> User Service (User Management, Settings)
    └─> Log Service (Message Logs, Search)
```

**Benefits**:
- Independent scaling of services
- Clear service boundaries
- Easier testing and maintenance

#### 2. **Event-Driven Architecture**
- Use message queue (RabbitMQ, Azure Service Bus) for inter-service communication
- Events: `CharacterConnected`, `MessageReceived`, `ProfileUpdated`, etc.
- Enables loose coupling and horizontal scaling

#### 3. **CQRS for Message Handling**
- **Command Side**: Handle incoming messages, writes to database
- **Query Side**: Separate read models optimized for message retrieval
- **Benefits**: Better performance for read-heavy workloads (log retrieval)

#### 4. **Distributed State Management**
- Use Redis for WebSocket connection state
- Use Redis Pub/Sub for SignalR backplane (multi-server support)
- **Benefits**: Horizontal scaling, no state loss on restart

#### 5. **API Versioning**
- Implement versioning for REST API (`/api/v1/`, `/api/v2/`)
- Use versioning strategy for SignalR hub methods
- **Benefits**: Backward compatibility, smoother migrations

#### 6. **Database Optimization**
- **Partitioning**: Partition `Messages` table by date (monthly partitions)
- **Archival**: Move old messages to cold storage (Azure Blob, S3)
- **Indexes**: Review and optimize indexes for common queries
- **Read Replicas**: Use read replicas for log retrieval

#### 7. **Caching Strategy**
- **Character Profiles**: Cache in Redis with TTL
- **Channel Lists**: Cache in Redis with manual invalidation
- **User Settings**: Cache in-memory with Redis as fallback
- **F-List Tickets**: Already cached, but could use Redis for multi-server

#### 8. **Security Enhancements**
- **Credential Storage**: Use Azure Key Vault or AWS Secrets Manager
- **Encryption at Rest**: Enable transparent data encryption for PostgreSQL
- **API Rate Limiting**: Implement per-user rate limiting on REST endpoints
- **Input Validation**: Standardize and enforce input validation on all endpoints
- **Audit Logging**: Log all security-relevant events (login, credential changes, etc.)

#### 9. **Observability**
- **Metrics**: Implement metrics collection (Prometheus, Application Insights)
  - WebSocket connection count
  - Message throughput
  - Profile request queue depth
  - API response times
- **Tracing**: Implement distributed tracing (OpenTelemetry, Jaeger)
- **Alerting**: Set up alerts for anomalies and errors

#### 10. **Testing Strategy**
- **Unit Tests**: Service layer (currently minimal or absent)
- **Integration Tests**: Controller endpoints, database operations
- **E2E Tests**: WebSocket flows, authentication flows
- **Load Tests**: Simulate high user counts, message volumes

---

### Database Schema Recommendations

#### 1. **Normalize Message Storage**
```sql
-- Current: One Messages table with all data
-- Recommended: Separate tables for better performance

CREATE TABLE Channels (
    Id INT PRIMARY KEY,
    Name VARCHAR(100) UNIQUE NOT NULL,
    Title VARCHAR(500),
    CreatedAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE Messages (
    Id BIGINT PRIMARY KEY,
    ChannelId INT REFERENCES Channels(Id),
    SenderId INT REFERENCES Characters(Id),
    Content TEXT NOT NULL,
    MessageType INT NOT NULL,
    Timestamp TIMESTAMP NOT NULL,
    FChatMessageId VARCHAR(100)
);

CREATE INDEX idx_messages_channel_timestamp 
    ON Messages(ChannelId, Timestamp DESC);
    
CREATE INDEX idx_messages_sender_timestamp 
    ON Messages(SenderId, Timestamp DESC);
```

#### 2. **Partition Messages Table**
```sql
-- Partition by month for better query performance
CREATE TABLE Messages (
    ...
) PARTITION BY RANGE (Timestamp);

CREATE TABLE Messages_2025_01 PARTITION OF Messages
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
    
CREATE TABLE Messages_2025_02 PARTITION OF Messages
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

#### 3. **Add Composite Indexes**
```sql
-- Optimize character + channel queries
CREATE INDEX idx_character_channel_timestamp 
    ON CharacterChannels(CharacterId, ChannelId, JoinedAt DESC);

-- Optimize user + character queries
CREATE INDEX idx_user_character_active 
    ON CharacterConnections(UserId, IsActive, IsConnected);
```

#### 4. **Separate Profile Data**
```sql
-- Move profile data to separate table with compression
CREATE TABLE CharacterProfiles (
    CharacterId INT PRIMARY KEY REFERENCES Characters(Id),
    ProfileDataCompressed BYTEA, -- Compressed JSON
    CreatedAt TIMESTAMP NOT NULL,
    UpdatedAt TIMESTAMP NOT NULL
);
```

---

### Technology Stack Recommendations for v2

#### Backend
- **Framework**: ASP.NET Core 8.0 (LTS)
- **API Gateway**: Ocelot or YARP (Yet Another Reverse Proxy)
- **Message Queue**: RabbitMQ or Azure Service Bus
- **Caching**: Redis
- **Database**: PostgreSQL 15+ with TimescaleDB extension for time-series data
- **WebSocket**: SignalR with Redis backplane
- **Background Jobs**: Hangfire or Quartz.NET

#### Infrastructure
- **Containerization**: Docker + Docker Compose (dev), Kubernetes (prod)
- **Cloud**: Azure or AWS
  - Azure: App Service, Azure SQL, Azure Service Bus, Azure Redis Cache, Azure Key Vault
  - AWS: ECS, RDS PostgreSQL, SQS, ElastiCache, Secrets Manager
- **CI/CD**: GitHub Actions or Azure DevOps
- **Monitoring**: Application Insights (Azure) or CloudWatch (AWS) + Prometheus + Grafana

#### Frontend
- **Framework**: Next.js 14+ (already in use)
- **State Management**: Zustand (already in use)
- **WebSocket**: SignalR client library
- **UI Components**: Tailwind CSS (already in use)

---

## Summary

F-ChatBouncer is a well-architected .NET application with clear separation of concerns between presentation, business logic, and data access layers. The "bouncer pattern" - maintaining persistent F-Chat connections while clients disconnect - is its core value proposition.

**Key Strengths**:
- Clean service layer architecture
- SignalR for real-time communication
- Background processing for rate-limited operations
- Multi-character support
- Comprehensive message logging

**Key Weaknesses**:
- Weak credential encryption
- In-memory state management limits horizontal scaling
- Profile data duplication
- Mixed legacy/new code paths
- Minimal test coverage (assumed)

**Recommended Next Steps for Refactor**:
1. Address security issues (credential encryption, rate limiting)
2. Complete migration to multi-character model
3. Implement distributed state management (Redis)
4. Add comprehensive health checks and monitoring
5. Separate concerns into microservices for scalability
6. Implement event-driven architecture for loose coupling
7. Add comprehensive test coverage

The current codebase is production-ready for small to medium scale but will need architectural changes (especially distributed state management) to scale to large user counts.

---

## Backend Upgrade Plan

This section outlines a comprehensive plan to modernize the F-ChatBouncer backend by:
- **A)** Removing legacy code and migrating to multi-character support only
- **B)** Implementing Redis for caching and message queue (pub/sub)
- **C)** Refactoring logging for granular control
- **D)** Updating security and encryption implementation

### Upgrade Overview

**Current Status**: Phases 1-3 complete, preparing for Phase 4  
**Last Updated**: November 12, 2025

```
Phase 1: Infrastructure & Dependencies (Week 1) [COMPLETE ✅ - 100%]
├─> ✅ Setup Redis infrastructure (COMPLETED 2025-11-11)
├─> ✅ Upgrade security libraries (COMPLETED 2025-11-12)
├─> ✅ Implement new logging framework (COMPLETED 2025-11-11)
└─> ✅ Add monitoring and health checks (COMPLETED 2025-11-12)

Phase 2: Security & Encryption (Week 2) [COMPLETE ✅ - 100%]
├─> ✅ Implement proper credential encryption (COMPLETED 2025-11-12)
├─> ✅ Add API rate limiting (COMPLETED 2025-11-12)
├─> ✅ Enhance authentication security (COMPLETED 2025-11-12)
└─> ✅ Add audit logging (COMPLETED 2025-11-12)

Phase 3: Legacy Code Removal (Week 3-4)
├─> Migrate to multi-character only model
├─> Remove legacy single-character methods
├─> Update database schema
└─> Update frontend integration

Phase 4: Redis Integration (Week 5-6)
├─> Implement Redis caching layer
├─> Implement Redis pub/sub for messages
├─> Add SignalR Redis backplane
└─> Migrate WebSocket state to Redis

Phase 5: Testing & Optimization (Week 7)
├─> Write comprehensive tests
├─> Performance testing
├─> Load testing
└─> Documentation updates

Phase 6: Deployment & Migration (Week 8)
├─> Staged rollout
├─> Data migration
├─> Monitoring and alerts
└─> Rollback plan
```

---

### Detailed Task List

## PHASE 1: Infrastructure & Dependencies

### Task 1.1: Setup Redis Infrastructure ✅ **COMPLETED**
**Priority**: High | **Estimated Time**: 4-6 hours | **Actual Time**: ~1 hour  
**Completed**: November 11, 2025

- [x] Add Redis NuGet packages
  - [x] `StackExchange.Redis` (v2.8.16)
  - [x] `Microsoft.Extensions.Caching.StackExchangeRedis` (v9.0.0)
  - [x] `Microsoft.AspNetCore.SignalR.StackExchangeRedis` (v9.0.0)
  
- [x] Create Redis configuration
  - [x] Add Redis connection string to `appsettings.json`
  - [x] Add Redis settings model (`RedisSettings.cs`)
  - [x] Configure Redis in `Program.cs` with environment variable support
  
- [x] Setup Redis connection management
  - [x] Create `IRedisConnectionFactory` interface
  - [x] Implement `RedisConnectionFactory` with connection pooling
  - [x] Add health check for Redis connection
  
- [x] Setup development environment
  - [x] Using existing local Redis (localhost:6379, v8.2.3)
  - [x] Test Redis connection in dev environment

**Files Created**:
- `/src/FChatBouncer.Server/Configuration/RedisSettings.cs` ✅
- `/src/FChatBouncer.Server/Infrastructure/IRedisConnectionFactory.cs` ✅
- `/src/FChatBouncer.Server/Infrastructure/RedisConnectionFactory.cs` ✅
- `/src/FChatBouncer.Server/HealthChecks/RedisHealthCheck.cs` ✅
- `/src/FChatBouncer.Server/Tests/RedisConnectionTest.cs` ✅

**Files Modified**:
- `/src/FChatBouncer.Server/FChatBouncer.Server.csproj` - Added Redis packages ✅
- `/src/FChatBouncer.Server/appsettings.json` - Added Redis configuration ✅
- `/src/FChatBouncer.Server/appsettings.Development.json` - Added dev Redis config ✅
- `/src/FChatBouncer.Server/Program.cs` - Integrated Redis services ✅
- `/src/FChatBouncer.Server/TestRunner/Program.cs` - Added Redis test ✅

**Key Features Implemented**:
- Thread-safe connection pooling with automatic reconnection
- Exponential backoff retry strategy
- Comprehensive health monitoring
- Event-driven connection status tracking
- Environment variable support for production deployment
- Distributed cache integration for ASP.NET Core
- Ready for SignalR backplane (packages installed)

**Verification**:
- ✅ Project builds successfully with no errors
- ✅ Redis connection tested and verified
- ✅ Health check endpoint includes Redis status
- ✅ Connection factory tested with read/write/delete operations

**Documentation**: See `/REDIS_SETUP_COMPLETE.md` for detailed completion report.

---

### Task 1.2: Upgrade Logging Framework ✅ **COMPLETED**
**Priority**: High | **Estimated Time**: 6-8 hours | **Actual Time**: ~1.5 hours  
**Completed**: November 11, 2025

- [x] Replace Serilog configuration with structured approach
  - [x] Enhanced Serilog configuration
  - [x] Add `Serilog.Enrichers.Environment` (v3.0.1)
  - [x] Add `Serilog.Enrichers.Thread` (v4.0.0)
  - [x] Add `Serilog.Enrichers.Process` (v3.0.0)
  - [x] Add `Serilog.Expressions` (v5.0.0)
  
- [x] Create logging categories/contexts
  - [x] `LogCategories.cs` with 16+ category constants
  - [x] Application categories: Auth, FChatWebSocket, Messaging, SignalR, Characters, Profiles, etc.
  - [x] Infrastructure categories: Redis, Database, Infrastructure, BackgroundServices
  - [x] Framework categories: ASP.NET Core, EF Core, SignalR
  
- [x] Implement granular log levels per category
  - [x] Update `appsettings.json` with per-category log levels
  - [x] Update `appsettings.Development.json` for verbose dev logging
  - [x] **Per-sink log levels**: Console (Warning+) vs File (Information+) in production
  - [x] **EF Core query logging suppressed**: Set to Error level by default
  
- [x] Add correlation IDs for request tracking
  - [x] Create `CorrelationIdMiddleware` with X-Correlation-Id header support
  - [x] Add correlation ID to all log messages via LogContext
  - [x] Returns correlation ID in response headers
  - [x] Ready for SignalR connections (via HTTP context)
  
- [x] Create custom log extensions
  - [x] `ILogger` extension methods for common patterns (8+ methods)
  - [x] Performance logging: `TimeOperation()` with automatic duration tracking
  - [x] Security event logging: `LogSecurityEvent()`
  - [x] Protocol logging: `LogFChatMessage()`, `LogHubMethodInvocation()`
  - [x] Infrastructure logging: `LogDatabaseQuery()`, `LogRedisOperation()`, `LogExternalApiCall()`

**Files Created**:
- `/src/FChatBouncer.Server/Configuration/LogCategories.cs` ✅
- `/src/FChatBouncer.Server/Middleware/CorrelationIdMiddleware.cs` ✅
- `/src/FChatBouncer.Server/Extensions/LoggingExtensions.cs` ✅
- `/src/FChatBouncer.Server/Tests/LoggingConfigurationTest.cs` ✅

**Files Modified**:
- `/src/FChatBouncer.Server/FChatBouncer.Server.csproj` - Added Serilog enricher packages ✅
- `/src/FChatBouncer.Server/appsettings.json` - Enhanced Serilog configuration ✅
- `/src/FChatBouncer.Server/appsettings.Development.json` - Verbose dev logging ✅
- `/src/FChatBouncer.Server/Program.cs` - Enhanced Serilog setup + middleware ✅
- `/src/FChatBouncer.Server/TestRunner/Program.cs` - Added logging test ✅

**Key Features Implemented**:
- **Per-Sink Log Levels**: Console shows Warning+ (production), File shows Information+ (production)
- **Granular Category Control**: Each component (Auth, Redis, FChatWebSocket, etc.) independently configurable
- **EF Core Queries Suppressed**: Set to Error level, won't log queries in normal operation
- **Correlation ID Tracking**: Automatic request tracking with X-Correlation-Id header support
- **Rich Enrichment**: Machine name, environment, thread ID, process ID, application version
- **Structured Helpers**: 8+ extension methods for common logging patterns
- **Development Mode**: Console shows Debug+, File shows Trace+ for comprehensive debugging

**Verification**:
- ✅ Project builds successfully with no errors
- ✅ All new logging infrastructure compiles correctly
- ✅ Per-sink log levels working (Console vs File different)
- ✅ Per-category overrides working (EF Core suppressed, Redis verbose, etc.)
- ✅ Correlation ID middleware integrated into pipeline

**Usage Example**:
```csharp
// Automatic duration logging
using (_logger.TimeOperation("SendMessage")) {
    await SendAsync(message);
}

// F-Chat protocol logging
_logger.LogFChatMessage("Inbound", "MSG", characterName);

// Correlation IDs automatic in all logs
// [CorrelationId:a3f7c8d9e2b1] appears in every log entry for the request
```

**Documentation**: See `/LOGGING_UPGRADE_COMPLETE.md` for detailed completion report.

---

### Task 1.3: Add Security & Rate Limiting Libraries ✅ **COMPLETED**
**Priority**: High | **Estimated Time**: 3-4 hours | **Actual Time**: ~1.5 hours  
**Completed**: November 12, 2025

- [x] Add security NuGet packages
  - [x] `Microsoft.AspNetCore.DataProtection.StackExchangeRedis` (v9.0.0)
  - [x] `System.Threading.RateLimiting` (v9.0.0)
  - [x] `prometheus-net.AspNetCore` (v8.2.1)
  
- [x] Add encryption libraries
  - [x] `System.Security.Cryptography` (built-in AES-GCM)
  - [x] Create encryption service interface and implementation
  
- [x] Configure Key Vault integration (prepared)
  - [x] Create secrets service interface
  - [x] Environment variable-based secrets service (Key Vault integration in Phase 2)

**Files Created**:
- `/src/FChatBouncer.Server/Services/IEncryptionService.cs` ✅
- `/src/FChatBouncer.Server/Services/EncryptionService.cs` ✅
- `/src/FChatBouncer.Server/Services/ISecretsService.cs` ✅
- `/src/FChatBouncer.Server/Services/SecretsService.cs` ✅

**Files Updated**:
- `/src/FChatBouncer.Server/FChatBouncer.Server.csproj` ✅
- `/src/FChatBouncer.Server/Program.cs` ✅

**Key Features**:
- AES-256-GCM encryption with authenticated encryption
- Secure credential storage format
- Environment variable and configuration secret management
- Ready for Azure Key Vault / AWS Secrets Manager in Phase 2

---

### Task 1.4: Add Monitoring & Health Checks ✅ **COMPLETED**
**Priority**: Medium | **Estimated Time**: 4-5 hours | **Actual Time**: ~2 hours  
**Completed**: November 12, 2025

- [x] Expand health checks
  - [x] Add Redis health check ✅ **(COMPLETED 2025-11-11)**
  - [x] Add F-Chat WebSocket health check ✅
  - [x] Add F-List API health check ✅
  
- [x] Add metrics collection
  - [x] Add `prometheus-net.AspNetCore` package ✅
  - [x] Create custom metrics (20+ metrics across 8 categories) ✅
  - [x] Expose `/metrics` endpoint ✅
  - [x] Background service for metrics collection ✅
  
- [x] Setup observability infrastructure
  - [x] Prometheus metrics integration ✅
  - [x] HTTP request metrics ✅
  - [x] System metrics (memory, threads) ✅

**Files Created**:
- `/src/FChatBouncer.Server/HealthChecks/RedisHealthCheck.cs` ✅
- `/src/FChatBouncer.Server/HealthChecks/FChatWebSocketHealthCheck.cs` ✅
- `/src/FChatBouncer.Server/HealthChecks/FListApiHealthCheck.cs` ✅
- `/src/FChatBouncer.Server/Metrics/ApplicationMetrics.cs` ✅
- `/src/FChatBouncer.Server/Services/MetricsCollectionService.cs` ✅

**Files Updated**:
- `/src/FChatBouncer.Server/Program.cs` ✅
- `/src/FChatBouncer.Server/FChatBouncer.Server.csproj` ✅

**Metrics Categories**:
- Connection metrics (WebSocket, character, SignalR)
- Message metrics (sent, received, queued, processing time)
- Profile metrics (requests, queue, processing time)
- Database metrics (queries, duration)
- Redis metrics (operations, duration)
- F-List API metrics (calls, duration)
- Authentication metrics (attempts, sessions)
- System metrics (memory, threads, errors)

**Endpoints**:
- `GET /health` - Comprehensive health check (all 4 checks)
- `GET /metrics` - Prometheus metrics

---

## PHASE 2: Security & Encryption

### Task 2.1: Implement Proper Credential Encryption ✅ **COMPLETED**
**Priority**: Critical | **Estimated Time**: 8-10 hours | **Actual Time**: ~6 hours  
**Completed**: November 12, 2025

- [x] Design encryption strategy
  - [x] Standardized on AES-256-GCM with 32-byte keys sourced from environment variables or configuration (`Security:EncryptionKey`)
  - [x] Added operational guidance for key rotation, temporary dev keys, and logging expectations
- [x] Implement encryption service
  - [x] Added `IEncryptionService`/`EncryptionService` providing encrypt/decrypt helpers and credential utilities with integrity validation
  - [x] Introduced `ISecretsService`/`SecretsService` to centralize secret retrieval and prepare for Azure Key Vault integration
- [x] Update credential storage/retrieval
  - [x] `AuthController` now encrypts F-Chat credentials before persisting to `UserSettings`
  - [x] `FChatService` and `BouncerHub` decrypt credentials via `IEncryptionService`, with legacy Base64 fallback logged for remediation
  - [x] Registered encryption pipeline in `Program.cs` and added defensive logging/telemetry for missing keys
- [x] Documentation & migration prep
  - [x] Documented production requirements for `ENCRYPTION_KEY` and rotation workflow in this upgrade plan
  - [x] Captured follow-up migration steps for converting any remaining legacy credentials

**Files Created**:
- `src/FChatBouncer.Server/Services/IEncryptionService.cs`
- `src/FChatBouncer.Server/Services/EncryptionService.cs`
- `src/FChatBouncer.Server/Services/ISecretsService.cs`
- `src/FChatBouncer.Server/Services/SecretsService.cs`

**Files Updated**:
- `src/FChatBouncer.Server/Program.cs`
- `src/FChatBouncer.Server/Controllers/AuthController.cs`
- `src/FChatBouncer.Server/Services/FChatService.cs`
- `src/FChatBouncer.Server/Hubs/BouncerHub.cs`

---

### Task 2.2: Implement API Rate Limiting ✅ **COMPLETED**
**Priority**: High | **Estimated Time**: 6-8 hours | **Actual Time**: ~5 hours  
**Completed**: November 12, 2025

- [x] Configure rate limiting middleware
  - [x] Adopted .NET 8 partitioned rate limiting via `RateLimitPolicies.AddRateLimitingPolicies`
  - [x] Defined per-endpoint policies for authentication, registration, profile, search, channel refresh, messaging, and global quotas
  - [x] Centralized 429 responses with consistent retry metadata and JSON payloads
- [x] Implement custom rate limit strategies
  - [x] Instrumented login/registration/token refresh endpoints with `[EnableRateLimiting]`
  - [x] Coordinated REST limits with existing `IProfileRateLimiter` 30-second enforcement
  - [x] Added Redis-backed `SignalRRateLimiter` service for per-command hub quotas (hook-in scheduled for Phase 4 scale-out)
- [x] Add rate limit headers
  - [x] Added `RateLimitHeadersMiddleware` to surface `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After`
  - [x] Wired middleware after `UseRateLimiter()` to expose remaining quota to clients
- [x] Prepare distributed state & observability
  - [x] Leveraged shared `IConnectionMultiplexer` to persist limiter windows in Redis
  - [x] Exposed limiter metrics via Prometheus counters for dashboards

**Files Created**:
- `src/FChatBouncer.Server/Configuration/RateLimitPolicies.cs`
- `src/FChatBouncer.Server/Middleware/RateLimitHeadersMiddleware.cs`
- `src/FChatBouncer.Server/Middleware/SignalRRateLimiter.cs`

**Files Updated**:
- `src/FChatBouncer.Server/Program.cs`
- `src/FChatBouncer.Server/appsettings.json`
- `src/FChatBouncer.Server/Controllers/AuthController.cs`
- `src/FChatBouncer.Server/Controllers/FChatController.cs`

---

### Task 2.3: Enhance Authentication Security ✅ **COMPLETED**
**Priority**: High | **Estimated Time**: 5-6 hours | **Actual Time**: ~6 hours  
**Completed**: November 12, 2025

- [x] Strengthen JWT security
  - [x] Enforced issuer/audience validation with zero clock skew in `Program.cs`
  - [x] Implemented Redis-backed token invalidation via `RedisTokenBlacklistService` + `TokenBlacklistMiddleware`
  - [x] Routed login, logout, refresh, and credential updates through `AuditLogService` for security analytics
- [x] Enhance password requirements
  - [x] Centralized Identity password policy (length, digits, uppercase, symbols) in `Security` configuration
  - [x] Updated registration & credential update flows to timestamp `LastPasswordChange`
- [x] Harden Google OAuth security
  - [x] Added detailed error diagnostics, state validation logging, and correlation IDs on OAuth failures
  - [x] Secured state persistence with ASP.NET DataProtection + 30-minute server-side sessions
  - [x] Enforced HTTPS and cookie policies via configuration for production deployments

**Files Created**:
- `src/FChatBouncer.Server/Services/ITokenBlacklistService.cs`
- `src/FChatBouncer.Server/Services/RedisTokenBlacklistService.cs`
- `src/FChatBouncer.Server/Middleware/TokenBlacklistMiddleware.cs`

**Files Updated**:
- `src/FChatBouncer.Server/Program.cs`
- `src/FChatBouncer.Server/Controllers/AuthController.cs`
- `src/FChatBouncer.Server/Models/AuditLog.cs`

---

### Task 2.4: Implement Audit Logging ✅ **COMPLETED**
**Priority**: Medium | **Estimated Time**: 4-5 hours | **Actual Time**: ~7 hours  
**Completed**: November 12, 2025

- [x] Design audit log schema
  - [x] Added `AuditLog` entity with strongly-typed event/category constants
  - [x] Created EF migration `20251112164804_AddAuditLog` and updated `BouncerDbContext`
  - [x] Configured default retention (90 days) and cleanup schedule in configuration
- [x] Implement audit logging service
  - [x] Implemented `IAuditLogService`/`AuditLogService` with resilient write pipeline
  - [x] Added `AuditLogCleanupService` background worker to enforce retention automatically
- [x] Add audit logging to critical operations
  - [x] Instrumented login, logout, token refresh, and credential update flows with structured security events
  - [x] Defined event types for rate-limit, blacklist, and suspicious activity to enable future alerting and dashboards
- [x] Create audit log query API
  - [x] Added secured `AuditLogController` endpoints with pagination and filtering
  - [x] Surfaced audit metrics via Prometheus for monitoring volume and failures

**Files Created**:
- `src/FChatBouncer.Server/Models/AuditLog.cs`
- `src/FChatBouncer.Server/Services/IAuditLogService.cs`
- `src/FChatBouncer.Server/Services/AuditLogService.cs`
- `src/FChatBouncer.Server/Services/AuditLogCleanupService.cs`
- `src/FChatBouncer.Server/Controllers/AuditLogController.cs`
- `src/FChatBouncer.Server/Migrations/20251112164804_AddAuditLog.cs`
- `src/FChatBouncer.Server/Migrations/20251112164804_AddAuditLog.Designer.cs`

**Files Updated**:
- `src/FChatBouncer.Server/Program.cs`
- `src/FChatBouncer.Server/appsettings.json`
- `src/FChatBouncer.Server/Controllers/AuthController.cs`

---

## PHASE 3: Legacy Code Removal ✅ **COMPLETED**
**Completed**: November 11, 2025

### Task 3.1: Audit Legacy Code Usage ✅ **COMPLETED**
**Priority**: Critical | **Estimated Time**: 4-6 hours | **Actual Time**: ~1.5 hours

- [x] Document all legacy methods
  - [x] List all methods in `IFChatService` marked as legacy
  - [x] List all methods in `BouncerHub` using legacy calls
  - [x] List all controller endpoints using legacy calls
  
- [x] Identify frontend dependencies
  - [x] Search frontend codebase for legacy method calls
  - [x] Document which frontend components need updates
  - [x] Create frontend migration plan
  
- [x] Create migration mapping
  - [x] Map each legacy method to new equivalent
  - [x] Document parameter changes
  - [x] Document behavior changes

**Files Created**:
- `/PHASE3_LEGACY_AUDIT.md` ✅

---

### Task 3.2: Update Database Schema for Multi-Character Only ✅ **COMPLETED**
**Priority**: High | **Estimated Time**: 6-8 hours | **Actual Time**: ~1 hour

- [x] Analyze data migration needs
  - [x] Identify data in legacy structure
  - [x] Verify Character and CharacterConnection tables are sufficient
  - [x] Plan migration for existing connections
  
- [x] Create migration scripts
  - [x] Migrate any single-character user data to CharacterConnection model
  - [x] Ensure all users have at least one CharacterConnection
  - [x] Add NOT NULL constraints where appropriate
  
- [x] Remove legacy columns
  - [x] Remove unused columns from User table (if any)
  - [x] Remove unused indexes
  
- [x] Update EF Core models
  - [x] Remove any legacy navigation properties
  - [x] Update relationships to enforce multi-character model
  - [x] Add migration for schema changes

**Files Created**:
- `/src/FChatBouncer.Server/Migrations/20251111225211_RemoveProfileTable.cs` ✅
- `/src/FChatBouncer.Server/Migrations/20251111225211_RemoveProfileTable.Designer.cs` ✅

**Files Updated**:
- `/src/FChatBouncer.Server/Models/User.cs` ✅
- `/src/FChatBouncer.Server/Data/BouncerDbContext.cs` ✅

---

### Task 3.3: Remove Legacy FChatService Methods ✅ **COMPLETED**
**Priority**: High | **Estimated Time**: 8-10 hours | **Actual Time**: ~2 hours

- [x] Create wrapper/adapter pattern (temporary)
  - [x] Keep interface signatures temporarily
  - [x] Have legacy methods call new multi-char methods
  - [x] Add deprecation warnings in logs
  
- [x] Update all internal service calls
  - [x] Update `MessageService` to use new methods
  - [x] Update `ProfileService` to use new methods
  - [x] Update any other services using legacy methods
  
- [x] Mark legacy method implementations as obsolete
  - [x] Mark `ConnectUserAsync()` as [Obsolete] (use `ConnectCharacterAsync()`)
  - [x] Mark `DisconnectUserAsync()` as [Obsolete] (use `DisconnectCharacterAsync()`)
  - [x] Mark `SendMessageAsync(userId, channel, message)` as [Obsolete] (use char version)
  - [x] Mark `JoinChannelAsync(userId, channel)` as [Obsolete] (use char version)
  - [x] Mark `LeaveChannelAsync(userId, channel)` as [Obsolete] (use char version)
  - [x] Mark `SelectCharacterAsync()` as [Obsolete] (use `SetActiveCharacterAsync()`)
  - [x] Mark other single-character methods as obsolete
  
- [x] Update interface definition
  - [x] Mark legacy methods as [Obsolete] in `IFChatService` (15 methods)
  - [x] Ensure multi-character methods are the preferred API
  - [x] Update XML documentation

**Files Updated**:
- `/src/FChatBouncer.Server/Services/IFChatService.cs` ✅
- `/src/FChatBouncer.Server/Services/FChatService.cs` ✅
- `/src/FChatBouncer.Server/Services/MessageService.cs` ✅
- `/src/FChatBouncer.Server/Services/ProfileService.cs` ✅

---

### Task 3.4: Update SignalR Hub Methods ✅ **COMPLETED**
**Priority**: High | **Estimated Time**: 6-8 hours | **Actual Time**: ~2 hours

- [x] Mark legacy hub methods as obsolete
  - [x] Mark `SelectCharacter()` as [Obsolete] (use `SetActiveCharacter()`)
  - [x] Mark `SetSelectedCharacter()` as [Obsolete] (use `SetActiveCharacter()`)
  - [x] Mark `InitializeFChatConnection()` as [Obsolete] (use `ConnectCharacter()`)
  - [x] Mark `SendMessage()` as [Obsolete] (use `SendMessageFromCharacter()`)
  - [x] Mark `SubscribeToChannels()` as [Obsolete] (use `JoinChannelForCharacter()`)
  
- [x] Update remaining hub methods to use character context
  - [x] Update `OnConnectedAsync()` to use active character check
  - [x] Update all methods to validate character ownership
  - [x] Add logging for legacy API usage with `LogCategories.LegacyAPI`
  
- [x] Update hub event names for clarity
  - [x] Events match multi-character paradigm
  - [x] Update documentation
  
- [x] Add backward compatibility
  - [x] Legacy methods redirect to new implementations internally
  - [x] Add deprecation warnings in logs
  - [x] Maintain 100% backward compatibility

**Files Updated**:
- `/src/FChatBouncer.Server/Hubs/BouncerHub.cs` ✅

---

### Task 3.5: Update Controllers ✅ **COMPLETED**
**Priority**: Medium | **Estimated Time**: 4-5 hours | **Actual Time**: ~1 hour

- [x] Update FChatController
  - [x] Update `GetCharacters()` to use active character
  - [x] Update `SelectCharacter()` to use `SetActiveCharacterAsync()`
  - [x] Update `GetFChatStatus()` to check active character connection
  - [x] Ensure all endpoints use character-specific methods
  - [x] Add character name validation
  
- [x] Update CharacterController
  - [x] Verify all methods use new model
  - [x] Add multi-character support where needed
  
- [x] Maintain backward compatibility
  - [x] All endpoints still functional
  - [x] Clear upgrade path documented
  - [x] Logging for usage patterns

**Files Updated**:
- `/src/FChatBouncer.Server/Controllers/FChatController.cs` ✅
- `/src/FChatBouncer.Server/Controllers/CharacterController.cs` ✅

---

### Task 3.6: Remove Profile Table Duplication ✅ **COMPLETED**
**Priority**: Medium | **Estimated Time**: 5-6 hours | **Actual Time**: ~1.5 hours

- [x] Migrate profile data to Character table
  - [x] Profile data already being saved to Character.StructuredProfileData
  - [x] Verify data integrity after migration
  - [x] Test profile retrieval with new structure
  
- [x] Update ProfileService
  - [x] Remove methods that use Profile table
  - [x] Update to use Character.StructuredProfileData only
  - [x] Update caching to use Character records
  - [x] Mark legacy methods as [Obsolete]
  
- [x] Remove Profile table
  - [x] Create migration to drop Profile table
  - [x] Remove Profile DbSet from context
  - [x] Clean up navigation properties from User model

**Files Created**:
- `/src/FChatBouncer.Server/Migrations/20251111225211_RemoveProfileTable.cs` ✅
- `/src/FChatBouncer.Server/Migrations/20251111225211_RemoveProfileTable.Designer.cs` ✅
- `/PHASE3_DATABASE_MIGRATION_COMPLETE.md` ✅

**Files Updated**:
- `/src/FChatBouncer.Server/Services/ProfileService.cs` ✅
- `/src/FChatBouncer.Server/Data/BouncerDbContext.cs` ✅
- `/src/FChatBouncer.Server/Models/User.cs` ✅

**Note**: Profile.cs model kept for backward compatibility but no longer used with database.

---

## PHASE 4: Redis Integration

### Task 4.1: Implement Redis Caching Layer
**Priority**: High | **Estimated Time**: 8-10 hours

- [ ] Create caching service abstraction
  - [ ] Create `ICacheService` interface
  - [ ] Implement `RedisCacheService`
  - [ ] Add cache key generation helpers
  - [ ] Add cache invalidation patterns
  
- [ ] Implement distributed caching for common data
  - [ ] F-Chat ticket caching (replace in-memory `TicketManager`)
  - [ ] Character list caching
  - [ ] Channel list caching
  - [ ] User settings caching
  - [ ] Profile data caching
  
- [ ] Add cache-aside pattern implementation
  - [ ] Check cache first
  - [ ] Fetch from source if miss
  - [ ] Update cache
  - [ ] Handle cache stampede with locking
  
- [ ] Configure cache TTLs
  - [ ] Short TTL for volatile data (online status, etc.)
  - [ ] Medium TTL for semi-static data (character lists, etc.)
  - [ ] Long TTL for static data (character profiles, etc.)
  
- [ ] Add cache warming strategies
  - [ ] Warm cache on user login
  - [ ] Background cache refresh for popular data

**Files to Create**:
- `/src/FChatBouncer.Server/Services/ICacheService.cs`
- `/src/FChatBouncer.Server/Services/RedisCacheService.cs`
- `/src/FChatBouncer.Server/Infrastructure/CacheKeys.cs`
- `/src/FChatBouncer.Server/Infrastructure/CacheLock.cs`

**Files to Update**:
- `/src/FChatBouncer.Server/Services/TicketManager.cs` (refactor to use Redis)
- `/src/FChatBouncer.Server/Services/FChatService.cs` (add caching)
- `/src/FChatBouncer.Server/Services/ProfileService.cs` (add caching)
- `/src/FChatBouncer.Server/Services/CharacterService.cs` (add caching)

---

### Task 4.2a: Design & Setup Redis Streams Infrastructure
**Priority**: High | **Estimated Time**: 4-6 hours

- [ ] Create message models and stream entry DTOs
  - [ ] `StreamMessage` base class
  - [ ] `RoomMessage`, `DirectMessage`, `SystemEvent` classes
  - [ ] `StreamMessageEntry` for Redis XREAD results

- [ ] Design stream naming conventions and key structures
  - [ ] Document all stream key patterns
  - [ ] Define message schemas (JSON structure in stream)
  - [ ] Define consumer group naming conventions

- [ ] Create Redis Stream utilities
  - [ ] Connection management
  - [ ] Stream ID helpers
  - [ ] Message serialization (JSON)

**Files to Create**:
- `/src/FChatBouncer.Server/MessageQueue/StreamMessage.cs`
- `/src/FChatBouncer.Server/MessageQueue/RoomMessage.cs`
- `/src/FChatBouncer.Server/MessageQueue/DirectMessage.cs`
- `/src/FChatBouncer.Server/MessageQueue/SystemEvent.cs`
- `/src/FChatBouncer.Server/MessageQueue/StreamMessageEntry.cs`
- `/src/FChatBouncer.Server/MessageQueue/StreamKeys.cs`
- `/src/FChatBouncer.Server/MessageQueue/StreamIdHelper.cs`

---

### Task 4.2b: Implement Core Message Queue
**Priority**: High | **Estimated Time**: 8-10 hours

- [ ] Create message queue abstraction
  - [ ] `IMessageQueue` interface
  - [ ] `RedisStreamMessageQueue` implementation
  - [ ] Handle all XADD, XREAD, XACK, XINFO operations

- [ ] Implement publishing
  - [ ] Publish room messages
  - [ ] Publish direct messages
  - [ ] Publish system events
  - [ ] Handle message serialization

- [ ] Implement consuming
  - [ ] XREADGROUP for consumer groups
  - [ ] Create consumer groups on demand
  - [ ] Handle message deserialization
  - [ ] Track consumer offsets

- [ ] Implement acknowledgment
  - [ ] XACK for confirmed delivery
  - [ ] PEL (Pending Entry List) monitoring
  - [ ] Retry logic for unacknowledged messages

**Files to Create**:
- `/src/FChatBouncer.Server/MessageQueue/IMessageQueue.cs`
- `/src/FChatBouncer.Server/MessageQueue/RedisStreamMessageQueue.cs`

---

### Task 4.2c: Create High-Level Message Service
**Priority**: High | **Estimated Time**: 6-8 hours

- [ ] Design message queue service layer
  - [ ] `IMessageQueueService` interface
  - [ ] `MessageQueueService` implementation

- [ ] Implement room message operations
  - [ ] Publish to room
  - [ ] Get room messages
  - [ ] Acknowledge room messages

- [ ] Implement direct message operations
  - [ ] Publish direct messages
  - [ ] Get direct message conversations
  - [ ] Acknowledge direct messages

- [ ] Implement reconnection logic
  - [ ] Get missed messages on reconnect
  - [ ] Replay from specific offset
  - [ ] Handle PEL (redelivery)

**Files to Create**:
- `/src/FChatBouncer.Server/Services/IMessageQueueService.cs`
- `/src/FChatBouncer.Server/Services/MessageQueueService.cs`

---

### Task 4.2d: Integrate with SignalR Hub
**Priority**: High | **Estimated Time**: 6-8 hours

- [ ] Update BouncerHub to use message queue
  - [ ] On user joining room: Register consumer group + get messages
  - [ ] On message from F-Chat: Publish to stream
  - [ ] On client disconnect: Persist offset (don't cleanup)
  - [ ] On client reconnect: Retrieve from offset

- [ ] Implement flow control
  - [ ] Batch message delivery to clients
  - [ ] Handle backpressure from slow clients
  - [ ] Rate limiting to prevent overwhelming connections

- [ ] Add deduplication support
  - [ ] Client tracks delivery tags
  - [ ] Server retries on failed ACK
  - [ ] Idempotent client-side handling

**Files to Update**:
- `/src/FChatBouncer.Server/Hubs/BouncerHub.cs`

---

### Task 4.2e: Background Services & Cleanup
**Priority**: Medium | **Estimated Time**: 4-6 hours

- [ ] Create stream retention cleanup service
  - [ ] Trim old messages based on TTL/max length
  - [ ] Run periodically (hourly or daily)
  - [ ] Configurable retention policy

- [ ] Create stream monitoring service
  - [ ] Monitor stream sizes
  - [ ] Track consumer lag
  - [ ] Alert on anomalies

- [ ] Implement PEL monitoring
  - [ ] Check for stale messages in pending list
  - [ ] Attempt redelivery with backoff
  - [ ] Dead letter queue for permanently failed messages

**Files to Create**:
- `/src/FChatBouncer.Server/BackgroundServices/StreamRetentionService.cs`
- `/src/FChatBouncer.Server/BackgroundServices/StreamMonitoringService.cs`
- `/src/FChatBouncer.Server/BackgroundServices/PendingEntryListProcessor.cs`

---

### Task 4.2f: Testing & Validation
**Priority**: High | **Estimated Time**: 8-10 hours

- [ ] Unit tests
  - [ ] Message publication tests
  - [ ] Consumer group offset tests
  - [ ] Message replay tests
  - [ ] Deduplication tests

- [ ] Integration tests
  - [ ] Multi-user scenarios
  - [ ] Reconnection scenarios
  - [ ] Stream retention cleanup

- [ ] Load tests
  - [ ] High message volume
  - [ ] Many concurrent consumers
  - [ ] Large stream sizes (millions of messages)

- [ ] Manual testing
  - [ ] Disconnect/reconnect flow
  - [ ] Verify offset tracking
  - [ ] Verify message order

**Files to Create**:
- `/src/FChatBouncer.Server/Tests/MessageQueueTests.cs`
- `/src/FChatBouncer.Server/Tests/ConsumerGroupTests.cs`
- `/src/FChatBouncer.Server/Tests/RedisStreamIntegrationTests.cs`

---

### Task 4.2g: Documentation & Configuration
**Priority**: Medium | **Estimated Time**: 2-3 hours

- [ ] Add configuration options
  - [ ] Stream retention policy (TTL / max messages)
  - [ ] Consumer group cleanup behavior
  - [ ] Batch sizes and timeouts

- [ ] Document operational procedures
  - [ ] Monitoring dashboards
  - [ ] Stream size monitoring
  - [ ] Consumer lag monitoring
  - [ ] Debugging commands

- [ ] Add metrics/observability
  - [ ] Messages published per stream
  - [ ] Messages consumed per consumer group
  - [ ] Consumer lag per consumer
  - [ ] PEL size

**Files to Update**:
- `/appsettings.json` (add configuration section)
- `/src/FChatBouncer.Server/Program.cs` (register background services)

---

### Task 4.3: Add SignalR Redis Backplane
**Priority**: High | **Estimated Time**: 4-6 hours

- [ ] Configure SignalR with Redis backplane
  - [ ] Add `Microsoft.AspNetCore.SignalR.StackExchangeRedis` package
  - [ ] Configure in `Program.cs`
  - [ ] Set Redis channel prefix
  
- [ ] Test multi-instance SignalR
  - [ ] Setup multiple server instances
  - [ ] Test message broadcast across instances
  - [ ] Test user-specific messages across instances
  
- [ ] Add scale-out considerations
  - [ ] Configure sticky sessions if needed
  - [ ] Test connection reconnection
  - [ ] Test failover scenarios

**Files to Update**:
- `/src/FChatBouncer.Server/Program.cs`
- `/docker-compose.yml` (add multiple server instances for testing)

---

### Task 4.4: Migrate WebSocket State to Redis
**Priority**: High | **Estimated Time**: 12-15 hours

- [ ] Design distributed state schema
  - [ ] Define state structure for WebSocket connections
  - [ ] Define state structure for active characters
  - [ ] Define state structure for joined channels
  - [ ] Define TTL and expiration strategy
  
- [ ] Create distributed state service
  - [ ] Create `IWebSocketStateService` interface
  - [ ] Implement `RedisWebSocketStateService`
  - [ ] Add connection state management
  - [ ] Add character state management
  - [ ] Add channel state management
  
- [ ] Refactor FChatService to use distributed state
  - [ ] Replace in-memory dictionaries with Redis calls
  - [ ] Update `IsUserConnectedAsync()` to check Redis
  - [ ] Update `GetActiveCharacterAsync()` to check Redis
  - [ ] Update `GetJoinedChannelsAsync()` to check Redis
  - [ ] Update all state management methods
  
- [ ] Implement state synchronization
  - [ ] Sync state to Redis on changes
  - [ ] Sync state from Redis on server startup
  - [ ] Handle state conflicts (last-write-wins or version-based)
  
- [ ] Add state cleanup
  - [ ] Cleanup stale connections on server shutdown
  - [ ] Cleanup expired state periodically
  - [ ] Add background job for state maintenance

**Files to Create**:
- `/src/FChatBouncer.Server/Services/IWebSocketStateService.cs`
- `/src/FChatBouncer.Server/Services/RedisWebSocketStateService.cs`
- `/src/FChatBouncer.Server/Models/WebSocketConnectionState.cs`
- `/src/FChatBouncer.Server/BackgroundServices/StateCleanupService.cs`

**Files to Update**:
- `/src/FChatBouncer.Server/Services/FChatService.cs` (major refactor)
- `/src/FChatBouncer.Server/Services/FChatWebSocketClient.cs`

---

### Task 4.5: Implement Distributed Locking
**Priority**: Medium | **Estimated Time**: 4-5 hours

- [ ] Add distributed locking library
  - [ ] Add `RedLock.net` package or use native Redis locks
  - [ ] Create lock manager service
  
- [ ] Implement locking for critical sections
  - [ ] Lock during character connection
  - [ ] Lock during profile updates
  - [ ] Lock during message queue processing
  
- [ ] Add lock timeout and retry logic
  - [ ] Configure lock timeouts
  - [ ] Add retry with exponential backoff
  - [ ] Add lock monitoring

**Files to Create**:
- `/src/FChatBouncer.Server/Infrastructure/IDistributedLockManager.cs`
- `/src/FChatBouncer.Server/Infrastructure/RedisLockManager.cs`

---

## PHASE 5: Testing & Optimization

### Task 5.1: Write Comprehensive Unit Tests
**Priority**: High | **Estimated Time**: 15-20 hours

- [ ] Setup testing infrastructure
  - [ ] Add `xUnit` or `NUnit` test project
  - [ ] Add `Moq` for mocking
  - [ ] Add `FluentAssertions` for readable assertions
  - [ ] Add `Testcontainers` for integration tests with Redis/PostgreSQL
  
- [ ] Write service layer tests
  - [ ] Test `EncryptionService` (encryption/decryption, key rotation)
  - [ ] Test `RedisCacheService` (cache operations, invalidation)
  - [ ] Test `RedisMessageBus` (pub/sub operations)
  - [ ] Test `FChatService` (connection management, state management)
  - [ ] Test `MessageService` (message saving, retrieval, queueing)
  - [ ] Test `CharacterService` (CRUD operations)
  - [ ] Test `ProfileService` (caching, queue management)
  - [ ] Test `UserService` (user operations, settings)
  
- [ ] Write controller tests
  - [ ] Test `AuthController` endpoints
  - [ ] Test `FChatController` endpoints
  - [ ] Test `CharacterController` endpoints
  - [ ] Test error handling and validation
  
- [ ] Write SignalR hub tests
  - [ ] Test connection lifecycle
  - [ ] Test message sending/receiving
  - [ ] Test character management
  - [ ] Test channel operations
  
- [ ] Achieve minimum 80% code coverage
  - [ ] Run code coverage reports
  - [ ] Identify gaps
  - [ ] Write additional tests

**Files to Create**:
- `/src/FChatBouncer.Server.Tests/FChatBouncer.Server.Tests.csproj`
- `/src/FChatBouncer.Server.Tests/Services/EncryptionServiceTests.cs`
- `/src/FChatBouncer.Server.Tests/Services/RedisCacheServiceTests.cs`
- `/src/FChatBouncer.Server.Tests/Services/FChatServiceTests.cs`
- `/src/FChatBouncer.Server.Tests/Services/MessageServiceTests.cs`
- `/src/FChatBouncer.Server.Tests/Controllers/AuthControllerTests.cs`
- `/src/FChatBouncer.Server.Tests/Hubs/BouncerHubTests.cs`
- `/src/FChatBouncer.Server.Tests/Integration/RedisIntegrationTests.cs`

---

### Task 5.2: Write Integration Tests
**Priority**: Medium | **Estimated Time**: 10-12 hours

- [ ] Setup integration test infrastructure
  - [ ] Configure `WebApplicationFactory` for testing
  - [ ] Setup test containers for Redis and PostgreSQL
  - [ ] Create test data fixtures
  
- [ ] Write end-to-end flow tests
  - [ ] Test full authentication flow
  - [ ] Test F-Chat connection flow
  - [ ] Test message sending/receiving flow
  - [ ] Test profile request flow
  - [ ] Test multi-character switching flow
  
- [ ] Write Redis integration tests
  - [ ] Test caching operations
  - [ ] Test pub/sub operations
  - [ ] Test SignalR backplane
  - [ ] Test distributed state management
  
- [ ] Write database integration tests
  - [ ] Test migrations
  - [ ] Test complex queries
  - [ ] Test transactions

**Files to Create**:
- `/src/FChatBouncer.Server.IntegrationTests/FChatBouncer.Server.IntegrationTests.csproj`
- `/src/FChatBouncer.Server.IntegrationTests/AuthenticationFlowTests.cs`
- `/src/FChatBouncer.Server.IntegrationTests/FChatConnectionFlowTests.cs`
- `/src/FChatBouncer.Server.IntegrationTests/MessageFlowTests.cs`
- `/src/FChatBouncer.Server.IntegrationTests/RedisIntegrationTests.cs`

---

### Task 5.3: Performance Testing
**Priority**: Medium | **Estimated Time**: 8-10 hours

- [ ] Setup performance testing tools
  - [ ] Add `BenchmarkDotNet` for micro-benchmarks
  - [ ] Setup `k6` or `Artillery` for load testing
  - [ ] Setup `dotnet-counters` for performance monitoring
  
- [ ] Write micro-benchmarks
  - [ ] Benchmark encryption/decryption
  - [ ] Benchmark Redis operations
  - [ ] Benchmark database queries
  - [ ] Benchmark message serialization
  
- [ ] Create load test scenarios
  - [ ] Test concurrent user connections
  - [ ] Test message throughput
  - [ ] Test profile request load
  - [ ] Test multi-character scenarios
  
- [ ] Identify and fix performance bottlenecks
  - [ ] Profile application under load
  - [ ] Optimize slow queries
  - [ ] Optimize hot code paths
  - [ ] Add caching where beneficial

**Files to Create**:
- `/src/FChatBouncer.Server.Benchmarks/EncryptionBenchmarks.cs`
- `/src/FChatBouncer.Server.Benchmarks/RedisBenchmarks.cs`
- `/tests/load/k6-scenarios.js`
- `/tests/load/artillery-config.yml`

---

### Task 5.4: Database Optimization
**Priority**: Medium | **Estimated Time**: 6-8 hours

- [ ] Analyze query performance
  - [ ] Enable query logging in dev
  - [ ] Identify slow queries
  - [ ] Use `EXPLAIN ANALYZE` on slow queries
  
- [ ] Add missing indexes
  - [ ] Add composite indexes for common queries
  - [ ] Add covering indexes where beneficial
  - [ ] Remove unused indexes
  
- [ ] Implement table partitioning
  - [ ] Partition Messages table by date (monthly)
  - [ ] Setup automatic partition creation
  - [ ] Test query performance on partitioned tables
  
- [ ] Optimize data retention
  - [ ] Implement automatic archival of old messages
  - [ ] Move archived data to cold storage
  - [ ] Test restoration process

**Files to Create**:
- `/scripts/create-message-partitions.sql`
- `/scripts/archive-old-messages.sql`
- `/src/FChatBouncer.Server/BackgroundServices/MessageArchivalService.cs`

**Files to Update**:
- `/src/FChatBouncer.Server/Data/BouncerDbContext.cs` (add indexes)

---

### Task 5.5: Update Documentation
**Priority**: Medium | **Estimated Time**: 8-10 hours

- [ ] Update architecture documentation
  - [ ] Update `backend.md` with new architecture
  - [ ] Document Redis integration
  - [ ] Document message queue flow
  - [ ] Update sequence diagrams
  
- [ ] Create API documentation
  - [ ] Add Swagger/OpenAPI annotations
  - [ ] Document all endpoints
  - [ ] Add request/response examples
  - [ ] Document rate limits
  
- [ ] Create developer documentation
  - [ ] Setup guide (local development)
  - [ ] Architecture overview
  - [ ] Contributing guidelines
  - [ ] Code style guide
  
- [ ] Create operations documentation
  - [ ] Deployment guide
  - [ ] Monitoring guide
  - [ ] Troubleshooting guide
  - [ ] Backup and recovery procedures

**Files to Create**:
- `/docs/api-documentation.md`
- `/docs/developer-guide.md`
- `/docs/operations-guide.md`
- `/docs/deployment-guide.md`

**Files to Update**:
- `/backend.md`
- `/README.md`

---

## PHASE 6: Deployment & Migration

### Task 6.1: Prepare Staging Environment
**Priority**: High | **Estimated Time**: 6-8 hours

- [ ] Setup staging infrastructure
  - [ ] Provision Redis instance (staging)
  - [ ] Provision PostgreSQL instance (staging)
  - [ ] Setup application servers (staging)
  - [ ] Configure load balancer
  
- [ ] Configure monitoring
  - [ ] Setup Application Insights/CloudWatch
  - [ ] Configure alerts
  - [ ] Setup dashboards
  - [ ] Configure log aggregation
  
- [ ] Deploy to staging
  - [ ] Build Docker images
  - [ ] Deploy application
  - [ ] Run database migrations
  - [ ] Verify deployment

---

### Task 6.2: Data Migration Planning
**Priority**: Critical | **Estimated Time**: 6-8 hours

- [ ] Create migration plan
  - [ ] List all data to be migrated
  - [ ] Define migration order
  - [ ] Define downtime window
  - [ ] Create rollback plan
  
- [ ] Create migration scripts
  - [ ] Script to migrate credentials with new encryption
  - [ ] Script to migrate to multi-character model
  - [ ] Script to migrate profiles to Character table
  - [ ] Script to verify data integrity
  
- [ ] Test migration in staging
  - [ ] Copy production data to staging
  - [ ] Run migration scripts
  - [ ] Verify data integrity
  - [ ] Test rollback
  
- [ ] Document migration procedure
  - [ ] Step-by-step migration guide
  - [ ] Rollback procedure
  - [ ] Verification checklist

**Files to Create**:
- `/scripts/migration/01-migrate-credentials.sql`
- `/scripts/migration/02-migrate-to-multichar.sql`
- `/scripts/migration/03-migrate-profiles.sql`
- `/scripts/migration/verify-migration.sql`
- `/scripts/migration/rollback.sql`
- `/docs/migration-procedure.md`

---

### Task 6.3: Staged Rollout Plan
**Priority**: High | **Estimated Time**: 4-6 hours

- [ ] Define rollout stages
  - [ ] Stage 1: Deploy to staging, test thoroughly
  - [ ] Stage 2: Deploy to production with feature flags
  - [ ] Stage 3: Enable new features for subset of users (10%)
  - [ ] Stage 4: Expand to 50% of users
  - [ ] Stage 5: Enable for all users
  - [ ] Stage 6: Remove feature flags and legacy code
  
- [ ] Implement feature flags
  - [ ] Add feature flag library (`Microsoft.FeatureManagement`)
  - [ ] Configure feature flags in `appsettings.json`
  - [ ] Add feature flag checks to new code
  - [ ] Add A/B testing capability
  
- [ ] Define rollout success criteria
  - [ ] Error rate thresholds
  - [ ] Performance thresholds
  - [ ] User feedback thresholds
  
- [ ] Create rollback triggers
  - [ ] Automated rollback on high error rate
  - [ ] Manual rollback procedure
  - [ ] Communication plan

**Files to Create**:
- `/docs/rollout-plan.md`
- `/src/FChatBouncer.Server/Configuration/FeatureFlags.cs`

---

### Task 6.4: Production Deployment
**Priority**: Critical | **Estimated Time**: 8-10 hours

- [ ] Pre-deployment checklist
  - [ ] All tests passing
  - [ ] Code review completed
  - [ ] Security audit completed
  - [ ] Performance testing completed
  - [ ] Documentation updated
  - [ ] Rollback plan ready
  
- [ ] Deploy to production
  - [ ] Schedule maintenance window
  - [ ] Notify users of maintenance
  - [ ] Take database backup
  - [ ] Deploy application
  - [ ] Run database migrations
  - [ ] Verify deployment
  - [ ] Enable monitoring
  
- [ ] Post-deployment verification
  - [ ] Run smoke tests
  - [ ] Verify all endpoints responding
  - [ ] Check error rates
  - [ ] Check performance metrics
  - [ ] Monitor user feedback
  
- [ ] Gradual feature enablement
  - [ ] Enable new features for test users
  - [ ] Monitor for issues
  - [ ] Expand to more users
  - [ ] Fully enable new features

---

### Task 6.5: Post-Deployment Monitoring
**Priority**: High | **Estimated Time**: Ongoing

- [ ] Monitor system health
  - [ ] Track error rates
  - [ ] Track performance metrics
  - [ ] Track resource utilization
  - [ ] Track Redis metrics
  
- [ ] Monitor business metrics
  - [ ] Track active users
  - [ ] Track message volume
  - [ ] Track connection success rate
  - [ ] Track feature adoption
  
- [ ] Gather user feedback
  - [ ] Setup feedback mechanism
  - [ ] Monitor support tickets
  - [ ] Conduct user surveys
  
- [ ] Iterate and improve
  - [ ] Address issues found
  - [ ] Optimize based on metrics
  - [ ] Plan next improvements

---

## Summary Checklist

### Phase 1: Infrastructure ✅ **(COMPLETE 4/4)**
- [x] Redis infrastructure setup ✅ **(COMPLETED 2025-11-11)**
- [x] Logging framework upgrade ✅ **(COMPLETED 2025-11-11)**
- [x] Security libraries added ✅ **(COMPLETED 2025-11-12)**
- [x] Monitoring and health checks ✅ **(COMPLETED 2025-11-12)**

### Phase 2: Security ✅ **(COMPLETED 2025-11-12)**
- [x] Proper credential encryption
- [x] API rate limiting
- [x] Enhanced authentication
- [x] Audit logging

### Phase 3: Legacy Removal ✅ **(COMPLETED 2025-11-11)**
- [x] Legacy code audit ✅
- [x] Database schema update ✅
- [x] FChatService methods marked obsolete ✅
- [x] SignalR hub methods updated ✅
- [x] Controllers updated ✅
- [x] Profile table removed ✅

### Phase 4: Redis Integration ✓
- [ ] Redis caching layer
- [ ] Redis pub/sub message queue
- [ ] SignalR Redis backplane
- [ ] WebSocket state in Redis
- [ ] Distributed locking

### Phase 5: Testing ✓
- [ ] Unit tests (80%+ coverage)
- [ ] Integration tests
- [ ] Performance testing
- [ ] Database optimization
- [ ] Documentation updates

### Phase 6: Deployment ✓
- [ ] Staging environment
- [ ] Data migration
- [ ] Staged rollout
- [ ] Production deployment
- [ ] Post-deployment monitoring

---

## Estimated Timeline

- **Phase 1**: 1 week (2-3 days with focused effort)
- **Phase 2**: 1 week (3-4 days with focused effort)
- **Phase 3**: 2 weeks (need to coordinate with frontend team)
- **Phase 4**: 2 weeks (most complex phase)
- **Phase 5**: 1 week (can be done in parallel with Phase 4)
- **Phase 6**: 1 week (includes rollout monitoring)

**Total Estimated Time**: 8 weeks (6 weeks with parallel work and focused effort)

---

## Risk Mitigation

### High-Risk Areas
1. **Data Migration**: Loss of user data or credentials
   - **Mitigation**: Comprehensive backups, test migrations in staging, have rollback plan
   
2. **Redis Failure**: Loss of state if Redis goes down
   - **Mitigation**: Redis persistence enabled, graceful degradation to database, health checks
   
3. **WebSocket State Migration**: Loss of active connections
   - **Mitigation**: Gradual migration, keep database as source of truth initially, monitor closely
   
4. **Performance Degradation**: New architecture slower than old
   - **Mitigation**: Thorough performance testing, benchmarking, monitoring, rollback plan

### Medium-Risk Areas
1. **Frontend Breaking Changes**: Frontend not compatible with new backend
   - **Mitigation**: Feature flags, gradual rollout, maintain backward compatibility initially
   
2. **Rate Limiting Too Aggressive**: Users blocked unexpectedly
   - **Mitigation**: Start with lenient limits, monitor, adjust based on data
   
3. **Encryption Key Management**: Lost encryption keys
   - **Mitigation**: Key backup procedures, key rotation testing, documentation

---

## Success Metrics

### Technical Metrics
- **99.9%** uptime
- **< 100ms** API response time (p95)
- **< 500ms** message delivery latency (p95)
- **80%+** test coverage
- **0** critical security vulnerabilities
- **< 1%** error rate

### Business Metrics
- **95%+** user retention during migration
- **< 5%** increase in support tickets
- **50%+** adoption of multi-character features (where applicable)
- **Positive** user feedback on performance improvements

---

## Conclusion

This comprehensive upgrade plan will modernize the F-ChatBouncer backend by:
1. Removing technical debt (legacy code)
2. Improving scalability (Redis distributed state)
3. Enhancing security (proper encryption, rate limiting)
4. Improving observability (granular logging, metrics)

The phased approach with feature flags and staged rollout minimizes risk while allowing for quick rollback if issues arise. With proper testing and monitoring, this upgrade will provide a solid foundation for future growth.

