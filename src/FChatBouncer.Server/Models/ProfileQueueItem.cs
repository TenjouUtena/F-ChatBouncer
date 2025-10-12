using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Represents a profile request item in the queue
/// </summary>
public class ProfileQueueItem
{
    public int Id { get; set; }
    
    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(100)]
    public string CharacterName { get; set; } = string.Empty;
    
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime? ProcessedAt { get; set; }
    
    public ProfileRequestType RequestType { get; set; } = ProfileRequestType.StaleRefresh;
    
    public ProfileRequestPriority Priority { get; set; } = ProfileRequestPriority.Normal;
    
    public int RetryCount { get; set; } = 0;
    
    public int MaxRetries { get; set; } = 3;
    
    public string? ErrorMessage { get; set; }
    
    public ProfileQueueStatus Status { get; set; } = ProfileQueueStatus.Pending;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Types of profile requests
/// </summary>
public enum ProfileRequestType
{
    StaleRefresh,
    ManualRequest,
    BackgroundRefresh,
    InitialLoad
}

/// <summary>
/// Priority levels for profile requests
/// </summary>
public enum ProfileRequestPriority
{
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3
}

/// <summary>
/// Status of profile queue items
/// </summary>
public enum ProfileQueueStatus
{
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled
}

