using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class CharacterChannel
{
    public int Id { get; set; }

    public string ChannelId { get; set; } = null!;

    public DateTime JoinedAt { get; set; }

    public DateTime LastActivityAt { get; set; }

    public string? BouncerUserId { get; set; }

    public int CharacterConnectionId { get; set; }

    public int? CharacterId { get; set; }

    public virtual AspNetUser? BouncerUser { get; set; }

    public virtual Character? Character { get; set; }

    public virtual CharacterConnection CharacterConnection { get; set; } = null!;
}
