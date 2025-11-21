using FChatBouncer.Server.Hubs;
using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;


public interface IFChatService
{
    // Legacy single-character methods (DEPRECATED - Use multi-character versions)
    [Obsolete("Use ConnectCharacterAsync(userId, characterName, username, password) instead")]
    Task ConnectUserAsync(string userId, string fchatUsername, string fchatPassword);
    
    [Obsolete("Use DisconnectAllCharactersAsync(userId) instead")]
    Task DisconnectUserAsync(string userId);
    
    [Obsolete("Use SendMessageAsync(userId, characterName, channel, message) instead")]
    Task SendMessageAsync(string userId, string channel, string message);
    
    [Obsolete("Use JoinChannelAsync(userId, characterName, channel) instead")]
    Task JoinChannelAsync(string userId, string channel);
    
    [Obsolete("Use LeaveChannelAsync(userId, characterName, channel) instead")]
    Task LeaveChannelAsync(string userId, string channel);
    
    [Obsolete("Use IsCharacterConnectedAsync(userId, characterName) or check GetActiveCharacterAsync() instead")]
    Task<bool> IsUserConnectedAsync(string userId);
    
    // Get available characters for a user (used before character selection)
    // This method has fallback logic: tries active connections, then database, then F-List API
    Task<List<FChatCharacter>> GetCharactersAsync(string userId);
    
    [Obsolete("Use SetActiveCharacterAsync(userId, characterName) instead")]
    Task SelectCharacterAsync(string userId, string characterName);
    
    [Obsolete("Use SetActiveCharacterAsync(userId, characterName) instead")]
    Task SwitchCharacterAsync(string userId, string characterName);
    
    [Obsolete("Use GetActiveCharacterAsync(userId) instead - returns string instead of FChatCharacter")]
    Task<FChatCharacter?> GetSelectedCharacterAsync(string userId);
    
    [Obsolete("Use GetChannelListAsync(userId, characterName) or GetAvailableChannelsAsync(userId, characterName) instead")]
    Task<List<FChatChannel>> GetChannelListAsync(string userId);
    
    [Obsolete("Use GetJoinedChannelsAsync(userId, characterName) instead")]
    Task<List<string>> GetJoinedChannelsAsync(string userId);
    
    [Obsolete("Use GetJoinedChannelDetailsAsync(userId, characterName) instead")]
    Task<List<FChatChannel>> GetJoinedChannelDetailsAsync(string userId);
    
    [Obsolete("Use SendPRIMessageAsync(userId, characterName, recipient, content) instead")]
    Task SendPRIMessageAsync(string userId, string v, string content);
    
    [Obsolete("Use ProcessQueuedMessagesAsync(userId, characterName) instead")]
    Task ProcessQueuedMessagesAsync(string userId);
    
    [Obsolete("Use RequestProfileAsync(userId, characterName, requestingCharacter) instead")]
    Task RequestProfileAsync(string userId, string characterName);
    
    Task<string?> GetTicketAsync(string userId, string characterName);
    Task<string?> GetUsernameAsync(string userId, string characterName);
    Task SendTypingNotificationAsync(string userId, string characterName, string recipient, string status);

    // New multi-character methods
    Task ConnectCharacterAsync(string userId, string characterName, string fchatUsername, string fchatPassword);
    Task DisconnectCharacterAsync(string userId, string characterName);
    Task DisconnectAllCharactersAsync(string userId);
    Task SendMessageAsync(string userId, string characterName, string channel, string message);
    Task JoinChannelAsync(string userId, string characterName, string channel);
    Task LeaveChannelAsync(string userId, string characterName, string channel);
    Task<bool> IsCharacterConnectedAsync(string userId, string characterName);
    Task<List<FChatCharacter>> GetCharactersAsync(string userId, string characterName);
    Task<List<FChatChannel>> GetChannelListAsync(string userId, string characterName);
    Task<List<FChatChannel>> GetAvailableChannelsAsync(string userId, string characterName);
    Task<List<string>> GetJoinedChannelsAsync(string userId, string characterName);
    Task<List<FChatChannel>> GetJoinedChannelDetailsAsync(string userId, string characterName);
    Task SendPRIMessageAsync(string userId, string characterName, string recipient, string content);
    Task SendStatusUpdateAsync(string userId, string characterName, string status, string? statusMessage = null);
    Task ProcessQueuedMessagesAsync(string userId, string characterName);
    Task RequestProfileAsync(string userId, string characterName, string requestingCharacter);
    Task<List<CharacterConnection>> GetUserCharacterConnectionsAsync(string userId);
    Task<CharacterConnection?> GetCharacterConnectionAsync(string userId, string characterName);
    Task SetActiveCharacterAsync(string userId, string characterName);
    Task<string?> GetActiveCharacterAsync(string userId);
    Task CleanupInvalidCharactersAsync(string userId);
    Task CleanupInvalidChannelsAsync();
    Task<bool> HasWebSocketConnectionAsync(string userId, string characterName);
    Task RefreshUserConnectionAsync(string userId);
    Task ClearChannelCacheAsync();
    
    // Channel character list methods
    Task<List<ChannelCharacter>> GetChannelCharactersAsync(string userId, string characterName, string channelId);
    Task<bool> RequestChannelOperatorListAsync(string userId, string characterName, string channelId);
    
    // Friends and bookmarks methods
    Task<(List<Friend> Friends, List<string> Bookmarks, List<Friend> BookmarksWithStatus)> GetFriendsAndBookmarksAsync(string userId);
    Task<bool> AddBookmarkAsync(string userId, string characterName, string bookmarkCharacterName);
    Task<bool> RemoveBookmarkAsync(string userId, string characterName, string bookmarkCharacterName);
    
    // Search methods
    Task SearchCharactersAsync(string userId, string characterName, Dictionary<string, object> searchCriteria);
    
    // Status methods
    Task<DetailedConnectionStatusDto> GetDetailedConnectionStatusAsync(string userId);
}