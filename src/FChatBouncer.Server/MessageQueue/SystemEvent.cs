using System.Text.Json;

namespace FChatBouncer.Server.MessageQueue;

/// <summary>
/// Stream message representing system-wide events or notifications.
/// </summary>
public class SystemEvent : StreamMessage
{
    public SystemEvent()
    {
        StreamType = StreamMessageTypes.System;
    }

    /// <summary>
    /// Event classification.
    /// </summary>
    public string EventType { get; set; } = string.Empty;

    /// <summary>
    /// Arbitrary event payload data.
    /// </summary>
    public JsonElement Data { get; set; }
}

