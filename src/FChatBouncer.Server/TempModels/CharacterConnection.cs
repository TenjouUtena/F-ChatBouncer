using System;
using System.Collections.Generic;

namespace FChatBouncer.Server.TempModels;

public partial class CharacterConnection
{
    public int Id { get; set; }

    public string UserId { get; set; } = null!;

    public string FchatUsername { get; set; } = null!;

    public string FchatPasswordEncrypted { get; set; } = null!;

    public bool IsActive { get; set; }

    public bool IsConnected { get; set; }

    public DateTime ConnectedAt { get; set; }

    public DateTime LastActivityAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public int CharacterId { get; set; }

    public virtual Character Character { get; set; } = null!;

    public virtual ICollection<CharacterChannel> CharacterChannels { get; set; } = new List<CharacterChannel>();

    public virtual AspNetUser User { get; set; } = null!;
}
