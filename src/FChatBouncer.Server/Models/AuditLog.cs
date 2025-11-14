using System.ComponentModel.DataAnnotations;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Audit log entry for tracking security-relevant events
/// </summary>
public class AuditLog
{
    [Key]
    public long Id { get; set; }
    
    /// <summary>
    /// User ID associated with the event (null for unauthenticated events)
    /// </summary>
    public string? UserId { get; set; }
    
    /// <summary>
    /// Type of event (Login, Logout, CredentialUpdate, etc.)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string EventType { get; set; } = string.Empty;
    
    /// <summary>
    /// Category of event (Authentication, Security, UserManagement, etc.)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string EventCategory { get; set; } = string.Empty;
    
    /// <summary>
    /// Description of the action taken
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string Action { get; set; } = string.Empty;
    
    /// <summary>
    /// Type of resource affected (User, Character, etc.)
    /// </summary>
    [MaxLength(50)]
    public string? ResourceType { get; set; }
    
    /// <summary>
    /// ID of the affected resource
    /// </summary>
    [MaxLength(100)]
    public string? ResourceId { get; set; }
    
    /// <summary>
    /// IP address of the request
    /// </summary>
    [Required]
    [MaxLength(45)] // IPv6 max length
    public string IpAddress { get; set; } = string.Empty;
    
    /// <summary>
    /// User agent string
    /// </summary>
    [MaxLength(500)]
    public string? UserAgent { get; set; }
    
    /// <summary>
    /// Whether the operation was successful
    /// </summary>
    public bool Success { get; set; }
    
    /// <summary>
    /// Reason for failure (if not successful)
    /// </summary>
    [MaxLength(500)]
    public string? FailureReason { get; set; }
    
    /// <summary>
    /// Additional metadata as JSON
    /// </summary>
    public string? Metadata { get; set; }
    
    /// <summary>
    /// Correlation ID for request tracing
    /// </summary>
    [MaxLength(36)]
    public string? CorrelationId { get; set; }
    
    /// <summary>
    /// When the event occurred
    /// </summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual BouncerUser? User { get; set; }
}

/// <summary>
/// Audit event types
/// </summary>
public static class AuditEventType
{
    // Authentication events
    public const string Login = "Login";
    public const string Logout = "Logout";
    public const string TokenRefresh = "TokenRefresh";
    public const string PasswordChange = "PasswordChange";
    public const string AccountLockout = "AccountLockout";
    
    // F-Chat credential events
    public const string CredentialUpdate = "CredentialUpdate";
    public const string CredentialValidationFailure = "CredentialValidationFailure";
    public const string CharacterConnection = "CharacterConnection";
    public const string CharacterDisconnection = "CharacterDisconnection";
    
    // Security events
    public const string FailedAuthentication = "FailedAuthentication";
    public const string TokenBlacklisted = "TokenBlacklisted";
    public const string RateLimitExceeded = "RateLimitExceeded";
    public const string SuspiciousActivity = "SuspiciousActivity";
}

/// <summary>
/// Audit event categories
/// </summary>
public static class AuditEventCategory
{
    public const string Authentication = "Authentication";
    public const string Security = "Security";
    public const string UserManagement = "UserManagement";
    public const string FChatOperations = "FChatOperations";
}

