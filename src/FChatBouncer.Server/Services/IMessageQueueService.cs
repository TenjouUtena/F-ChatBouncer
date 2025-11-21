using FChatBouncer.Server.MessageQueue;

namespace FChatBouncer.Server.Services;

public interface IMessageQueueService
{
    Task<string> PublishRoomMessageAsync(
        string userId,
        string roomId,
        string senderId,
        string senderCharacterId,
        string content,
        string messageType,
        string? fchatMessageId = null,
        CancellationToken cancellationToken = default);

    Task<string> PublishDirectMessageAsync(
        string userId,
        string conversationId,
        string senderId,
        string recipientId,
        string content,
        string messageType,
        string? channelName = null,
        string? fchatMessageId = null,
        CancellationToken cancellationToken = default);

    Task<string> PublishSystemEventAsync(
        string userId,
        string eventType,
        object data,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<StreamMessageEntry>> GetRoomMessagesAsync(
        string userId,
        string userAgentId,
        string roomId,
        int batchSize = 100,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<StreamMessageEntry>> GetDirectMessagesAsync(
        string userId,
        string userAgentId,
        string conversationId,
        int batchSize = 100,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<StreamMessageEntry>> GetMissedMessagesAsync(
        string userId,
        string userAgentId,
        int limitPerStream = 200,
        CancellationToken cancellationToken = default);

    Task AcknowledgeMessageAsync(
        string userId,
        string userAgentId,
        string streamKey,
        string messageId,
        CancellationToken cancellationToken = default);
}

