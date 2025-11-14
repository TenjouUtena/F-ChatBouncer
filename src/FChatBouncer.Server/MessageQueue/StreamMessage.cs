using System.Text.Json.Serialization;

namespace FChatBouncer.Server.MessageQueue;

/// <summary>
/// Represents the common metadata persisted for all stream-based messages.
/// </summary>
public class StreamMessage
{
    /// <summary>
    /// Redis stream entry ID assigned when the message is persisted.
    /// </summary>
    public string? Id { get; set; }

    /// <summary>
    /// Logical stream type (room, direct, system).
    /// </summary>
    public string StreamType { get; set; } = StreamMessageTypes.Room;

    /// <summary>
    /// Application level message classification (chat, action, roll, system, etc).
    /// </summary>
    public string MessageType { get; set; } = StreamMessageTypes.Chat;

    /// <summary>
    /// Timestamp when the message was created (UTC).
    /// </summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Actor identifier associated with the message (F-Chat character or system).
    /// </summary>
    public string SenderId { get; set; } = string.Empty;

    /// <summary>
    /// Character identifier representing the local user's character that received the message.
    /// </summary>
    public string SenderCharacterId { get; set; } = string.Empty;

    /// <summary>
    /// Message payload/content.
    /// </summary>
    public string Content { get; set; } = string.Empty;

    /// <summary>
    /// Delivery tag used for deduplication on the client.
    /// </summary>
    public string DeliveryTag { get; set; } = string.Empty;

    /// <summary>
    /// Logical owner of the stream (Bouncer user).
    /// </summary>
    public string? OwnerUserId { get; set; }

    /// <summary>
    /// Stream key this message belongs to.
    /// </summary>
    public string? StreamKey { get; set; }

    /// <summary>
    /// Optional message metadata.
    /// </summary>
    public IDictionary<string, string> Metadata { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
}

