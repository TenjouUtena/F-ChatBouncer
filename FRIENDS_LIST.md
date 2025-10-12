# Friends List System Documentation

## Overview

The F-ChatBouncer friends list system manages friend and bookmark lists by syncing data from F-Chat servers, caching it in the backend, and broadcasting updates to the frontend via SignalR. The system handles both real-time status updates (online/offline, status changes) and initial friend list loading.

## System Architecture

```
F-Chat Server (WebSocket)
    ↓
FChatWebSocketClient (Backend)
    ↓
FChatService (Backend Orchestration)
    ↓
SignalR Hub (Real-time Communication)
    ↓
Frontend (React + Zustand Stores)
    ↓
UI Components (FriendsList.tsx)
```

## Data Flow

### 1. Initial Friend List Loading

When a character connects to F-Chat:

1. **Backend Connection** (`FChatWebSocketClient.ConnectAsync`)
   - Authenticates with F-Chat API
   - Receives initial friends and bookmarks list from authentication ticket response
   - Stores in `_friendsList` and `_bookmarksList` (just names, no status)

2. **FRL Command Reception** (Friends List)
   - F-Chat sends `FRL` command with complete friends list
   - Handler: `FChatWebSocketClient.HandleFriendsListResponse()`
   - Parses friends list from `characters` array
   - Creates `Friend` objects with offline status initially
   - Fires `FriendsListReceived` event

3. **LIS Command Reception** (List of Online Characters)
   - F-Chat sends `LIS` command with all online characters and their statuses
   - Handler: `FChatWebSocketClient.HandleOnlineCharactersList()`
   - Updates `_onlineCharactersCache` with current online characters
   - Fires `OnlineCharactersListReceived` event

4. **Backend Processing** (`FChatService.OnFriendsListReceived`)
   - Receives friends list from WebSocket client
   - Updates `FChatWebSocketClient.UpdateFriendsListWithStatus()` with full friend data
   - Stores friends with status in `_friendsWithStatus` dictionary
   - Broadcasts `FriendsListUpdated` SignalR event to frontend

5. **Backend Online Status Update** (`FChatService.OnOnlineCharactersListReceived`)
   - Receives online characters list
   - Updates unified character store in database
   - Calls `FChatWebSocketClient.UpdateFriendsListWithOnlineStatus()` to merge online status with friends
   - Updates friends with online status and caches the result
   - Broadcasts `OnlineCharactersUpdated` SignalR event

6. **Frontend Reception** (`page.tsx: connectToSignalR`)
   - Listens for `FriendsListUpdated` SignalR event
   - On reception, calls `api.getFriends()` to fetch complete friend data
   - Updates `friendsStore` via `setFriendsAndBookmarks()`
   - Updates are persisted to localStorage via Zustand persist middleware

### 2. Real-time Status Updates

#### Friend Comes Online

1. **F-Chat sends NLN (New character online) command**
   - Handler: `FChatWebSocketClient.HandleUserOnline()`
   - Extracts character name, status, gender from `identity` field
   - Updates `_onlineCharactersCache`
   - Fires `UserOnline` event

2. **Backend broadcasts update** (`FChatService.OnUserOnline`)
   - Updates unified character store (batched)
   - Updates character gender if provided
   - Broadcasts `UserOnline` SignalR event with character data

3. **Frontend updates** (`page.tsx: signalRService.onUserOnline`)
   - Checks if character is a friend/bookmark via `isFriendOrBookmark()`
   - Updates `friendsStore.setFriendOnline()` to set `isOnline = true`
   - Updates friend status if provided

#### Friend Goes Offline

1. **F-Chat sends FLN (character went offline) command**
   - Handler: `FChatWebSocketClient.HandleUserOffline()`
   - Extracts character name from `character` field
   - Removes from `_onlineCharactersCache`
   - Fires `UserOffline` event

2. **Backend broadcasts update** (`FChatService.OnUserOffline`)
   - Updates unified character store (batched)
   - Sets status to "offline" and `isOnline = false`
   - Broadcasts `UserOffline` SignalR event

3. **Frontend updates** (`page.tsx: signalRService.onUserOffline`)
   - Checks if character is a friend/bookmark
   - Updates `friendsStore.setFriendOnline()` to set `isOnline = false`
   - Sets `lastSeen` timestamp

#### Status Change (Friend is already online)

1. **F-Chat sends STA (Status update) command**
   - Handler: `FChatWebSocketClient.HandleStatusUpdate()`
   - Updates `_onlineCharactersCache` with new status
   - Fires `StatusUpdated` event

2. **Backend broadcasts update** (`FChatService.OnStatusUpdated`)
   - Updates unified character store (batched)
   - Broadcasts `StatusUpdated` SignalR event with status details

3. **Frontend updates** (`page.tsx: signalRService.onStatusUpdated`)
   - Updates `lightweightCharacterStore` for all characters
   - If character is friend/bookmark, also updates `friendsStore.updateFriendStatus()`

### 3. Bookmark Management

#### Adding a Bookmark

1. **User clicks "Add Bookmark"** in context menu
2. **Frontend calls** `api.addBookmark(token, characterName)`
3. **Backend endpoint** (`FChatController.AddBookmark`)
   - Calls `FChatService.AddBookmarkAsync()`
4. **Backend WebSocket** (`FChatWebSocketClient.AddBookmarkAsync`)
   - Makes HTTPS POST to F-List API bookmark endpoint
   - Adds to local `_bookmarksList` and `_friendsList`
   - Creates initial bookmark entry in `_bookmarksWithStatus` (offline)
   - Broadcasts `BookmarkAdded` SignalR event
5. **Frontend updates** (`page.tsx: signalRService.setBookmarkCallbacks`)
   - Adds bookmark to `friendsStore.addBookmark()`

#### Removing a Bookmark

1. **User clicks "Remove Bookmark"** in context menu
2. **Frontend calls** `api.removeBookmark(token, characterName)`
3. **Backend endpoint** (`FChatController.RemoveBookmark`)
   - Calls `FChatService.RemoveBookmarkAsync()`
4. **Backend WebSocket** (`FChatWebSocketClient.RemoveBookmarkAsync`)
   - Makes HTTPS POST to F-List API bookmark removal endpoint
   - Removes from local `_bookmarksList` and `_friendsList`
   - Broadcasts `BookmarkRemoved` SignalR event
5. **Frontend updates**
   - Removes bookmark from `friendsStore.removeBookmark()`

## Backend Components

### FChatWebSocketClient.cs

**Purpose**: Manages WebSocket connection to F-Chat servers

**Key Data Structures**:
```csharp
private List<string> _friendsList = [];  // Just names
private List<string> _bookmarksList = [];  // Just names
private Dictionary<string, Friend> _friendsWithStatus = new();  // Friends with full data
private Dictionary<string, Friend> _bookmarksWithStatus = new();  // Bookmarks with full data
private ConcurrentDictionary<string, FChatCharacter> _onlineCharactersCache = new();  // All online characters
```

**Key Methods**:
- `ConnectAsync()`: Establishes connection and loads initial friend/bookmark lists from ticket
- `GetFriendsList()`: Returns list of friend names
- `GetFriendsWithStatus()`: Returns friends with online status data
- `UpdateFriendsListWithStatus()`: Updates friends list when FRL is received
- `UpdateFriendsListWithOnlineStatus()`: Merges LIS data with friends list
- `UpdateFriendsListFromCache()`: Updates friends using cached online characters

**Event Handlers**:
- `HandleFriendsListResponse()`: Processes FRL command from F-Chat
- `HandleOnlineCharactersList()`: Processes LIS command from F-Chat
- `HandleUserOnline()`: Processes NLN command (character comes online)
- `HandleUserOffline()`: Processes FLN command (character goes offline)
- `HandleStatusUpdate()`: Processes STA command (status change)

**Events Fired**:
- `FriendsListReceived`: Complete friends list with status
- `OnlineCharactersListReceived`: All online characters
- `UserOnline`: Character came online
- `UserOffline`: Character went offline
- `StatusUpdated`: Character status changed

### FChatService.cs

**Purpose**: Orchestrates F-Chat connections and manages SignalR broadcasting

**Key Methods**:
- `GetFriendsAndBookmarksAsync()`: Returns friends, bookmarks, and bookmarks with status for a user
- `AddBookmarkAsync()`: Adds a bookmark via F-List API
- `RemoveBookmarkAsync()`: Removes a bookmark via F-List API

**Event Handlers** (subscribed to FChatWebSocketClient events):
- `OnFriendsListReceived()`: Broadcasts `FriendsListUpdated` to SignalR clients
- `OnOnlineCharactersListReceived()`: Updates database and broadcasts `OnlineCharactersUpdated`
- `OnUserOnline()`: Broadcasts `UserOnline` to SignalR clients
- `OnUserOffline()`: Broadcasts `UserOffline` to SignalR clients
- `OnStatusUpdated()`: Broadcasts `StatusUpdated` to SignalR clients

**SignalR Events Sent**:
- `FriendsListUpdated`: Complete friends list with timestamps
- `OnlineCharactersUpdated`: All online characters
- `UserOnline`: Character online notification
- `UserOffline`: Character offline notification
- `StatusUpdated`: Status change notification
- `BookmarkAdded`: Bookmark added notification
- `BookmarkRemoved`: Bookmark removed notification

### FChatController.cs

**Purpose**: REST API endpoints for friend/bookmark operations

**Endpoints**:
- `GET /api/fchat/friends`: Returns friends, bookmarks, and bookmarks with status
- `POST /api/fchat/bookmark/add`: Adds a bookmark
- `POST /api/fchat/bookmark/remove`: Removes a bookmark

## Frontend Components

### friendsStore.ts (Zustand Store)

**Purpose**: Manages friend list state with persistence

**State**:
```typescript
{
  friends: Friend[],              // All friends with status
  bookmarks: string[],            // Bookmark names only
  bookmarksWithStatus: Friend[],  // Bookmarks with status
  isCollapsed: boolean,
  isLoading: boolean
}
```

**Actions**:
- `setFriends()`: Sets complete friends list (with deduplication)
- `setBookmarks()`: Sets bookmark names
- `setBookmarksWithStatus()`: Sets bookmarks with status
- `updateFriendStatus()`: Updates status for a specific friend
- `setFriendOnline()`: Sets online/offline state for a friend
- `addBookmark()`: Adds a bookmark (also adds to friends)
- `removeBookmark()`: Removes a bookmark (also removes from friends)
- `deduplicateFriends()`: Helper to prevent duplicate friends

**Persistence**: Uses Zustand persist middleware to save to localStorage

### lightweightCharacterStore.ts

**Purpose**: Fast cache for character status (used alongside friendsStore)

The FriendsList component checks both stores for status, preferring lightweightStore for real-time data.

### FriendsList.tsx

**Purpose**: Displays friends and bookmarks in the UI

**Data Sources** (in priority order):
1. `lightweightCharacterStore`: Real-time status for all characters
2. `friendsStore`: Friends and bookmarks with status
3. Fallback to offline if neither has data

**Display Logic**:
- Merges friends and bookmarks
- Filters by online/offline status
- Displays online friends, online bookmarks, and offline friends in separate sections
- Shows status messages, gender, and last seen timestamps

### SignalR Service (signalr.ts)

**Purpose**: Manages SignalR connection and event listeners

**Event Listeners**:
- `onStatusUpdated()`: Updates character status
- `onUserOnline()`: Updates friend online status
- `onUserOffline()`: Updates friend offline status
- `setFriendsListUpdatedCallback()`: Re-fetches friends when list changes
- `setBookmarkCallbacks()`: Handles bookmark additions/removals

## Update Mechanisms

### Priority System

The system uses multiple update mechanisms that work together:

1. **Initial Load** (FRL + LIS commands)
   - Most authoritative, contains complete data
   - Only happens on character connection

2. **Real-time Events** (NLN, FLN, STA commands)
   - Immediate updates for status changes
   - Only updates specific characters

3. **Polling/Re-fetching**
   - When `FriendsListUpdated` event is received, frontend re-fetches via API
   - Ensures consistency after backend updates

### Deduplication

The system has multiple deduplication mechanisms:

1. **Frontend Store**: `deduplicateFriends()` removes duplicate entries by name
2. **Backend**: Friends and bookmarks are stored in dictionaries/lists to prevent duplicates
3. **React Keys**: Components use unique keys like `online-friend-${name}` and `bookmark-${name}`

### Caching

**Backend Caches**:
- `_friendsWithStatus`: Friends with online status from FRL
- `_bookmarksWithStatus`: Bookmarks with online status
- `_onlineCharactersCache`: All online characters from LIS (used for lookups)

**Frontend Caches**:
- `friendsStore`: Persisted to localStorage
- `lightweightCharacterStore`: In-memory cache for fast lookups

## Known Issues & Troubleshooting

### Issue: Friends Not Receiving Updates

**Potential Causes**:

1. **SignalR Connection Issues**
   - Check if SignalR connection is active
   - Verify user is in correct SignalR group (`user-{userId}`)
   - Check for connection drops/reconnections in logs

2. **Event Handler Not Firing**
   - Verify event listeners are set up in `page.tsx: connectToSignalR()`
   - Check if `isFriendOrBookmark()` is correctly identifying friends
   - Look for errors in browser console

3. **Backend Not Broadcasting**
   - Check backend logs for `FriendsListUpdated`, `UserOnline`, `UserOffline` broadcasts
   - Verify `FChatWebSocketClient` events are being fired
   - Check if `FChatService` event handlers are being called

4. **F-Chat WebSocket Issues**
   - Verify F-Chat WebSocket connection is active
   - Check for F-Chat command reception in logs (FRL, LIS, NLN, FLN, STA)
   - Look for WebSocket disconnections or errors

5. **Cache Inconsistency**
   - Frontend localStorage might have stale data
   - Backend caches might not be updating correctly
   - Try clearing browser storage and reconnecting

6. **Race Conditions**
   - `FriendsListUpdated` might trigger before character is fully loaded
   - Multiple simultaneous updates might conflict
   - Character switch might clear friend data prematurely

### Debugging Checklist

**Backend Logs** (search for these in `logs/fchat-bouncer-*.log`):

```bash
# Friend list loading
grep "FRL" logs/fchat-bouncer-*.log
grep "Received friends list with" logs/fchat-bouncer-*.log
grep "FriendsListUpdated" logs/fchat-bouncer-*.log

# Online/offline events
grep "NLN\|FLN" logs/fchat-bouncer-*.log
grep "UserOnline\|UserOffline" logs/fchat-bouncer-*.log

# Status updates
grep "STA" logs/fchat-bouncer-*.log
grep "StatusUpdated" logs/fchat-bouncer-*.log

# Bookmark operations
grep "bookmark" -i logs/fchat-bouncer-*.log
grep "BookmarkAdded\|BookmarkRemoved" logs/fchat-bouncer-*.log
```

**Frontend Console** (check browser console for):

```javascript
// Friend list updates
console.log('Friends list updated from backend:', ...)
console.log('Re-fetched friends after backend update:', ...)

// Status updates
consoleUtils.friend(`Status updated: ${name} is now ${status}`, ...)
consoleUtils.friend(`${name} came online (${status})`, ...)
consoleUtils.friend(`${name} went offline`, ...)

// Bookmark operations
console.log('Bookmark added:', ...)
console.log('Bookmark removed:', ...)
```

**SignalR Connection**:

```javascript
// Check in browser console
signalRService.isConnected  // Should be true
signalRService.connection.state  // Should be "Connected"
```

### Common Patterns to Look For

1. **Missing Events**: If `UserOnline` events fire but friends don't update, check `isFriendOrBookmark()` logic

2. **Partial Updates**: If some friends update but not others, check for case-sensitivity issues in name comparisons

3. **Delayed Updates**: If updates arrive late, check for rate limiting or batching in character update system

4. **Stale Data**: If friends show old status, check cache TTLs and update logic in `UpdateFriendsListWithOnlineStatus()`

5. **Duplicate Friends**: If friends appear multiple times, check deduplication logic and React keys

### Testing Scenarios

To test the friends list system:

1. **Basic Load**: Connect a character and verify friends list appears
2. **Friend Comes Online**: Have a friend log in and verify they appear as online
3. **Friend Goes Offline**: Have a friend log out and verify they appear as offline
4. **Status Change**: Have an online friend change status and verify it updates
5. **Add Bookmark**: Add a bookmark and verify it appears in the list
6. **Remove Bookmark**: Remove a bookmark and verify it's removed
7. **Character Switch**: Switch characters and verify friends list updates
8. **Reconnection**: Disconnect and reconnect, verify friends list persists/refreshes

## Data Models

### Friend (Backend)

```csharp
public class Friend
{
    public string Name { get; set; }
    public string Status { get; set; }  // "online", "busy", "away", "dnd", "offline"
    public string? StatusMessage { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? LastSeen { get; set; }
    public string? Gender { get; set; }
}
```

### Friend (Frontend)

```typescript
interface Friend {
  name: string;
  status: 'online' | 'busy' | 'away' | 'dnd' | 'idle' | 'offline';
  statusMessage?: string;
  isOnline: boolean;
  lastSeen?: string;  // ISO datetime
  gender?: string;
  memo?: string;
}
```

### FChatCharacter (Backend)

```csharp
public class FChatCharacter
{
    public string Name { get; set; }
    public string Status { get; set; }
    public string? StatusMessage { get; set; }
    public string? Gender { get; set; }
    public DateTime LastSeen { get; set; }
}
```

## F-Chat Protocol Commands

### Incoming Commands (from F-Chat)

- **FRL**: Friends list with all friends (both online and offline)
- **LIS**: List of all online characters with status
- **NLN**: New character came online
- **FLN**: Character went offline
- **STA**: Character status changed

### Outgoing Commands (to F-Chat)

- **ORS**: Request online characters list
- **FRL**: Request friends list (automatic on connection)
- Bookmark operations use F-List HTTPS API, not WebSocket

## Performance Considerations

1. **Batching**: Status updates are batched to avoid overwhelming the database
2. **Caching**: Multiple layers of caching reduce API calls and database queries
3. **Deduplication**: Prevents duplicate entries and unnecessary re-renders
4. **Selective Updates**: Only updates friends/bookmarks, not all characters
5. **Persistence**: Frontend state is persisted to reduce initial load times

## Future Improvements

1. **Rate Limiting**: Add rate limiting for friend list updates to prevent spam
2. **Offline Persistence**: Store offline friend data in backend database
3. **Friend Groups**: Support grouping friends into custom categories
4. **Search/Filter**: Add search and filtering capabilities
5. **Notifications**: Desktop notifications for friend status changes
6. **Friend Notes**: Enhanced memo system for friends
7. **Activity Tracking**: Track when friends were last seen in specific channels
8. **Mutual Friends**: Show mutual friends and shared channels

## Related Files

**Backend**:
- `src/FChatBouncer.Server/Services/FChatWebSocketClient.cs`: WebSocket client
- `src/FChatBouncer.Server/Services/FChatService.cs`: Service orchestration
- `src/FChatBouncer.Server/Controllers/FChatController.cs`: REST endpoints
- `src/FChatBouncer.Server/Models/Friend.cs`: Friend model
- `src/FChatBouncer.Server/Models/FChatCharacter.cs`: Character model

**Frontend**:
- `src/fchat-bouncer-client/src/stores/friendsStore.ts`: Friends state management
- `src/fchat-bouncer-client/src/stores/lightweightCharacterStore.ts`: Character cache
- `src/fchat-bouncer-client/src/components/FriendsList.tsx`: Friends UI component
- `src/fchat-bouncer-client/src/lib/signalr.ts`: SignalR service
- `src/fchat-bouncer-client/src/lib/api.ts`: REST API client
- `src/fchat-bouncer-client/src/app/page.tsx`: Main app with event listeners

## Glossary

- **F-Chat**: The F-List chat server/protocol
- **FRL**: Friends List command from F-Chat
- **LIS**: List of online characters command from F-Chat
- **NLN**: New character online notification
- **FLN**: Character offline notification
- **STA**: Status update command
- **SignalR**: Real-time communication library
- **Zustand**: State management library
- **Bookmark**: A character you want to track (subset of friends)
- **Friend**: A character in your F-Chat friends list

