namespace FChatBouncer.Server.Models;

/// <summary>
/// One member of a channel as sent to the browser
/// </summary>
public sealed record ChannelCharacterDto(
    string CharacterName,
    string Status,
    string? StatusMessage,
    string Gender,
    DateTime JoinedAt,
    DateTime LastSeenAt)
{
    public static ChannelCharacterDto From(ChannelCharacter c) => new(
        c.CharacterName,
        c.Status.ToString().ToLowerInvariant(),
        c.StatusMessage,
        string.IsNullOrEmpty(c.Gender) ? "None" : c.Gender,
        c.JoinedAt,
        c.LastSeenAt);
}

/// <summary>
/// Full member list of a channel (ReceiveChannelCharacters)
/// </summary>
public sealed record ChannelCharactersDto(string ChannelId, string RequestingCharacter, ChannelCharacterDto[] Characters)
{
    public static ChannelCharactersDto From(string channelId, string requestingCharacter, IEnumerable<ChannelCharacter> characters) =>
        new(channelId, requestingCharacter, characters.Select(ChannelCharacterDto.From).ToArray());
}
