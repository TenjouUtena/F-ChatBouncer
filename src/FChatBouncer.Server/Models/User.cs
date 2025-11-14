using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

public class BouncerUser : IdentityUser
{
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastLoginAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
    
    // Google OAuth fields
    public string? GoogleId { get; set; }
    public string? GoogleEmail { get; set; }
    public string? GoogleName { get; set; }
    public string? GooglePicture { get; set; }
    
    // Security fields
    public int FailedLoginAttempts { get; set; } = 0;
    public new DateTime? LockoutEnd { get; set; }
    public DateTime? LastPasswordChange { get; set; }
    
    // F-Chat credentials status
    public bool HasFChatCredentials { get; set; } = false;
    public DateTime? LastFChatCredentialsUpdate { get; set; }

    // Navigation properties
    public virtual UserSettings? Settings { get; set; }
    public virtual ICollection<UserSession> Sessions { get; set; } = new List<UserSession>();
    public virtual ICollection<Message> Messages { get; set; } = new List<Message>();
    public virtual ICollection<Channel> Channels { get; set; } = new List<Channel>();
    public virtual ICollection<QueuedMessage> QueuedMessages { get; set; } = new List<QueuedMessage>();
    // Profiles navigation property removed - data migrated to Character model
    public virtual ICollection<CharacterConnection> CharacterConnections { get; set; } = new List<CharacterConnection>();
    public virtual ICollection<CharacterChannel> CharacterChannels { get; set; } = new List<CharacterChannel>();
}

public class UserSettings
{
    [Key]
    public string UserId { get; set; } = string.Empty;

    public int RetentionDays { get; set; } = 30;
    public bool AutoPurgeEnabled { get; set; } = true;
    public string? FChatCredentialsEncrypted { get; set; }
    public DateTime LastPurge { get; set; } = DateTime.UtcNow;

    // Navigation property
    public virtual BouncerUser User { get; set; } = null!;
}