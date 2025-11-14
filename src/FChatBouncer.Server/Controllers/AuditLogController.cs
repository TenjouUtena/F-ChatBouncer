using FChatBouncer.Server.Models;
using FChatBouncer.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FChatBouncer.Server.Controllers;

[ApiController]
[Route("api/audit")]
[Authorize]
public class AuditLogController : ControllerBase
{
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<AuditLogController> _logger;
    
    public AuditLogController(IAuditLogService auditLogService, ILogger<AuditLogController> logger)
    {
        _auditLogService = auditLogService;
        _logger = logger;
    }
    
    /// <summary>
    /// Get audit logs with filtering and pagination
    /// </summary>
    [HttpGet("logs")]
    public async Task<ActionResult> GetLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? eventType = null,
        [FromQuery] string? eventCategory = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }
            
            // For now, only allow users to see their own logs
            // TODO: Add admin role check to allow viewing all logs
            var (logs, totalCount) = await _auditLogService.GetLogsAsync(
                page,
                pageSize,
                userId,
                eventType,
                eventCategory,
                fromDate,
                toDate);
            
            return Ok(new
            {
                logs = logs.Select(al => new
                {
                    al.Id,
                    al.EventType,
                    al.EventCategory,
                    al.Action,
                    al.Success,
                    al.ResourceType,
                    al.ResourceId,
                    al.IpAddress,
                    al.UserAgent,
                    al.FailureReason,
                    al.CorrelationId,
                    al.Timestamp
                }),
                page,
                pageSize,
                totalCount,
                totalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve audit logs");
            return StatusCode(500, new { message = "Failed to retrieve audit logs" });
        }
    }
    
    /// <summary>
    /// Get audit logs for the current user
    /// </summary>
    [HttpGet("logs/me")]
    public async Task<ActionResult> GetMyLogs([FromQuery] int limit = 100)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }
            
            var logs = await _auditLogService.GetUserLogsAsync(userId, limit);
            
            return Ok(logs.Select(al => new
            {
                al.Id,
                al.EventType,
                al.EventCategory,
                al.Action,
                al.Success,
                al.ResourceType,
                al.ResourceId,
                al.IpAddress,
                al.FailureReason,
                al.CorrelationId,
                al.Timestamp
            }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve user audit logs");
            return StatusCode(500, new { message = "Failed to retrieve audit logs" });
        }
    }
    
    /// <summary>
    /// Get audit logs by event type
    /// </summary>
    [HttpGet("events/{eventType}")]
    public async Task<ActionResult> GetEventTypeLogs(string eventType, [FromQuery] int limit = 100)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }
            
            // Get all logs of this event type, but filter to current user
            var allLogs = await _auditLogService.GetEventTypeLogsAsync(eventType, limit);
            var userLogs = allLogs.Where(al => al.UserId == userId).ToList();
            
            return Ok(userLogs.Select(al => new
            {
                al.Id,
                al.EventType,
                al.EventCategory,
                al.Action,
                al.Success,
                al.ResourceType,
                al.ResourceId,
                al.IpAddress,
                al.FailureReason,
                al.CorrelationId,
                al.Timestamp
            }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve event type audit logs");
            return StatusCode(500, new { message = "Failed to retrieve audit logs" });
        }
    }
}

