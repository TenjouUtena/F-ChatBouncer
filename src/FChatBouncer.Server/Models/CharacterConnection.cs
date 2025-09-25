using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Represents a connection between a user and a character
/// </summary>
public class CharacterConnection
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// The user who owns this character connection
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// The character this connection is for
    /// </summary>
    [Required]
    public int CharacterId { get; set; }

    /// <summary>
    /// F-Chat username for this connection
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string FChatUsername { get; set; } = string.Empty;

    /// <summary>
    /// Encrypted F-Chat password for this connection
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string FChatPasswordEncrypted { get; set; } = string.Empty;

    /// <summary>
    /// Whether this character connection is currently active (selected by user)
    /// </summary>
    public bool IsActive { get; set; } = false;

    /// <summary>
    /// Whether this character connection is currently connected to F-Chat
    /// </summary>
    public bool IsConnected { get; set; } = false;

    /// <summary>
    /// When this connection was established
    /// </summary>
    public DateTime ConnectedAt { get; set; }

    /// <summary>
    /// When this connection was last active
    /// </summary>
    public DateTime LastActivityAt { get; set; }

    /// <summary>
    /// When this connection was created
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    [ForeignKey(nameof(UserId))]
    public virtual BouncerUser User { get; set; } = null!;

    [ForeignKey(nameof(CharacterId))]
    public virtual Character Character { get; set; } = null!;

    public virtual ICollection<CharacterChannel> CharacterChannels { get; set; } = new List<CharacterChannel>();
}
