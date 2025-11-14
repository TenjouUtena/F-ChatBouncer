using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for managing audit logs
/// </summary>
public interface IAuditLogService
{
    /// <summary>
    /// Log an audit event
    /// </summary>
    Task LogAsync(
        string eventType,
        string eventCategory,
        string action,
        bool success,
        string? userId = null,
        string? resourceType = null,
        string? resourceId = null,
        string? failureReason = null,
        string? metadata = null,
        string? ipAddress = null,
        string? userAgent = null,
        string? correlationId = null);
    
    /// <summary>
    /// Get audit logs with pagination and filtering
    /// </summary>
    Task<(List<AuditLog> Logs, int TotalCount)> GetLogsAsync(
        int page = 1,
        int pageSize = 50,
        string? userId = null,
        string? eventType = null,
        string? eventCategory = null,
        DateTime? fromDate = null,
        DateTime? toDate = null);
    
    /// <summary>
    /// Get audit logs for a specific user
    /// </summary>
    Task<List<AuditLog>> GetUserLogsAsync(string userId, int limit = 100);
    
    /// <summary>
    /// Get audit logs by event type
    /// </summary>
    Task<List<AuditLog>> GetEventTypeLogsAsync(string eventType, int limit = 100);
    
    /// <summary>
    /// Delete audit logs older than the specified number of days
    /// </summary>
    Task<int> DeleteOldLogsAsync(int retentionDays);
}

