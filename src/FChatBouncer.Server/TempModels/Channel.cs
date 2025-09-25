using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class Channel
{
    public int Id { get; set; }

    public string UserId { get; set; } = null!;

    public string FchatChannelName { get; set; } = null!;

    public string? DisplayName { get; set; }

    public bool Subscribed { get; set; }

    public DateTime JoinedAt { get; set; }

    public virtual AspNetUser User { get; set; } = null!;
}
