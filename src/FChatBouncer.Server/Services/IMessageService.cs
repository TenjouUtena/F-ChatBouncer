using FChatBouncer.Server.Hubs;
using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

public interface IMessageService
{
    Task<List<MessageDto>> GetMessagesAsync(string userId, string channel, DateTime since, int limit = 100);
    Task<List<MessageDto>> GetChannelMessagesSinceAsync(string userId, string channel, DateTime since, int limit = 100);
    Task<List<MessageDto>> GetRecentMessagesAsync(string userId, DateTime since);
    Task SaveMessageAsync(string userId, string channel, string sender, string content, MessageType messageType, string characterName = "", string? messageId = null);
    Task<int> PurgeMessagesAsync(string userId, DateTime? before = null, string? channel = null);
    Task QueueMessageAsync(string userId, string channel, string senderCharacter, string content, MessageType messageType);
    Task<List<QueuedMessage>> GetQueuedMessagesAsync(string userId);
    Task ProcessQueuedMessageAsync(int queuedMessageId);
    Task ClearQueuedMessagesAsync(string userId);
    
    // New log retrieval methods
    Task<List<CharacterLogSummary>> GetCharactersWithLogsAsync(string userId);
    Task<List<ChannelLogSummary>> GetChannelsWithLogsAsync(string userId);
    Task<List<Message>> GetCharacterLogsAsync(string userId, string characterName, DateTime? since = null, DateTime? until = null, int limit = 1000);
    Task<List<Message>> GetChannelLogsAsync(string userId, string channelName, DateTime? since = null, DateTime? until = null, int limit = 1000);
    Task<List<Message>> GetCharacterChannelLogsAsync(string userId, string characterName, string channelName, DateTime? since = null, DateTime? until = null, int limit = 1000);
    Task<List<Message>> SearchLogsAsync(string userId, string? characterName = null, string? channelName = null, string? content = null, string? messageType = null, DateTime? since = null, DateTime? until = null, int limit = 1000);
}

// DTOs for log summaries
public class CharacterLogSummary
{
    public string CharacterName { get; set; } = string.Empty;
    public int MessageCount { get; set; }
    public DateTime LastMessageTime { get; set; }
    public string[] Channels { get; set; } = Array.Empty<string>();
}

public class ChannelLogSummary
{
    public string ChannelName { get; set; } = string.Empty;
    public string ChannelTitle { get; set; } = string.Empty;
    public int MessageCount { get; set; }
    public DateTime LastMessageTime { get; set; }
    public string[] Characters { get; set; } = Array.Empty<string>();
}
