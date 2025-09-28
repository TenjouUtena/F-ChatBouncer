using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Unified Character model that consolidates all character information across connections.
/// This replaces the fragmented approach of ChannelCharacter, FChatCharacter, Profile, and ProfileData.
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
    /// When this character's information was last updated
    /// </summary>
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Raw profile data from F-Chat (JSON format)
    /// </summary>
    public string? ProfileData { get; set; }

    /// <summary>
    /// Structured profile data (parsed from ProfileData)
    /// </summary>
    public string? StructuredProfileData { get; set; }

    /// <summary>
    /// Raw PRO command payload for debugging
    /// </summary>
    public string? RawProData { get; set; }

    /// <summary>
    /// Whether this character is currently online (across any connection)
    /// </summary>
    public bool IsOnline { get; set; } = false;

    /// <summary>
    /// User's memo/note for this character (from F-List)
    /// </summary>
    [MaxLength(1000)]
    public string? Memo { get; set; }

    /// <summary>
    /// When the memo was last updated
    /// </summary>
    public DateTime? MemoLastUpdated { get; set; }

    /// <summary>
    /// List of connections where this character has been seen
    /// </summary>
    public virtual ICollection<CharacterConnection> Connections { get; set; } = new List<CharacterConnection>();

    /// <summary>
    /// List of channels this character is currently in
    /// </summary>
    public virtual ICollection<CharacterChannel> Channels { get; set; } = new List<CharacterChannel>();

    /// <summary>
    /// Get the structured profile data as a ProfileData object
    /// </summary>
    public ProfileData? GetStructuredProfile()
    {
        if (string.IsNullOrEmpty(StructuredProfileData))
            return null;

        try
        {
            var profileData = JsonSerializer.Deserialize<ProfileData>(StructuredProfileData);
            // Console logging removed
            return profileData;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Set the structured profile data from a ProfileData object
    /// </summary>
    public void SetStructuredProfile(ProfileData profileData)
    {
        if (profileData == null)
        {
            StructuredProfileData = null;
            return;
        }

        // Update character properties from profile data
        Name = profileData.CharacterName;
        
        // Extract gender from profile data first
        profileData.ExtractGender();
        
        // Update gender if we have a valid value from profile data
        if (!string.IsNullOrEmpty(profileData.Gender) && profileData.Gender != "None")
        {
            Gender = profileData.Gender;
        }

        // Serialize the structured data
        StructuredProfileData = JsonSerializer.Serialize(profileData, new JsonSerializerOptions
        {
            WriteIndented = true
        });

        // Console logging removed

        LastUpdated = DateTime.UtcNow;
    }

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
        LastUpdated = DateTime.UtcNow;
    }

    /// <summary>
    /// Get a summary of the character for logging/debugging
    /// </summary>
    public string GetSummary()
    {
        var profile = GetStructuredProfile();
        var profileSummary = profile?.GetSummary() ?? "No profile data";
        return $"Character: {Name}, Status: {Status}, Gender: {Gender}, Online: {IsOnline}, Profile: {profileSummary}";
    }
}

