using FChatBouncer.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FChatBouncer.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProfileQueueController : ControllerBase
{
    private readonly IProfileQueueService _profileQueueService;
    private readonly ILogger<ProfileQueueController> _logger;

    public ProfileQueueController(
        IProfileQueueService profileQueueService,
        ILogger<ProfileQueueController> logger)
    {
        _profileQueueService = profileQueueService;
        _logger = logger;
    }

    /// <summary>
    /// Get queue statistics
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<ProfileQueueStats>> GetQueueStats()
    {
        try
        {
            var stats = await _profileQueueService.GetQueueStatsAsync();
            return Ok(stats);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get queue statistics");
            return StatusCode(500, new { message = "Failed to get queue statistics" });
        }
    }

    /// <summary>
    /// Check if a profile request is in the queue
    /// </summary>
    [HttpGet("check/{characterName}")]
    public async Task<ActionResult<bool>> IsProfileRequestInQueue(string characterName)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var isInQueue = await _profileQueueService.IsProfileRequestInQueueAsync(userId, characterName);
            return Ok(isInQueue);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check if profile request is in queue for character {CharacterName}", characterName);
            return StatusCode(500, new { message = "Failed to check queue status" });
        }
    }

    /// <summary>
    /// Cancel a profile request in the queue
    /// </summary>
    [HttpDelete("cancel/{characterName}")]
    public async Task<ActionResult> CancelProfileRequest(string characterName)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var cancelled = await _profileQueueService.CancelProfileRequestAsync(userId, characterName);
            
            if (cancelled)
            {
                return Ok(new { message = $"Profile request for {characterName} has been cancelled" });
            }
            else
            {
                return NotFound(new { message = $"No pending profile request found for {characterName}" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cancel profile request for character {CharacterName}", characterName);
            return StatusCode(500, new { message = "Failed to cancel profile request" });
        }
    }

    /// <summary>
    /// Clean up old queue items
    /// </summary>
    [HttpPost("cleanup")]
    public async Task<ActionResult> CleanupQueue()
    {
        try
        {
            await _profileQueueService.CleanupQueueAsync();
            return Ok(new { message = "Queue cleanup completed" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cleanup queue");
            return StatusCode(500, new { message = "Failed to cleanup queue" });
        }
    }
}

