using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

public class Message
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
    public string CharacterName { get; set; } = string.Empty;

    [Required]
    public MessageType MessageType { get; set; }

    [Required]
    [MaxLength(50)]
    public string Sender { get; set; } = string.Empty;

    [Required]
    public string Content { get; set; } = string.Empty;

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [MaxLength(100)]
    public string? FChatMessageId { get; set; }

    // Navigation property
    public virtual BouncerUser User { get; set; } = null!;
}

public enum MessageType
{
    Chat,
    Action,
    System,
    Private,
    Announcement,
    Roll
}