namespace FChatBouncer.Server.MessageQueue;

/// <summary>
/// Stream message representing a room/channel broadcast.
/// </summary>
public class RoomMessage : StreamMessage
{
    public RoomMessage()
    {
        StreamType = StreamMessageTypes.Room;
    }

    /// <summary>
    /// Identifier of the room/channel (F-Chat channel id).
    /// </summary>
    public string RoomId { get; set; } = string.Empty;
}

