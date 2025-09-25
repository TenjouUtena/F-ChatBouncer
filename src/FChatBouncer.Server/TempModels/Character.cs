using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class Character
{
    public int Id { get; set; }

    public string Name { get; set; } = null!;

    public string Status { get; set; } = null!;

    public string? StatusMessage { get; set; }

    public string Gender { get; set; } = null!;

    public DateTime LastSeen { get; set; }

    public DateTime FirstSeen { get; set; }

    public DateTime LastUpdated { get; set; }

    public string? ProfileData { get; set; }

    public string? StructuredProfileData { get; set; }

    public string? RawProData { get; set; }

    public bool IsOnline { get; set; }

    public virtual ICollection<CharacterChannel> CharacterChannels { get; set; } = new List<CharacterChannel>();

    public virtual ICollection<CharacterConnection> CharacterConnections { get; set; } = new List<CharacterConnection>();
}
