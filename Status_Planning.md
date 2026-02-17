# Status Reporting System - Implementation Documentation

## Overview

This document describes the comprehensive status reporting system that provides real-time visibility into the backend (F-List server connection) and frontend (SignalR + IndexedDB) services.

## Architecture

The system consists of three main layers:

1. **Backend Status Tracking** (C# / .NET)
2. **Frontend Status Management** (TypeScript / React)
3. **UI Components** (React Components with Tailwind CSS)

## Backend Status States

### BackendConnectionStatus Enum

Located in: `src/FChatBouncer.Server/Models/BackendConnectionStatus.cs`

#### States

1. **Connected** 🟢
   - Character is successfully connected to F-List servers
   - Active WebSocket connection established
   - Ready to send/receive messages

2. **NotConnected** 🔴
   - Character is not connected to F-List servers
   - No active WebSocket connection
   - Cannot send/receive messages

3. **WaitingForCharacter** 🟡
   - User is logged into bouncer but hasn't selected a character yet
   - Or a character switch operation is in progress
   - System is ready but waiting for character selection

4. **NeedsCredentials** 🟠
   - F-Chat credentials are missing or invalid
   - User needs to provide credentials before connection can be established

## Frontend Status States

### FrontendServiceStatus Type

Located in: `src/fchat-bouncer-client/src/types/index.ts`

#### Service States

1. **ready** 🟢
   - Service is fully operational
   - No issues detected

2. **loading** 🟡
   - Service is initializing
   - Connection in progress
   - Waiting for resources to load

3. **failed** 🔴
   - Service encountered an error
   - Not operational
   - Requires user intervention or retry

### Tracked Services

1. **SignalR Connection**
   - Tracks connection state to backend
   - States: Connected, Connecting, Disconnected

2. **IndexedDB Storage**
   - Tracks local storage initialization
   - States: Ready, Loading, Failed

### Aggregate Frontend Status

The overall frontend status is computed based on all services:

- **Ready** 🟢: All services are ready
- **Loading** 🟡: One or more services are loading
- **Failed** 🔴: One or more services have failed

## Status Data Flow

```
Backend:
┌─────────────────────────────────────────────────────────────────┐
│ FChatService.GetDetailedConnectionStatusAsync()                │
│   - Checks credentials                                          │
│   - Checks active character                                     │
│   - Checks WebSocket connection                                 │
│   - Returns DetailedConnectionStatusDto                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BouncerHub.GetDetailedConnectionStatus()                        │
│   - Invokable by frontend                                       │
│   - Returns status to caller                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BouncerHub.BroadcastDetailedStatus()                            │
│   - Pushes status updates to connected clients                  │
│   - Sent on status changes                                      │
└─────────────────────────────────────────────────────────────────┘

Frontend:
┌─────────────────────────────────────────────────────────────────┐
│ SignalR Service                                                  │
│   - Listens for 'DetailedStatusUpdate' events                   │
│   - Exposes generic on() method for event subscription          │
│   - Tracks own connection state                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ StatusStore (Zustand)                                            │
│   - Receives status updates                                     │
│   - Tracks backend status                                       │
│   - Tracks frontend service states                              │
│   - Computes aggregate frontend status                          │
│   - Provides refreshStatus() for manual updates                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ StatusIndicators Component                                       │
│   - Displays two status pills (Backend + Frontend)              │
│   - Shows tooltips on hover with detailed breakdown             │
│   - Includes refresh button for manual status checks            │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

### Backend API

#### FChatService Methods

```csharp
Task<DetailedConnectionStatusDto> GetDetailedConnectionStatusAsync(string userId)
```

Determines the current connection status for a user by checking:
- F-Chat credentials availability
- Active character selection
- WebSocket connection state

**Returns:** `DetailedConnectionStatusDto` containing full status information

#### BouncerHub Methods

```csharp
Task<DetailedConnectionStatusDto> GetDetailedConnectionStatus()
```

SignalR hub method that clients can invoke to request current status.

```csharp
Task BroadcastDetailedStatus(string userId, DetailedConnectionStatusDto status)
```

Broadcasts status update to all connections for a specific user.

### Frontend API

#### StatusStore

```typescript
interface StatusStore {
  // State
  backend: BackendStatusInfo;
  frontend: FrontendStatusInfo;
  isRefreshing: boolean;
  lastRefresh: Date | null;
  
  // Actions
  setBackendStatus: (status: Partial<BackendStatusInfo>) => void;
  updateBackendFromDto: (dto: any) => void;
  setSignalRStatus: (status: FrontendServiceStatus) => void;
  setIndexedDBStatus: (status: FrontendServiceStatus) => void;
  computeFrontendOverallStatus: () => 'ready' | 'loading' | 'failed';
  refreshStatus: () => Promise<void>;
  getDetailedStatus: () => DetailedStatus;
  initializeStatusTracking: () => void;
}
```

**Usage Example:**

```typescript
import { useStatusStore } from '@/stores/statusStore';

function MyComponent() {
  const { backend, frontend, refreshStatus } = useStatusStore();
  
  // Access backend status
  console.log(backend.status); // 'connected' | 'not-connected' | 'waiting-for-character' | 'needs-credentials'
  
  // Access frontend status
  console.log(frontend.signalR); // 'ready' | 'loading' | 'failed'
  console.log(frontend.indexedDB); // 'ready' | 'loading' | 'failed'
  console.log(frontend.overallStatus); // 'ready' | 'loading' | 'failed'
  
  // Manual refresh
  const handleRefresh = async () => {
    await refreshStatus();
  };
}
```

## UI Components

### StatusIndicators Component

Located in: `src/fchat-bouncer-client/src/components/StatusIndicators.tsx`

#### Features

1. **Backend Status Pill**
   - Color-coded indicator (green/yellow/orange/red)
   - Shows "Backend: [Status]"
   - Hover for detailed tooltip

2. **Frontend Status Pill**
   - Color-coded indicator (green/yellow/red)
   - Shows "Frontend: [Status]"
   - Hover for detailed tooltip

3. **Refresh Button**
   - Manual status refresh
   - Animated spinner while refreshing
   - Requests latest status from backend

#### Tooltip Details

**Backend Tooltip Shows:**
- Current status (connected/not connected/waiting/needs credentials)
- Character name (if applicable)
- F-Chat connection state
- Credentials configuration status
- Last activity timestamp
- Status message

**Frontend Tooltip Shows:**
- SignalR connection status (ready/loading/failed)
- IndexedDB storage status (ready/loading/failed)

### Integration

The `StatusIndicators` component is integrated into the `ChatInterface` component, replacing the old simple "Connected/Disconnected" indicator in the sidebar.

**Location:** Lines 1148-1150 in `ChatInterface.tsx`

## Status Transitions

### Typical Flow

```
1. User Login
   ↓
2. Backend: NeedsCredentials → WaitingForCharacter
   Frontend: SignalR loading → ready
   Frontend: IndexedDB loading → ready
   ↓
3. Character Selected
   ↓
4. Backend: WaitingForCharacter → NotConnected → Connected
   Frontend: All ready
   ↓
5. Active Session
   Backend: Connected
   Frontend: All ready
```

### Error Scenarios

**Scenario 1: Lost Connection**
```
Connected → NotConnected
Frontend: SignalR ready → failed → loading → ready (on reconnect)
```

**Scenario 2: Missing Credentials**
```
WaitingForCharacter → NeedsCredentials
(User must provide credentials)
```

**Scenario 3: Character Switch**
```
Connected (Character A) → WaitingForCharacter → Connected (Character B)
```

## Real-Time Updates

### Automatic Updates

The system receives automatic status updates via SignalR when:
- Character connects/disconnects
- Credentials are added/removed
- Active character changes
- Connection state changes

### Manual Refresh

Users can manually request status updates by:
1. Clicking the refresh button in the UI
2. The frontend invokes `GetDetailedConnectionStatus` on the hub
3. Backend returns current status
4. Status store updates and UI refreshes

### Polling Fallback

The system includes a fallback mechanism:
- SignalR connection state is checked every 5 seconds
- If connection drops, status automatically updates to reflect disconnection
- On reconnection, status is automatically refreshed from backend

## Color Scheme Reference

### Backend Status Colors

| Status                | Color  | Hex Code  | Meaning                           |
|-----------------------|--------|-----------|-----------------------------------|
| Connected             | Green  | #22c55e   | Connected to F-List              |
| Not Connected         | Red    | #ef4444   | Not connected to F-List          |
| Waiting for Character | Yellow | #eab308   | Waiting for character selection  |
| Needs Credentials     | Orange | #f97316   | Credentials required             |

### Frontend Status Colors

| Status  | Color  | Hex Code | Meaning                |
|---------|--------|----------|------------------------|
| Ready   | Green  | #22c55e  | All services ready     |
| Loading | Yellow | #eab308  | Services initializing  |
| Failed  | Red    | #ef4444  | One or more services failed |

## File Structure

### Backend Files

```
src/FChatBouncer.Server/
├── Models/
│   ├── BackendConnectionStatus.cs         (NEW - Status enum)
│   └── DetailedConnectionStatusDto.cs      (NEW - Status DTO)
├── Services/
│   ├── FChatService.cs                    (MODIFIED - Added GetDetailedConnectionStatusAsync)
│   └── IFChatService.cs                   (MODIFIED - Added interface method)
└── Hubs/
    └── BouncerHub.cs                      (MODIFIED - Added status methods)
```

### Frontend Files

```
src/fchat-bouncer-client/src/
├── types/
│   └── index.ts                           (MODIFIED - Added status types)
├── stores/
│   └── statusStore.ts                     (NEW - Status state management)
├── lib/
│   └── signalr.ts                         (MODIFIED - Added generic on() method)
└── components/
    ├── StatusIndicators.tsx               (NEW - Status UI component)
    └── ChatInterface.tsx                  (MODIFIED - Integrated StatusIndicators)
```

## Testing

### Backend Testing

Test status determination logic:

```csharp
// Test NeedsCredentials state
var status = await fChatService.GetDetailedConnectionStatusAsync(userId);
Assert.Equal(BackendConnectionStatus.NeedsCredentials, status.BackendStatus);

// Test WaitingForCharacter state
// (Add credentials but don't select character)
status = await fChatService.GetDetailedConnectionStatusAsync(userId);
Assert.Equal(BackendConnectionStatus.WaitingForCharacter, status.BackendStatus);

// Test Connected state
// (Add credentials, select character, establish connection)
status = await fChatService.GetDetailedConnectionStatusAsync(userId);
Assert.Equal(BackendConnectionStatus.Connected, status.BackendStatus);
```

### Frontend Testing

Test status store:

```typescript
// Test status initialization
const { backend, frontend, initializeStatusTracking } = useStatusStore.getState();
initializeStatusTracking();

// Test status updates
const mockStatus = {
  backendStatus: 'Connected',
  characterName: 'TestCharacter',
  isConnectedToFChat: true,
  hasCredentials: true
};
useStatusStore.getState().updateBackendFromDto(mockStatus);

// Test manual refresh
await useStatusStore.getState().refreshStatus();
```

## Future Enhancements

Potential improvements for future iterations:

1. **Connection Quality Metrics**
   - Latency measurement
   - Packet loss detection
   - Connection stability score

2. **Historical Status Tracking**
   - Status change log
   - Downtime tracking
   - Connection statistics

3. **Notifications**
   - Browser notifications on status changes
   - Sound alerts for disconnections
   - Email/SMS alerts for critical issues

4. **Advanced Diagnostics**
   - Network diagnostic tools
   - Connection troubleshooting wizard
   - Automated reconnection strategies

5. **Status Dashboard**
   - Dedicated status page
   - Detailed metrics and graphs
   - System health overview

## Troubleshooting

### Backend Status Shows "Not Connected" But Should Be Connected

1. Check F-Chat credentials are valid
2. Verify character exists and is available
3. Check backend logs for connection errors
4. Verify WebSocket connection is established

### Frontend Status Shows "Failed"

1. Check which specific service failed (SignalR or IndexedDB)
2. For SignalR: Verify network connectivity, check backend is running
3. For IndexedDB: Check browser console for errors, verify browser supports IndexedDB

### Status Not Updating

1. Check SignalR connection is established
2. Try manual refresh button
3. Check browser console for JavaScript errors
4. Verify `DetailedStatusUpdate` events are being received

## Conclusion

The status reporting system provides comprehensive visibility into the application's connection state, enabling users to quickly identify and troubleshoot connectivity issues. The modular design allows for easy extension and customization based on future requirements.


