using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class Profile
{
    public int Id { get; set; }

    public string UserId { get; set; } = null!;

    public string CharacterName { get; set; } = null!;

    public string ProfileData { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string? RawProData { get; set; }

    public virtual AspNetUser User { get; set; } = null!;
}
