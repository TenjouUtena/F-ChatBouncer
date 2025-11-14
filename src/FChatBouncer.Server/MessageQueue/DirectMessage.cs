namespace FChatBouncer.Server.MessageQueue;

/// <summary>
/// Stream message representing direct/private conversations.
/// </summary>
public class DirectMessage : StreamMessage
{
    public DirectMessage()
    {
        StreamType = StreamMessageTypes.Direct;
    }

    /// <summary>
    /// Conversation identifier (lexicographically sorted participant ids).
    /// </summary>
    public string ConversationId { get; set; } = string.Empty;

    /// <summary>
    /// Target recipient identifier.
    /// </summary>
    public string RecipientId { get; set; } = string.Empty;
}

