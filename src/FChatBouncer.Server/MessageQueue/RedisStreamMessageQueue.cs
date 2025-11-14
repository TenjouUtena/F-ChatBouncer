using System.Text.Json;
using FChatBouncer.Server.Infrastructure;
using StackExchange.Redis;

namespace FChatBouncer.Server.MessageQueue;

public class RedisStreamMessageQueue : IMessageQueue
{
    private readonly IRedisConnectionFactory _connectionFactory;
    private readonly ILogger<RedisStreamMessageQueue> _logger;
    private readonly JsonSerializerOptions _serializerOptions;

    public RedisStreamMessageQueue(
        IRedisConnectionFactory connectionFactory,
        ILogger<RedisStreamMessageQueue> logger)
    {
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));

        _serializerOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };
    }

    public async Task<string> PublishMessageAsync(string streamKey, StreamMessage message, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(streamKey))
        {
            throw new ArgumentException("Stream key cannot be null or empty", nameof(streamKey));
        }

        if (message is null)
        {
            throw new ArgumentNullException(nameof(message));
        }

        cancellationToken.ThrowIfCancellationRequested();

        var db = _connectionFactory.GetDatabase();
        message.StreamKey = streamKey;
        message.Timestamp = message.Timestamp == default ? DateTime.UtcNow : message.Timestamp.ToUniversalTime();

        if (string.IsNullOrWhiteSpace(message.DeliveryTag))
        {
            message.DeliveryTag = StreamIdHelper.GenerateDeliveryTag();
        }

        var payload = JsonSerializer.Serialize(message, message.GetType(), _serializerOptions);

        var entries = new[]
        {
            new NameValueEntry("payload", payload),
            new NameValueEntry("streamType", message.StreamType),
            new NameValueEntry("messageType", message.MessageType),
            new NameValueEntry("timestamp", StreamIdHelper.GetMillisecondsTimestamp(message.Timestamp)),
            new NameValueEntry("deliveryTag", message.DeliveryTag)
        };

        var messageId = await db.StreamAddAsync(streamKey, entries).ConfigureAwait(false);
        _logger.LogDebug("Published message to {StreamKey} with id {MessageId}", streamKey, messageId);

        return messageId;
    }

    public async Task<IReadOnlyList<StreamMessageEntry>> ReadMessagesAsync(
        string streamKey,
        string consumerGroupName,
        string consumerId,
        int batchSize = 100,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var db = _connectionFactory.GetDatabase();
        await EnsureConsumerGroupAsync(db, streamKey, consumerGroupName, cancellationToken).ConfigureAwait(false);

        var entries = await db.StreamReadGroupAsync(streamKey, consumerGroupName, consumerId, ">", batchSize)
            .ConfigureAwait(false);

        return DeserializeEntries(streamKey, entries);
    }

    public async Task<string?> GetConsumerOffsetAsync(
        string streamKey,
        string consumerGroupName,
        string consumerId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var db = _connectionFactory.GetDatabase();
        await EnsureConsumerGroupAsync(db, streamKey, consumerGroupName, cancellationToken).ConfigureAwait(false);

        var groups = await db.StreamGroupInfoAsync(streamKey).ConfigureAwait(false);
        var groupInfo = groups.FirstOrDefault(g => g.Name == consumerGroupName);
        return groupInfo.Name == consumerGroupName ? groupInfo.LastDeliveredId : null;
    }

    public async Task AcknowledgeMessageAsync(
        string streamKey,
        string consumerGroupName,
        string messageId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var db = _connectionFactory.GetDatabase();
        await EnsureConsumerGroupAsync(db, streamKey, consumerGroupName, cancellationToken).ConfigureAwait(false);

        await db.StreamAcknowledgeAsync(streamKey, consumerGroupName, messageId).ConfigureAwait(false);
        _logger.LogTrace("Acknowledged message {MessageId} in {StreamKey} for group {Group}", messageId, streamKey, consumerGroupName);
    }

    public async Task<IReadOnlyList<StreamMessageEntry>> GetMessagesAfterIdAsync(
        string streamKey,
        string afterId,
        int limit = 100,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var db = _connectionFactory.GetDatabase();
        var entries = await db.StreamReadAsync(streamKey, afterId, limit).ConfigureAwait(false);
        return DeserializeEntries(streamKey, entries);
    }

    public async Task TrimStreamAsync(string streamKey, int maxMessages, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var db = _connectionFactory.GetDatabase();
        await db.StreamTrimAsync(streamKey, maxMessages).ConfigureAwait(false);
    }

    private async Task EnsureConsumerGroupAsync(
        IDatabase db,
        string streamKey,
        string consumerGroupName,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            await db.StreamCreateConsumerGroupAsync(streamKey, consumerGroupName, StreamPosition.NewMessages)
                .ConfigureAwait(false);
            _logger.LogDebug("Created consumer group {Group} on stream {Stream}", consumerGroupName, streamKey);
        }
        catch (RedisServerException ex) when (ex.Message.Contains("BUSYGROUP", StringComparison.OrdinalIgnoreCase))
        {
            // Consumer group already exists - ignore
        }
        catch (RedisServerException ex) when (ex.Message.Contains("NOGROUP", StringComparison.OrdinalIgnoreCase) ||
                                              ex.Message.Contains("no such key", StringComparison.OrdinalIgnoreCase))
        {
            // Stream does not exist yet. Add a dummy entry and retry group creation.
            await db.StreamAddAsync(streamKey, new NameValueEntry[]
            {
                new("init", "1"),
                new("timestamp", StreamIdHelper.GetMillisecondsTimestamp(DateTime.UtcNow))
            }).ConfigureAwait(false);

            await db.StreamCreateConsumerGroupAsync(streamKey, consumerGroupName, StreamPosition.NewMessages)
                .ConfigureAwait(false);
        }
    }

    private IReadOnlyList<StreamMessageEntry> DeserializeEntries(string streamKey, StreamEntry[] entries)
    {
        if (entries.Length == 0)
        {
            return Array.Empty<StreamMessageEntry>();
        }

        var list = new List<StreamMessageEntry>(entries.Length);

        foreach (var entry in entries)
        {
            try
            {
                var valueMap = entry.Values.ToDictionary(v => (string)v.Name!, v => v.Value);
                var payload = valueMap.TryGetValue("payload", out var payloadValue)
                    ? payloadValue.ToString()
                    : string.Empty;
                var streamType = valueMap.TryGetValue("streamType", out var streamTypeValue)
                    ? streamTypeValue.ToString()
                    : StreamMessageTypes.Room;

                var messageType = ResolveMessageType(streamType);
                var message = !string.IsNullOrWhiteSpace(payload)
                    ? (StreamMessage?)JsonSerializer.Deserialize(payload, messageType, _serializerOptions)
                    : new StreamMessage();

                message ??= new StreamMessage();
                message.Id = entry.Id;
                message.StreamKey = streamKey;
                message.StreamType = streamType;
                message.MessageType = valueMap.TryGetValue("messageType", out var mt) ? mt.ToString() : message.MessageType;
                message.Timestamp = valueMap.TryGetValue("timestamp", out var ts)
                    ? StreamIdHelper.ParseRedisTimestamp(ts.ToString())
                    : DateTime.UtcNow;
                message.DeliveryTag = valueMap.TryGetValue("deliveryTag", out var dt) ? dt.ToString() : message.DeliveryTag;

                list.Add(new StreamMessageEntry(streamKey, entry.Id, message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to deserialize message {MessageId} from stream {StreamKey}", entry.Id, streamKey);
            }
        }

        return list;
    }

    private static Type ResolveMessageType(string streamType)
    {
        return streamType switch
        {
            StreamMessageTypes.Room => typeof(RoomMessage),
            StreamMessageTypes.Direct => typeof(DirectMessage),
            StreamMessageTypes.System => typeof(SystemEvent),
            _ => typeof(StreamMessage)
        };
    }
}

