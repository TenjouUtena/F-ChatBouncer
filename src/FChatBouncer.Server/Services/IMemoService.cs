namespace FChatBouncer.Server.Services;

public interface IMemoService
{
    /// <summary>
    /// Gets the user's memo for a character, or null if none
    /// </summary>
    Task<string?> GetMemoAsync(string userId, string characterName);

    /// <summary>
    /// Creates or updates the user's memo for a character
    /// </summary>
    Task UpdateMemoAsync(string userId, string characterName, string? memo);
}
