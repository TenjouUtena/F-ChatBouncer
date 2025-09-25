using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class UserSetting
{
    public string UserId { get; set; } = null!;

    public int RetentionDays { get; set; }

    public bool AutoPurgeEnabled { get; set; }

    public string? FchatCredentialsEncrypted { get; set; }

    public DateTime LastPurge { get; set; }

    public virtual AspNetUser User { get; set; } = null!;
}
