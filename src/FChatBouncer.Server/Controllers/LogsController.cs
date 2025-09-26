using FChatBouncer.Server.Services;
using FChatBouncer.Server.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FChatBouncer.Server.Controllers;

[ApiController]
[Route("api/logs")]
[Authorize]
public class LogsController : ControllerBase
{
    private readonly IMessageService _messageService;
    private readonly ILogger<LogsController> _logger;

    public LogsController(
        IMessageService messageService,
        ILogger<LogsController> logger)
    {
        _messageService = messageService;
        _logger = logger;
    }

    /// <summary>
    /// Get all characters that have logs for the current user
    /// </summary>
    [HttpGet("characters")]
    public async Task<ActionResult<CharacterLogsResponse>> GetCharactersWithLogs()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var characters = await _messageService.GetCharactersWithLogsAsync(userId);

            return Ok(new CharacterLogsResponse
            {
                Characters = characters.Select(c => new CharacterLogSummary
                {
                    CharacterName = c.CharacterName,
                    MessageCount = c.MessageCount,
                    LastMessageTime = c.LastMessageTime,
                    Channels = c.Channels
                }).ToArray()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get characters with logs for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get characters with logs" });
        }
    }

    /// <summary>
    /// Get all channels that have logs for the current user
    /// </summary>
    [HttpGet("channels")]
    public async Task<ActionResult<ChannelLogsResponse>> GetChannelsWithLogs()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var channels = await _messageService.GetChannelsWithLogsAsync(userId);

            return Ok(new ChannelLogsResponse
            {
                Channels = channels.Select(c => new ChannelLogSummary
                {
                    ChannelName = c.ChannelName,
                    MessageCount = c.MessageCount,
                    LastMessageTime = c.LastMessageTime,
                    Characters = c.Characters
                }).ToArray()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get channels with logs for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get channels with logs" });
        }
    }

    /// <summary>
    /// Get all logs for a specific character
    /// </summary>
    [HttpGet("character/{characterName}")]
    public async Task<ActionResult<CharacterLogsDetailResponse>> GetCharacterLogs(
        string characterName,
        [FromQuery] DateTime? since = null,
        [FromQuery] DateTime? until = null,
        [FromQuery] int limit = 1000)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var logs = await _messageService.GetCharacterLogsAsync(userId, characterName, since, until, limit);

            return Ok(new CharacterLogsDetailResponse
            {
                CharacterName = characterName,
                Messages = logs.Select(m => new MessageLogDto
                {
                    Id = m.Id,
                    ChannelName = m.ChannelName,
                    Sender = m.Sender,
                    Content = m.Content,
                    MessageType = m.MessageType.ToString(),
                    Timestamp = m.Timestamp
                }).ToArray(),
                TotalCount = logs.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get logs for character {CharacterName} (User: {UserId})", characterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get character logs" });
        }
    }

    /// <summary>
    /// Get all logs for a specific channel
    /// </summary>
    [HttpGet("channel/{channelName}")]
    public async Task<ActionResult<ChannelLogsDetailResponse>> GetChannelLogs(
        string channelName,
        [FromQuery] DateTime? since = null,
        [FromQuery] DateTime? until = null,
        [FromQuery] int limit = 1000)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var logs = await _messageService.GetChannelLogsAsync(userId, channelName, since, until, limit);

            return Ok(new ChannelLogsDetailResponse
            {
                ChannelName = channelName,
                Messages = logs.Select(m => new MessageLogDto
                {
                    Id = m.Id,
                    ChannelName = m.ChannelName,
                    Sender = m.Sender,
                    Content = m.Content,
                    MessageType = m.MessageType.ToString(),
                    Timestamp = m.Timestamp
                }).ToArray(),
                TotalCount = logs.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get logs for channel {ChannelName} (User: {UserId})", channelName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get channel logs" });
        }
    }

    /// <summary>
    /// Get logs for a specific character in a specific channel
    /// </summary>
    [HttpGet("character/{characterName}/channel/{channelName}")]
    public async Task<ActionResult<CharacterChannelLogsResponse>> GetCharacterChannelLogs(
        string characterName,
        string channelName,
        [FromQuery] DateTime? since = null,
        [FromQuery] DateTime? until = null,
        [FromQuery] int limit = 1000)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var logs = await _messageService.GetCharacterChannelLogsAsync(userId, characterName, channelName, since, until, limit);

            return Ok(new CharacterChannelLogsResponse
            {
                CharacterName = characterName,
                ChannelName = channelName,
                Messages = logs.Select(m => new MessageLogDto
                {
                    Id = m.Id,
                    ChannelName = m.ChannelName,
                    Sender = m.Sender,
                    Content = m.Content,
                    MessageType = m.MessageType.ToString(),
                    Timestamp = m.Timestamp
                }).ToArray(),
                TotalCount = logs.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get logs for character {CharacterName} in channel {ChannelName} (User: {UserId})", characterName, channelName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get character channel logs" });
        }
    }

    /// <summary>
    /// Search logs with filters
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<LogsSearchResponse>> SearchLogs(
        [FromQuery] string? characterName = null,
        [FromQuery] string? channelName = null,
        [FromQuery] string? content = null,
        [FromQuery] string? messageType = null,
        [FromQuery] DateTime? since = null,
        [FromQuery] DateTime? until = null,
        [FromQuery] int limit = 1000)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var logs = await _messageService.SearchLogsAsync(userId, characterName, channelName, content, messageType, since, until, limit);

            return Ok(new LogsSearchResponse
            {
                Messages = logs.Select(m => new MessageLogDto
                {
                    Id = m.Id,
                    ChannelName = m.ChannelName,
                    Sender = m.Sender,
                    Content = m.Content,
                    MessageType = m.MessageType.ToString(),
                    Timestamp = m.Timestamp
                }).ToArray(),
                TotalCount = logs.Count,
                Filters = new LogsSearchFilters
                {
                    CharacterName = characterName,
                    ChannelName = channelName,
                    Content = content,
                    MessageType = messageType,
                    Since = since,
                    Until = until,
                    Limit = limit
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to search logs for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to search logs" });
        }
    }
}

// Response DTOs
public class CharacterLogsResponse
{
    public CharacterLogSummary[] Characters { get; set; } = Array.Empty<CharacterLogSummary>();
}

public class ChannelLogsResponse
{
    public ChannelLogSummary[] Channels { get; set; } = Array.Empty<ChannelLogSummary>();
}

public class CharacterLogsDetailResponse
{
    public string CharacterName { get; set; } = string.Empty;
    public MessageLogDto[] Messages { get; set; } = Array.Empty<MessageLogDto>();
    public int TotalCount { get; set; }
}

public class ChannelLogsDetailResponse
{
    public string ChannelName { get; set; } = string.Empty;
    public MessageLogDto[] Messages { get; set; } = Array.Empty<MessageLogDto>();
    public int TotalCount { get; set; }
}

public class CharacterChannelLogsResponse
{
    public string CharacterName { get; set; } = string.Empty;
    public string ChannelName { get; set; } = string.Empty;
    public MessageLogDto[] Messages { get; set; } = Array.Empty<MessageLogDto>();
    public int TotalCount { get; set; }
}

public class LogsSearchResponse
{
    public MessageLogDto[] Messages { get; set; } = Array.Empty<MessageLogDto>();
    public int TotalCount { get; set; }
    public LogsSearchFilters Filters { get; set; } = new();
}

public class CharacterLogSummary
{
    public string CharacterName { get; set; } = string.Empty;
    public int MessageCount { get; set; }
    public DateTime LastMessageTime { get; set; }
    public string[] Channels { get; set; } = Array.Empty<string>();
}

public class ChannelLogSummary
{
    public string ChannelName { get; set; } = string.Empty;
    public string ChannelTitle { get; set; } = string.Empty;
    public int MessageCount { get; set; }
    public DateTime LastMessageTime { get; set; }
    public string[] Characters { get; set; } = Array.Empty<string>();
}

public class MessageLogDto
{
    public int Id { get; set; }
    public string ChannelName { get; set; } = string.Empty;
    public string Sender { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string MessageType { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

public class LogsSearchFilters
{
    public string? CharacterName { get; set; }
    public string? ChannelName { get; set; }
    public string? Content { get; set; }
    public string? MessageType { get; set; }
    public DateTime? Since { get; set; }
    public DateTime? Until { get; set; }
    public int Limit { get; set; }
}
