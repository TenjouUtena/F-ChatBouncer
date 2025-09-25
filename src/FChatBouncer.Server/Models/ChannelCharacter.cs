namespace FChatBouncer.Server.Models;

public class ChannelCharacter
{
    public string CharacterName { get; set; } = string.Empty;
    public string ChannelId { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public CharacterStatus Status { get; set; } = CharacterStatus.Online;
    public string? StatusMessage { get; set; }
    public string Gender { get; set; } = string.Empty;
}

public enum CharacterStatus
{
    Online,
    Away,
    Busy,
    Looking,
    DoNotDisturb
}

public class ChannelCharacterList
{
    public string ChannelId { get; set; } = string.Empty;
    public string ChannelName { get; set; } = string.Empty;
    public List<ChannelCharacter> Characters { get; set; } = new();
    public DateTime LastUpdated { get; set; }
    public int TotalCount => Characters.Count;
}
