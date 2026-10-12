namespace FChatBouncer.Server.Models;

/// <summary>
/// Gender and presence for one character, pushed to the browser so it can colour names
/// without fetching profiles.
/// </summary>
public sealed record CharacterInfoDto(string Name, string Gender, string Status, string? StatusMessage, bool IsOnline)
{
    public static CharacterInfoDto From(Character c) => new(c.Name, c.Gender, c.Status, c.StatusMessage, c.IsOnline);

    public static CharacterInfoDto From(FChatCharacter c) => new(c.Name, c.Gender, c.Status, c.StatusMessage, true);
}
