using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class Message
{
    public int Id { get; set; }

    public string UserId { get; set; } = null!;

    public string ChannelName { get; set; } = null!;

    public int MessageType { get; set; }

    public string Sender { get; set; } = null!;

    public string Content { get; set; } = null!;

    public DateTime Timestamp { get; set; }

    public string? FchatMessageId { get; set; }

    public string CharacterName { get; set; } = null!;

    public virtual AspNetUser User { get; set; } = null!;
}
