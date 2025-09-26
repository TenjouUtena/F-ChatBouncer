using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

public interface IMemoService
{
    /// <summary>
    /// Fetches a memo for a character from F-List API
    /// </summary>
    /// <param name="userId">The user ID</param>
    /// <param name="characterName">The character name to get memo for</param>
    /// <returns>The memo data or null if not found</returns>
    Task<MemoData?> GetMemoAsync(string userId, string characterName);

    /// <summary>
    /// Updates memo for a character in the database
    /// </summary>
    /// <param name="userId">The user ID</param>
    /// <param name="characterName">The character name</param>
    /// <param name="memo">The memo text</param>
    Task UpdateMemoAsync(string userId, string characterName, string? memo);

    /// <summary>
    /// Refreshes memo for a character from F-List API and updates database
    /// </summary>
    /// <param name="userId">The user ID</param>
    /// <param name="characterName">The character name</param>
    Task RefreshMemoAsync(string userId, string characterName);
}

public class MemoData
{
    public string? Note { get; set; }
    public string? Id { get; set; }
    public string? Error { get; set; }
}

