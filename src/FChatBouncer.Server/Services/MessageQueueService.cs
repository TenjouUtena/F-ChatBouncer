using System.Text.Json;
using FChatBouncer.Server.Infrastructure;
using FChatBouncer.Server.MessageQueue;

namespace FChatBouncer.Server.Services;

public class MessageQueueService : IMessageQueueService
{
    private readonly IMessageQueue _messageQueue;
    private readonly IRedisConnectionFactory _redisConnectionFactory;
    private readonly ILogger<MessageQueueService> _logger;

    public MessageQueueService(
        IMessageQueue messageQueue,
        IRedisConnectionFactory redisConnectionFactory,
        ILogger<MessageQueueService> logger)
    {
        _messageQueue = messageQueue ?? throw new ArgumentNullException(nameof(messageQueue));
        _redisConnectionFactory = redisConnectionFactory ?? throw new ArgumentNullException(nameof(redisConnectionFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<string> PublishRoomMessageAsync(
        string userId,
        string roomId,
        string senderId,
        string senderCharacterId,
        string content,
        string messageType,
        CancellationToken cancellationToken = default)
    {
        var normalizedType = NormalizeMessageType(messageType);

        var message = new RoomMessage
        {
            OwnerUserId = userId,
            RoomId = roomId,
            SenderId = senderId,
            SenderCharacterId = senderCharacterId,
            Content = content,
            MessageType = normalizedType,
            Timestamp = DateTime.UtcNow,
            DeliveryTag = StreamIdHelper.GenerateDeliveryTag(),
            Metadata =
            {
                ["roomId"] = roomId,
                ["senderCharacter"] = senderCharacterId,
                ["originalMessageType"] = messageType,
                ["channel"] = roomId
            }
        };

        var streamKey = StreamKeys.GetRoomStreamKey(userId, roomId);
        return await _messageQueue.PublishMessageAsync(streamKey, message, cancellationToken).ConfigureAwait(false);
    }

    public async Task<string> PublishDirectMessageAsync(
        string userId,
        string conversationId,
        string senderId,
        string recipientId,
        string content,
        string messageType,
        CancellationToken cancellationToken = default)
    {
        var normalizedType = NormalizeMessageType(messageType);

        // Ensure deterministic conversation id ordering
        var normalizedConversationId = NormalizeConversationId(conversationId);

        var message = new DirectMessage
        {
            OwnerUserId = userId,
            ConversationId = normalizedConversationId,
            SenderId = senderId,
            RecipientId = recipientId,
            Content = content,
            MessageType = normalizedType,
            Timestamp = DateTime.UtcNow,
            DeliveryTag = StreamIdHelper.GenerateDeliveryTag(),
            Metadata =
            {
                ["conversationId"] = normalizedConversationId,
                ["recipientId"] = recipientId,
                ["originalMessageType"] = messageType,
                ["channel"] = normalizedConversationId
            }
        };

        var streamKey = StreamKeys.GetDirectStreamKey(userId, normalizedConversationId);
        return await _messageQueue.PublishMessageAsync(streamKey, message, cancellationToken).ConfigureAwait(false);
    }

    public async Task<string> PublishSystemEventAsync(
        string userId,
        string eventType,
        object data,
        CancellationToken cancellationToken = default)
    {
        var payload = JsonSerializer.SerializeToElement(data ?? new { });
        var message = new SystemEvent
        {
            OwnerUserId = userId,
            EventType = eventType,
            Data = payload,
            MessageType = StreamMessageTypes.SystemNotification,
            Timestamp = DateTime.UtcNow,
            DeliveryTag = StreamIdHelper.GenerateDeliveryTag(),
            Metadata =
            {
                ["eventType"] = eventType
            }
        };

        var streamKey = StreamKeys.GetSystemStreamKey(userId);
        return await _messageQueue.PublishMessageAsync(streamKey, message, cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<StreamMessageEntry>> GetRoomMessagesAsync(
        string userId,
        string userAgentId,
        string roomId,
        int batchSize = 100,
        CancellationToken cancellationToken = default)
    {
        var streamKey = StreamKeys.GetRoomStreamKey(userId, roomId);
        var consumerGroup = StreamKeys.GetRoomConsumerGroup(userId, userAgentId, roomId);

        await TrackAgentStreamAsync(userId, userAgentId, streamKey, cancellationToken).ConfigureAwait(false);

        return await _messageQueue.ReadMessagesAsync(streamKey, consumerGroup, userAgentId, batchSize, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<StreamMessageEntry>> GetDirectMessagesAsync(
        string userId,
        string userAgentId,
        string conversationId,
        int batchSize = 100,
        CancellationToken cancellationToken = default)
    {
        var normalizedConversationId = NormalizeConversationId(conversationId);
        var streamKey = StreamKeys.GetDirectStreamKey(userId, normalizedConversationId);
        var consumerGroup = StreamKeys.GetDirectConsumerGroup(userId, userAgentId, normalizedConversationId);

        await TrackAgentStreamAsync(userId, userAgentId, streamKey, cancellationToken).ConfigureAwait(false);

        return await _messageQueue.ReadMessagesAsync(streamKey, consumerGroup, userAgentId, batchSize, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<StreamMessageEntry>> GetMissedMessagesAsync(
        string userId,
        string userAgentId,
        int limitPerStream = 200,
        CancellationToken cancellationToken = default)
    {
        var db = _redisConnectionFactory.GetDatabase();
        var streamsKey = StreamKeys.GetAgentStreamSetKey(userId, userAgentId);
        var offsetHashKey = StreamKeys.GetAgentOffsetHashKey(userId, userAgentId);

        var offsets = await db.HashGetAllAsync(offsetHashKey).ConfigureAwait(false);
        var offsetLookup = offsets.ToDictionary(
            entry => (string)entry.Name!,
            entry => (string)entry.Value!,
            StringComparer.Ordinal);

        var trackedStreams = (await db.SetMembersAsync(streamsKey).ConfigureAwait(false))
            .Select(v => (string)v!)
            .ToHashSet(StringComparer.Ordinal);

        if (trackedStreams.Count == 0)
        {
            foreach (var streamKey in StreamKeys.ScanAllUserStreams(_redisConnectionFactory, userId))
            {
                trackedStreams.Add(streamKey);
            }
        }

        if (trackedStreams.Count == 0)
        {
            return Array.Empty<StreamMessageEntry>();
        }

        var allMessages = new List<StreamMessageEntry>();

        foreach (var streamKey in trackedStreams)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var offset = offsetLookup.TryGetValue(streamKey, out var value) ? value : "0-0";
            var messages = await _messageQueue.GetMessagesAfterIdAsync(streamKey, offset, limitPerStream, cancellationToken)
                .ConfigureAwait(false);

            if (messages.Count > 0)
            {
                await TrackAgentStreamAsync(userId, userAgentId, streamKey, cancellationToken).ConfigureAwait(false);
                allMessages.AddRange(messages);
            }
        }

        return allMessages;
    }

    public async Task AcknowledgeMessageAsync(
        string userId,
        string userAgentId,
        string streamKey,
        string messageId,
        CancellationToken cancellationToken = default)
    {
        var consumerGroup = ResolveConsumerGroup(streamKey, userId, userAgentId);
        await _messageQueue.AcknowledgeMessageAsync(streamKey, consumerGroup, messageId, cancellationToken)
            .ConfigureAwait(false);

        var db = _redisConnectionFactory.GetDatabase();
        var offsetsKey = StreamKeys.GetAgentOffsetHashKey(userId, userAgentId);
        await db.HashSetAsync(offsetsKey, streamKey, messageId).ConfigureAwait(false);
        await TrackAgentStreamAsync(userId, userAgentId, streamKey, cancellationToken).ConfigureAwait(false);
    }

    private async Task TrackAgentStreamAsync(string userId, string userAgentId, string streamKey, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var db = _redisConnectionFactory.GetDatabase();
        var key = StreamKeys.GetAgentStreamSetKey(userId, userAgentId);
        await db.SetAddAsync(key, streamKey).ConfigureAwait(false);
    }

    private static string NormalizeConversationId(string conversationId)
    {
        if (string.IsNullOrWhiteSpace(conversationId))
        {
            return conversationId;
        }

        // Conversation ids are expected to be colon-separated lexicographically sorted IDs.
        var parts = conversationId.Split(':', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Array.Sort(parts, StringComparer.Ordinal);
        return string.Join(':', parts);
    }

    private static string ResolveConsumerGroup(string streamKey, string userId, string userAgentId)
    {
        if (StreamKeys.TryParseRoomStream(streamKey, out var parsedUserId, out var roomId) &&
            string.Equals(parsedUserId, userId, StringComparison.Ordinal))
        {
            return StreamKeys.GetRoomConsumerGroup(userId, userAgentId, roomId);
        }

        if (StreamKeys.TryParseDirectStream(streamKey, out parsedUserId, out var conversationId) &&
            string.Equals(parsedUserId, userId, StringComparison.Ordinal))
        {
            return StreamKeys.GetDirectConsumerGroup(userId, userAgentId, conversationId);
        }

        if (StreamKeys.TryParseSystemStream(streamKey, out parsedUserId) &&
            string.Equals(parsedUserId, userId, StringComparison.Ordinal))
        {
            return StreamKeys.GetSystemConsumerGroup(userId, userAgentId);
        }

        throw new InvalidOperationException($"Unable to resolve consumer group for stream '{streamKey}' and user '{userId}'.");
    }

    private static string NormalizeMessageType(string messageType)
    {
        return messageType switch
        {
            "Roll" => StreamMessageTypes.Roll,
            "Action" => StreamMessageTypes.Action,
            "System" => StreamMessageTypes.SystemNotification,
            "Announcement" => StreamMessageTypes.Announcement,
            "Private" => StreamMessageTypes.Direct,
            _ => StreamMessageTypes.Chat
        };
    }
}

