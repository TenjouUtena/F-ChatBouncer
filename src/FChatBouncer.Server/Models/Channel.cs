using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

public class Channel
{
    [Key]
    public int Id { get; set; }

    [Required]
    public string UserId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string FChatChannelName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? DisplayName { get; set; }

    public bool Subscribed { get; set; } = true;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public virtual BouncerUser User { get; set; } = null!;
}