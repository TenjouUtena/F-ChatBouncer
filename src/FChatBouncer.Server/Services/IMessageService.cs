using FChatBouncer.Server.Hubs;
using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

public interface IMessageService
{
    Task<List<MessageDto>> GetMessagesAsync(string userId, string channel, DateTime since, int limit = 100);
    Task<List<MessageDto>> GetRecentMessagesAsync(string userId, DateTime since);
    Task SaveMessageAsync(string userId, string channel, string sender, string content, MessageType messageType, string characterName = "");
    Task<int> PurgeMessagesAsync(string userId, DateTime? before = null, string? channel = null);
    Task QueueMessageAsync(string userId, string channel, string senderCharacter, string content, MessageType messageType);
    Task<List<QueuedMessage>> GetQueuedMessagesAsync(string userId);
    Task ProcessQueuedMessageAsync(int queuedMessageId);
    Task ClearQueuedMessagesAsync(string userId);
}
