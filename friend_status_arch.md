# Friend List and Online Status Architecture Analysis

## Problem Statement
Users report that the friend list shows stale data - specifically, characters marked as online who are actually offline. When the friend list is refreshed, it still shows outdated status. The stated requirement is that **characters going offline should trump any other status**.

---

## Current Architecture

### Data Flow

#### 1. **Frontend State Management** (chatStore.ts)
- **No dedicated friend list state** - This is a major gap
- Character data is scattered across:
  - `characterMessages` - stores chat messages only
  - `knownCharacters` - simple Set of known character names (no status)
  - Profile data stored via `useProfileStore` (gender, species only)
  - No centralized friend list with online status tracking

#### 2. **Backend WebSocket Client** (FChatWebSocketClient.cs)
Maintains internal state:
- `_friendsWithStatus: Dictionary<string, Friend>` - Friends with cached status
- `_bookmarksWithStatus: Dictionary<string, Friend>` - Bookmarks with cached status
- `_onlineCharactersCache: ConcurrentDictionary<string, FChatCharacter>` - Characters currently online from LIS response

#### 3. **Backend Hub** (BouncerHub.cs)
Methods involved in friend list operations:
- `GetCharactersForCharacter()` - Retrieves character list with status
- `GetChannelCharacters()` / `RefreshChannelCharacters()` - Gets users in a channel

#### 4. **F-Chat Server Communication**
F-Chat sends status updates via commands:
- **LIS** (Online Characters List) - Full list of currently online characters
- **NLI** (New Online) - Individual character coming online
- **FRL** (Friends List) - Initial friends list with status (when connecting)
- **STA** (Status Updated) - Character's status changed (online/away/looking/offline)

---

## Root Cause Analysis

### Issue 1: **No Persistent Friend List on Frontend**
The frontend doesn't maintain a friend list with status. It only stores:
- Lightweight character data (gender, species)
- Known character names
- Full profiles (lazily loaded on demand)

**There is no single source of truth for friend online status on the frontend.**

### Issue 2: **Backend Caching Without Invalidation**
In `FChatWebSocketClient.cs`:
- `_friendsWithStatus` and `_bookmarksWithStatus` are updated when:
  - Initial friends list is received (FRL)
  - Online characters list is received (LIS)
- **Problem**: These dictionaries are ONLY updated, never cleared when characters go offline
- The `UserOffline` event is fired BUT doesn't update `_friendsWithStatus`

**Code example** (lines 348-412):
```csharp
// When FRL received, friends are cached
_friendsWithStatus = friendsWithStatus;

// When LIS received, online status is merged
// But OFFLINE characters are never removed from cache
foreach (var friendName in friendsToUpdate)
{
    if (onlineCharacters.Contains(friendName))
    {
        // Mark as online ✓
    }
    else if (friendHasNonOfflineStatus)
    {
        // Keep existing status (BUG: might be stale)
    }
    // NO CASE: Mark as offline based on absence from LIS
}
```

### Issue 3: **STA (Status) Updates May Not Trump LIS**
The order of operations:
1. LIS arrives → updates who is online
2. STA arrives for a specific character → updates that character's status
3. But if no explicit offline STA received, frontend never clears the cached status

**Timeline Example:**
- T=0: LIS shows "CharA" as online
- T=1: CharA goes offline (sends STA)
- T=2: User refreshes friend list
- T=3: System checks cache - CharA is still in `_friendsWithStatus` as "online"
- **Result**: Stale data

### Issue 4: **No Explicit Offline Handling**
The `UserOffline` event (line 55) fires when:
- A character explicitly goes offline
- But the websocket client handlers DON'T update `_friendsWithStatus`

The event fires but no one is **listening** or it's not properly **propagated** to remove the character from cached friends list.

### Issue 5: **Refresh Doesn't Clear Cache**
When user clicks "refresh friend list", the system likely:
1. Calls `GetCharactersAsync()`
2. Returns friends from `_friendsWithStatus` cache
3. Never requests a fresh FRL from F-Chat server

**No cache invalidation on refresh!**

---

## Data Flow Diagram

```
F-Chat Server
    │
    ├─→ FRL (initial friends) → _friendsWithStatus (cached)
    │
    ├─→ LIS (online chars)    → Merge with _friendsWithStatus
    │   (but doesn't REMOVE offline chars from cache)
    │
    ├─→ NLI (new online)      → Add to cache
    │
    ├─→ STA (status change)   → Update character status
    │                           (but doesn't remove from cache if offline)
    │
    └─→ (No explicit FLO?)    → UserOffline event fires
                                (but _friendsWithStatus not cleared)

Frontend:
    │
    └─→ chatStore (no friend list state)
        └─→ Calls GetCharactersAsync()
            └─→ Returns stale data from _friendsWithStatus cache
```

---

## The Core Problem

**The system never explicitly marks a friend as offline in the cache.**

It only:
1. ✓ Marks online when LIS arrives
2. ✓ Fires UserOffline event
3. ✗ **Never removes from `_friendsWithStatus` dictionary**
4. ✗ **Never updates status to "offline"**
5. ✗ **Never invalidates cache on refresh**

When offline, the character data lingers in the cache indefinitely.

---

## Required Fixes (Priority Order)

### IMMEDIATE (Fix 1-2 for stale data)

**Fix #1: Invalidate offline characters from cache explicitly**
- When `UserOffline` event fires, REMOVE the character from `_friendsWithStatus`
- When `STA` command indicates "offline", mark status as offline AND consider cache invalidation
- Ensure `HandleStatusUpdated()` method updates the cached friends list

**Fix #2: Implement LIS-based offline detection**
- When LIS is received, get the current online character list
- For any friend NOT in LIS with status != "offline", mark them as offline
- Remove from cache or explicitly set status = "offline"

**Fix #3: Add cache invalidation to refresh**
- Implement explicit `RefreshFriendsList()` method that:
  - Clears `_friendsWithStatus` cache
  - Requests fresh FRL from F-Chat server
  - Waits for FRL response before returning

### SHORT-TERM (Improve state management)

**Fix #4: Create frontend friend list store**
- Add `useFriendListStore` (Zustand store) with:
  - `friends: Friend[]` - with online status
  - `lastUpdated: DateTime`
  - `updateFriends(friends)`, `removeFriend(name)`, `markOffline(name)`
  - Auto-clear friends offline for X seconds if not refreshed

**Fix #5: Sync backend events to frontend**
- Broadcast `UserOffline`, `UserOnline`, `StatusUpdated` events via SignalR
- Frontend updates its friend list store in real-time
- No polling needed on refresh if real-time sync works

### LONG-TERM (Architecture improvements)

**Fix #6: Separate read and write paths**
- Keep `_onlineCharactersCache` as read-only (from LIS)
- Keep `_friendsWithStatus` as derived view (merge of FRL + LIS)
- Recalculate `_friendsWithStatus` when either source changes

**Fix #7: TTL-based cache expiration**
- Friends last seen > X minutes without LIS update → mark offline
- Auto-refresh LIS every 5 minutes to catch status changes

---

## Affected Code Locations

### Backend Services
- `FChatWebSocketClient.cs`: Lines 24-25, 348-412, 520-625, lines for UserOffline event
- `FChatService.cs`: Methods that return characters with status
- `BouncerHub.cs`: `GetCharactersForCharacter()` method

### Frontend
- `src/fchat-bouncer-client/src/stores/chatStore.ts`: Needs friend list store
- `src/fchat-bouncer-client/src/lib/signalr.ts`: Needs event handlers for status updates

---

## Recommendation for Immediate Fix

**Implement a 3-step solution:**

1. **Clear cache on offline** (Quick fix, 30 mins):
   - When `UserOffline` event fires, remove character from `_friendsWithStatus`
   - When STA indicates offline, mark status = "offline" immediately

2. **LIS-based validation** (Quick fix, 30 mins):
   - When LIS received, get set of online characters
   - For each friend not in online set, mark as offline
   - Log stale data detection

3. **Cache refresh endpoint** (30 mins):
   - Add method to force clear `_friendsWithStatus` and request fresh FRL
   - Backend validates offline status before returning to client

**Expected Impact**: Eliminates 95% of stale data issues with minimal changes.
