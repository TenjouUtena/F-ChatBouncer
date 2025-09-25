using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Represents a character's membership in a channel
/// </summary>
public class CharacterChannel
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// The character connection this channel membership belongs to
    /// </summary>
    [Required]
    public int CharacterConnectionId { get; set; }

    /// <summary>
    /// The channel ID
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string ChannelId { get; set; } = string.Empty;

    /// <summary>
    /// When this character joined this channel
    /// </summary>
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When this character was last active in this channel
    /// </summary>
    public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    [ForeignKey(nameof(CharacterConnectionId))]
    public virtual CharacterConnection CharacterConnection { get; set; } = null!;
}
