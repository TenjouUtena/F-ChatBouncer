using FChatBouncer.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FChatBouncer.Server.Controllers;

[ApiController]
[Route("api/user")]
[Authorize]
public class UserController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly IFChatService _fChatService;
    private readonly ILogger<UserController> _logger;

    public UserController(
        IUserService userService,
        IFChatService fChatService,
        ILogger<UserController> logger)
    {
        _userService = userService;
        _fChatService = fChatService;
        _logger = logger;
    }

    [HttpGet("status")]
    public async Task<ActionResult<UserStatusResponse>> GetStatus()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var user = await _userService.GetUserByIdAsync(userId);
            if (user == null)
            {
                return NotFound();
            }

            var isConnected = await _fChatService.IsUserConnectedAsync(userId);

            return Ok(new UserStatusResponse
            {
                UserId = userId,
                Username = user.UserName!,
                IsConnected = isConnected,
                LastActivity = DateTime.UtcNow // TODO: Track actual last activity
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get user status for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get user status" });
        }
    }

    [HttpPut("settings")]
    public async Task<ActionResult> UpdateSettings([FromBody] UpdateSettingsRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var settings = await _userService.GetUserSettingsAsync(userId);
            if (settings == null)
            {
                settings = new Models.UserSettings { UserId = userId };
            }

            if (request.RetentionDays.HasValue)
            {
                settings.RetentionDays = request.RetentionDays.Value;
            }

            if (request.AutoPurgeEnabled.HasValue)
            {
                settings.AutoPurgeEnabled = request.AutoPurgeEnabled.Value;
            }

            await _userService.UpdateUserSettingsAsync(userId, settings);

            return Ok(new { message = "Settings updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update settings for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to update settings" });
        }
    }
}

// DTOs
public class UserStatusResponse
{
    public string UserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public bool IsConnected { get; set; }
    public DateTime LastActivity { get; set; }
}

public class UpdateSettingsRequest
{
    public int? RetentionDays { get; set; }
    public bool? AutoPurgeEnabled { get; set; }
}