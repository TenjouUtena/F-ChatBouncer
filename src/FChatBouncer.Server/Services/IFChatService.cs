using FChatBouncer.Server.Hubs;
using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;


public interface IFChatService
{
    // Legacy single-character methods (for backward compatibility)
    Task ConnectUserAsync(string userId, string fchatUsername, string fchatPassword);
    Task DisconnectUserAsync(string userId);
    Task SendMessageAsync(string userId, string channel, string message);
    Task JoinChannelAsync(string userId, string channel);
    Task LeaveChannelAsync(string userId, string channel);
    Task<bool> IsUserConnectedAsync(string userId);
    Task<List<FChatCharacter>> GetCharactersAsync(string userId);
    Task SelectCharacterAsync(string userId, string characterName);
    Task SwitchCharacterAsync(string userId, string characterName);
    Task<FChatCharacter?> GetSelectedCharacterAsync(string userId);
    Task<List<FChatChannel>> GetChannelListAsync(string userId);
    Task<List<string>> GetJoinedChannelsAsync(string userId);
    Task<List<FChatChannel>> GetJoinedChannelDetailsAsync(string userId);
    Task SendPRIMessageAsync(string userId, string v, string content);
    Task ProcessQueuedMessagesAsync(string userId);
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
}