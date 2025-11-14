using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for managing audit logs
/// </summary>
public class AuditLogService : IAuditLogService
{
    private readonly BouncerDbContext _context;
    private readonly ILogger<AuditLogService> _logger;
    
    public AuditLogService(BouncerDbContext context, ILogger<AuditLogService> logger)
    {
        _context = context;
        _logger = logger;
    }
    
    public async Task LogAsync(
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
        string? correlationId = null)
    {
        try
        {
            var auditLog = new AuditLog
            {
                UserId = userId,
                EventType = eventType,
                EventCategory = eventCategory,
                Action = action,
                Success = success,
                ResourceType = resourceType,
                ResourceId = resourceId,
                FailureReason = failureReason,
                Metadata = metadata,
                IpAddress = ipAddress ?? "unknown",
                UserAgent = userAgent,
                CorrelationId = correlationId,
                Timestamp = DateTime.UtcNow
            };
            
            _context.AuditLogs.Add(auditLog);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Don't throw - audit logging should not break the application
            _logger.LogError(ex, "Failed to write audit log for event {EventType}", eventType);
        }
    }
    
    public async Task<(List<AuditLog> Logs, int TotalCount)> GetLogsAsync(
        int page = 1,
        int pageSize = 50,
        string? userId = null,
        string? eventType = null,
        string? eventCategory = null,
        DateTime? fromDate = null,
        DateTime? toDate = null)
    {
        try
        {
            var query = _context.AuditLogs.AsQueryable();
            
            if (!string.IsNullOrEmpty(userId))
            {
                query = query.Where(al => al.UserId == userId);
            }
            
            if (!string.IsNullOrEmpty(eventType))
            {
                query = query.Where(al => al.EventType == eventType);
            }
            
            if (!string.IsNullOrEmpty(eventCategory))
            {
                query = query.Where(al => al.EventCategory == eventCategory);
            }
            
            if (fromDate.HasValue)
            {
                query = query.Where(al => al.Timestamp >= fromDate.Value);
            }
            
            if (toDate.HasValue)
            {
                query = query.Where(al => al.Timestamp <= toDate.Value);
            }
            
            var totalCount = await query.CountAsync();
            
            var logs = await query
                .OrderByDescending(al => al.Timestamp)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();
            
            return (logs, totalCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve audit logs");
            return (new List<AuditLog>(), 0);
        }
    }
    
    public async Task<List<AuditLog>> GetUserLogsAsync(string userId, int limit = 100)
    {
        try
        {
            return await _context.AuditLogs
                .Where(al => al.UserId == userId)
                .OrderByDescending(al => al.Timestamp)
                .Take(limit)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve audit logs for user {UserId}", userId);
            return new List<AuditLog>();
        }
    }
    
    public async Task<List<AuditLog>> GetEventTypeLogsAsync(string eventType, int limit = 100)
    {
        try
        {
            return await _context.AuditLogs
                .Where(al => al.EventType == eventType)
                .OrderByDescending(al => al.Timestamp)
                .Take(limit)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve audit logs for event type {EventType}", eventType);
            return new List<AuditLog>();
        }
    }
    
    public async Task<int> DeleteOldLogsAsync(int retentionDays)
    {
        try
        {
            var cutoffDate = DateTime.UtcNow.AddDays(-retentionDays);
            
            var oldLogs = await _context.AuditLogs
                .Where(al => al.Timestamp < cutoffDate)
                .ToListAsync();
            
            if (oldLogs.Any())
            {
                _context.AuditLogs.RemoveRange(oldLogs);
                await _context.SaveChangesAsync();
                
                _logger.LogInformation("Deleted {Count} audit logs older than {RetentionDays} days",
                    oldLogs.Count, retentionDays);
                
                return oldLogs.Count;
            }
            
            return 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete old audit logs");
            return 0;
        }
    }
}

