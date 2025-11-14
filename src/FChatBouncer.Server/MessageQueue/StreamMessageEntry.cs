namespace FChatBouncer.Server.MessageQueue;

/// <summary>
/// Represents a Redis stream entry mapped to a typed <see cref="StreamMessage"/>.
/// </summary>
public sealed class StreamMessageEntry
{
    public StreamMessageEntry(string streamKey, string messageId, StreamMessage message)
    {
        StreamKey = streamKey ?? throw new ArgumentNullException(nameof(streamKey));
        MessageId = messageId ?? throw new ArgumentNullException(nameof(messageId));
        Message = message ?? throw new ArgumentNullException(nameof(message));
    }

    /// <summary>
    /// Redis stream key where the message resides.
    /// </summary>
    public string StreamKey { get; }

    /// <summary>
    /// Redis stream entry identifier.
    /// </summary>
    public string MessageId { get; }

    /// <summary>
    /// Deserialized message payload.
    /// </summary>
    public StreamMessage Message { get; }
}

