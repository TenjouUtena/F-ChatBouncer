using FChatBouncer.Server.Services;
using FChatBouncer.Server.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FChatBouncer.Server.Controllers;

[ApiController]
[Route("api/character")]
[Authorize]
public class CharacterController : ControllerBase
{
    private readonly ICharacterService _characterService;
    private readonly ILogger<CharacterController> _logger;

    public CharacterController(
        ICharacterService characterService,
        ILogger<CharacterController> logger)
    {
        _characterService = characterService;
        _logger = logger;
    }

    /// <summary>
    /// Get character information by name
    /// </summary>
    [HttpGet("{characterName}")]
    public async Task<ActionResult<UnifiedCharacterDto>> GetCharacter(string characterName)
    {
        try
        {
            var character = await _characterService.GetCharacterAsync(characterName);
            if (character == null)
            {
                return NotFound(new { message = $"Character '{characterName}' not found" });
            }

            return Ok(new UnifiedCharacterDto
            {
                Id = character.Id,
                Name = character.Name,
                Status = character.Status,
                StatusMessage = character.StatusMessage,
                Gender = character.Gender,
                IsOnline = character.IsOnline,
                LastSeen = character.LastSeen,
                FirstSeen = character.FirstSeen
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get character {CharacterName}", characterName);
            return StatusCode(500, new { message = "Failed to get character" });
        }
    }

    /// <summary>
    /// Search for characters by name
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<CharacterSearchResponse>> SearchCharacters([FromQuery] string q, [FromQuery] int limit = 50)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(q))
            {
                return BadRequest(new { message = "Search query is required" });
            }

            var characters = await _characterService.SearchCharactersAsync(q, limit);

            return Ok(new CharacterSearchResponse
            {
                Query = q,
                Characters = characters.Select(c => new UnifiedCharacterDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Status = c.Status,
                    StatusMessage = c.StatusMessage,
                    Gender = c.Gender,
                    IsOnline = c.IsOnline,
                    LastSeen = c.LastSeen,
                    FirstSeen = c.FirstSeen
                }).ToArray(),
                TotalCount = characters.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to search characters with query {Query}", q);
            return StatusCode(500, new { message = "Failed to search characters" });
        }
    }

    /// <summary>
    /// Get all online characters
    /// </summary>
    [HttpGet("online")]
    public async Task<ActionResult<UnifiedCharacterListResponse>> GetOnlineCharacters()
    {
        try
        {
            var characters = await _characterService.GetOnlineCharactersAsync();

            return Ok(new UnifiedCharacterListResponse
            {
                Characters = characters.Select(c => new UnifiedCharacterDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Status = c.Status,
                    StatusMessage = c.StatusMessage,
                    Gender = c.Gender,
                    IsOnline = c.IsOnline,
                    LastSeen = c.LastSeen,
                    FirstSeen = c.FirstSeen
                }).ToArray(),
                TotalCount = characters.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get online characters");
            return StatusCode(500, new { message = "Failed to get online characters" });
        }
    }

    /// <summary>
    /// Get characters by status
    /// </summary>
    [HttpGet("status/{status}")]
    public async Task<ActionResult<UnifiedCharacterListResponse>> GetCharactersByStatus(string status)
    {
        try
        {
            var characters = await _characterService.GetCharactersByStatusAsync(status);

            return Ok(new UnifiedCharacterListResponse
            {
                Characters = characters.Select(c => new UnifiedCharacterDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Status = c.Status,
                    StatusMessage = c.StatusMessage,
                    Gender = c.Gender,
                    IsOnline = c.IsOnline,
                    LastSeen = c.LastSeen,
                    FirstSeen = c.FirstSeen
                }).ToArray(),
                TotalCount = characters.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get characters by status {Status}", status);
            return StatusCode(500, new { message = "Failed to get characters by status" });
        }
    }

    /// <summary>
    /// Get character profile data
    /// </summary>
    [HttpGet("{characterName}/profile")]
    public async Task<ActionResult<CharacterProfileResponse>> GetCharacterProfile(string characterName)
    {
        try
        {
            var character = await _characterService.GetCharacterAsync(characterName);
            var profile = character?.Profile;
            if (profile == null)
            {
                return NotFound(new { message = $"No profile data found for character '{characterName}'" });
            }

            return Ok(new CharacterProfileResponse
            {
                CharacterName = characterName,
                ProfileData = profile,
                Timestamp = character!.ProfileFetchedAt ?? profile.Timestamp
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get profile for character {CharacterName}", characterName);
            return StatusCode(500, new { message = "Failed to get character profile" });
        }
    }

    /// <summary>
    /// Get all character connections for the current user
    /// </summary>
    [HttpGet("connections")]
    public async Task<ActionResult<CharacterConnectionsResponse>> GetCharacterConnections()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var connections = await _characterService.GetUserCharacterConnectionsAsync(userId);

            return Ok(new CharacterConnectionsResponse
            {
                Connections = connections.Select(c => new CharacterConnectionDto
                {
                    Id = c.Id,
                    CharacterName = c.Character.Name,
                    FChatUsername = c.FChatUsername,
                    IsActive = c.IsActive,
                    IsConnected = c.IsConnected,
                    ConnectedAt = c.ConnectedAt,
                    LastActivityAt = c.LastActivityAt,
                    CreatedAt = c.CreatedAt
                }).ToArray(),
                TotalCount = connections.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get character connections for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get character connections" });
        }
    }

    /// <summary>
    /// Get the active character for the current user
    /// </summary>
    [HttpGet("active")]
    public async Task<ActionResult<UnifiedCharacterDto>> GetActiveCharacter()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var activeCharacter = await _characterService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null)
            {
                return NotFound(new { message = "No active character found" });
            }

            return Ok(new UnifiedCharacterDto
            {
                Id = activeCharacter.Id,
                Name = activeCharacter.Name,
                Status = activeCharacter.Status,
                StatusMessage = activeCharacter.StatusMessage,
                Gender = activeCharacter.Gender,
                IsOnline = activeCharacter.IsOnline,
                LastSeen = activeCharacter.LastSeen,
                FirstSeen = activeCharacter.FirstSeen
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get active character for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get active character" });
        }
    }

    /// <summary>
    /// Get all channels a character is in
    /// </summary>
    [HttpGet("{characterName}/channels")]
    public async Task<ActionResult<CharacterChannelsResponse>> GetCharacterChannels(string characterName)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var channels = await _characterService.GetCharacterChannelsAsync(userId, characterName);
            var memberships = await _characterService.GetCharacterChannelMembershipsAsync(userId, characterName);

            return Ok(new CharacterChannelsResponse
            {
                CharacterName = characterName,
                Channels = channels.ToArray(),
                Memberships = memberships.Select(m => new CharacterChannelMembershipDto
                {
                    ChannelId = m.ChannelId,
                    JoinedAt = m.JoinedAt,
                    LastActivityAt = m.LastActivityAt
                }).ToArray(),
                TotalCount = channels.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get channels for character {CharacterName}", characterName);
            return StatusCode(500, new { message = "Failed to get character channels" });
        }
    }
}

// DTOs
public class UnifiedCharacterDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? StatusMessage { get; set; }
    public string Gender { get; set; } = string.Empty;
    public bool IsOnline { get; set; }
    public DateTime LastSeen { get; set; }
    public DateTime FirstSeen { get; set; }
}

public class UnifiedCharacterListResponse
{
    public UnifiedCharacterDto[] Characters { get; set; } = [];
    public int TotalCount { get; set; }
}

public class CharacterSearchResponse
{
    public string Query { get; set; } = string.Empty;
    public UnifiedCharacterDto[] Characters { get; set; } = [];
    public int TotalCount { get; set; }
}

public class CharacterProfileResponse
{
    public string CharacterName { get; set; } = string.Empty;
    public ProfileData? ProfileData { get; set; }
    public DateTime Timestamp { get; set; }
}

public class CharacterConnectionDto
{
    public int Id { get; set; }
    public string CharacterName { get; set; } = string.Empty;
    public string FChatUsername { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public bool IsConnected { get; set; }
    public DateTime ConnectedAt { get; set; }
    public DateTime LastActivityAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CharacterConnectionsResponse
{
    public CharacterConnectionDto[] Connections { get; set; } = [];
    public int TotalCount { get; set; }
}

public class CharacterChannelMembershipDto
{
    public string ChannelId { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; }
    public DateTime LastActivityAt { get; set; }
}

public class CharacterChannelsResponse
{
    public string CharacterName { get; set; } = string.Empty;
    public string[] Channels { get; set; } = [];
    public CharacterChannelMembershipDto[] Memberships { get; set; } = [];
    public int TotalCount { get; set; }
}
