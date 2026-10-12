using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Unified Character model that consolidates all character information across connections.
/// Characters are shared across connections - the same character in Blazon's connection is the same character in Kredden's connection.
/// </summary>
public class Character
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// The character's name (unique identifier across all connections)
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Character's current status (online, away, busy, etc.)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Status { get; set; } = "offline";

    /// <summary>
    /// Character's status message
    /// </summary>
    [MaxLength(500)]
    public string? StatusMessage { get; set; }

    /// <summary>
    /// Character's gender
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Gender { get; set; } = "None";

    /// <summary>
    /// When this character was last seen online
    /// </summary>
    public DateTime LastSeen { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When this character was first discovered by our system
    /// </summary>
    public DateTime FirstSeen { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Whether this character is currently online (across any connection)
    /// </summary>
    public bool IsOnline { get; set; } = false;

    /// <summary>
    /// Cached F-List profile, serialized ProfileData (jsonb). Null until first fetched.
    /// </summary>
    public string? ProfileJson { get; set; }

    /// <summary>
    /// When ProfileJson was last fetched from F-List. Staleness is decided from this column only.
    /// </summary>
    public DateTime? ProfileFetchedAt { get; set; }

    [NotMapped]
    public ProfileData? Profile
    {
        get => ProfileJson is null ? null : JsonSerializer.Deserialize<ProfileData>(ProfileJson);
        set => ProfileJson = value is null ? null : JsonSerializer.Serialize(value);
    }

    /// <summary>
    /// List of connections where this character has been seen
    /// </summary>
    public virtual ICollection<CharacterConnection> Connections { get; set; } = new List<CharacterConnection>();

    /// <summary>
    /// List of channels this character is currently in
    /// </summary>
    public virtual ICollection<CharacterChannel> Channels { get; set; } = new List<CharacterChannel>();

    /// <summary>
    /// Update character status information
    /// </summary>
    public void UpdateStatus(string status, string? statusMessage = null, bool isOnline = true)
    {
        Status = status;
        StatusMessage = statusMessage;
        
        // Determine if character is online based on status
        // Any non-offline status means the character is online
        var statusLower = status?.ToLower() ?? "offline";
        IsOnline = statusLower != "offline";
        
        LastSeen = DateTime.UtcNow;
    }
}

