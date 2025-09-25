using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

public class Profile
{
    [Key]
    public int Id { get; set; }

    [Required]
    public string UserId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string CharacterName { get; set; } = string.Empty;

    [Required]
    public string ProfileData { get; set; } = string.Empty; // JSON payload from F-Chat

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // For debugging - raw PRO command payload
    public string? RawProData { get; set; }

    // Navigation property
    public virtual BouncerUser User { get; set; } = null!;
}