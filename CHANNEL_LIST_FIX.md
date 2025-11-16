# Channel List Character Issue - Fixed

## Problem Summary

The frontend was never receiving a channel list, or was receiving channels for the wrong character (e.g., "Chad" instead of the intended character).

## Root Cause

The `ChannelSelection` component was requesting the channel list **before** ensuring that the backend had the correct active character set.

### The Flow (BROKEN):
1. Frontend connects to SignalR
2. `ChannelSelection` component mounts
3. Component immediately requests channel list via `getChannelList()`
4. Backend's `GetChannelList()` method checks for active character in database
5. **Problem**: Either no active character is set, or a fallback character (like "Chad") is used
6. Backend returns channels for wrong character or returns error

### Why "Chad" Was Being Used

When `SetActiveCharacterAsync` is called on the backend (CharacterService.cs, lines 366-402), if the requested character doesn't exist in the `CharacterConnections` table, it falls back to the **first available character**:

```csharp
// If the requested character is not found, try to use the first available character
if (connections.Count > 0)
{
    var fallbackConnection = connections.First();
    fallbackConnection.IsActive = true;
    _logger.LogInformation("Using fallback character {FallbackCharacter} as active for user {UserId}", 
        fallbackConnection.Character.Name, userId);
}
```

If "Chad" was the first character in the database, it would be used as the fallback.

## The Fix

Updated `ChannelSelection.tsx` to:

1. **Wait for active character to be set** in the frontend store before requesting channels
2. **Explicitly set the active character on the backend** before requesting the channel list
3. **Add proper error handling** with clear console logs

### The Flow (FIXED):
1. Frontend connects to SignalR
2. `ChannelSelection` component mounts
3. Component waits for `activeCharacter` to be set in the frontend store
4. Component explicitly calls `signalRService.setActiveCharacter(activeCharacter)`
5. Backend sets the character as active in the database
6. Component then requests channel list via `getChannelList()`
7. Backend uses the correct active character to fetch channels
8. Frontend receives correct channel list

## Code Changes

### frontend: `src/fchat-bouncer-client/src/components/ChannelSelection.tsx`

Modified the `useEffect` hook that requests the channel list:

```typescript
// Request channel list when component mounts, but wait for SignalR to be ready AND active character to be set
const requestChannelsWhenReady = async () => {
  if (!signalRService.isConnected) {
    // Wait a bit and try again
    setTimeout(requestChannelsWhenReady, 500);
    return;
  }
  
  if (!activeCharacter) {
    // No active character yet, wait and try again
    console.log('ChannelSelection: Waiting for active character to be set...');
    setTimeout(requestChannelsWhenReady, 500);
    return;
  }
  
  // Ensure backend has the active character set before requesting channels
  try {
    console.log('ChannelSelection: Ensuring backend active character is set to:', activeCharacter);
    await signalRService.setActiveCharacter(activeCharacter);
    console.log('ChannelSelection: Active character set on backend, requesting channels...');
    await handleGetChannels();
  } catch (error) {
    console.error('ChannelSelection: Failed to set active character or get channels:', error);
    setError('Failed to initialize channel list. Please try again.');
  }
};
```

Also added `activeCharacter` to the dependency array of the `useEffect`:

```typescript
}, [signalRService.connectionState, signalRService.connection?.connectionId, activeCharacter]);
```

## Testing

To verify the fix works:

1. **Check browser console logs**:
   - You should see: `"ChannelSelection: Ensuring backend active character is set to: [YourCharacterName]"`
   - Followed by: `"ChannelSelection: Active character set on backend, requesting channels..."`

2. **Check backend logs**:
   - Look for: `"User {UserId} setting active character to {CharacterName}"`
   - Followed by: `"Active character for user {UserId}: {YourCharacterName}"`
   - The character name should match what you selected, not "Chad" or a fallback

3. **Verify channel list loads**:
   - The channel list should now load correctly for your selected character
   - You should see the list of available F-Chat channels

## Additional Notes

- The backend already had good logging in place to diagnose this issue (see `BouncerHub.cs` lines 364-366)
- This fix ensures that the frontend's active character state is synchronized with the backend before making requests that depend on it
- The fix includes retry logic (500ms intervals) to handle race conditions during initialization

## Related Files

- Frontend: `src/fchat-bouncer-client/src/components/ChannelSelection.tsx`
- Backend: `src/FChatBouncer.Server/Hubs/BouncerHub.cs` (GetChannelList method)
- Backend: `src/FChatBouncer.Server/Services/CharacterService.cs` (SetActiveCharacterAsync method)
- Frontend: `src/fchat-bouncer-client/src/lib/signalr.ts` (setActiveCharacter method)

