using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class QueuedMessage
{
    public int Id { get; set; }

    public string UserId { get; set; } = null!;

    public string ChannelName { get; set; } = null!;

    public string SenderCharacter { get; set; } = null!;

    public string Content { get; set; } = null!;

    public int MessageType { get; set; }

    public DateTime QueuedAt { get; set; }

    public int RetryCount { get; set; }

    public DateTime? LastAttempt { get; set; }

    public virtual AspNetUser User { get; set; } = null!;
}
