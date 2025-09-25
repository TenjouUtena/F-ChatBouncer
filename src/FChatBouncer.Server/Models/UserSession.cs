using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

public class UserSession
{
    [Key]
    public int Id { get; set; }

    [Required]
    public string UserId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? FChatSessionId { get; set; }

    public SessionStatus Status { get; set; } = SessionStatus.Disconnected;
    public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastActivity { get; set; } = DateTime.UtcNow;

    // Navigation property
    public virtual BouncerUser User { get; set; } = null!;
}

public enum SessionStatus
{
    Disconnected,
    Connecting,
    Connected,
    Error
}