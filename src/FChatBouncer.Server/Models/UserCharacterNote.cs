using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

/// <summary>
/// A user's private note (memo) about a character. Keyed by (UserId, CharacterId).
/// </summary>
public class UserCharacterNote
{
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    public int CharacterId { get; set; }

    [MaxLength(1000)]
    public string? Memo { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
