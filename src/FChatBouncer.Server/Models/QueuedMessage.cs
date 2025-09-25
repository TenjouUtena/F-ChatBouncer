using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

public class QueuedMessage
{
    [Key]
    public int Id { get; set; }

    [Required]
    public string UserId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ChannelName { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string SenderCharacter { get; set; } = string.Empty;

    [Required]
    public string Content { get; set; } = string.Empty;

    [Required]
    public MessageType MessageType { get; set; }

    public DateTime QueuedAt { get; set; } = DateTime.UtcNow;

    public int RetryCount { get; set; } = 0;

    public DateTime? LastAttempt { get; set; }

    // Navigation property
    public virtual BouncerUser User { get; set; } = null!;
}