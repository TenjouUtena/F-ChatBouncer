using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class UserSession
{
    public int Id { get; set; }

    public string UserId { get; set; } = null!;

    public string? FchatSessionId { get; set; }

    public int Status { get; set; }

    public DateTime ConnectedAt { get; set; }

    public DateTime LastActivity { get; set; }

    public virtual AspNetUser User { get; set; } = null!;
}
