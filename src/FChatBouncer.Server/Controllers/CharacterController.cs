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
                FirstSeen = character.FirstSeen,
                LastUpdated = character.LastUpdated
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
                    FirstSeen = c.FirstSeen,
                    LastUpdated = c.LastUpdated
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
                    FirstSeen = c.FirstSeen,
                    LastUpdated = c.LastUpdated
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
                    FirstSeen = c.FirstSeen,
                    LastUpdated = c.LastUpdated
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
            var profile = await _characterService.GetCharacterProfileAsync(characterName);
            if (profile == null)
            {
                return NotFound(new { message = $"No profile data found for character '{characterName}'" });
            }

            return Ok(new CharacterProfileResponse
            {
                CharacterName = characterName,
                ProfileData = profile,
                Timestamp = profile.Timestamp
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
                FirstSeen = activeCharacter.FirstSeen,
                LastUpdated = activeCharacter.LastUpdated
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

    #region Diagnostic Endpoints

    /// <summary>
    /// Get comprehensive character diagnostic information
    /// </summary>
    [HttpGet("diagnostic/{characterName}")]
    public async Task<ActionResult<CharacterDiagnosticResponse>> GetCharacterDiagnostic(string characterName)
    {
        try
        {
            var character = await _characterService.GetCharacterAsync(characterName);
            if (character == null)
            {
                return NotFound(new { message = $"Character '{characterName}' not found" });
            }

            var profile = character.GetStructuredProfile();
            var connections = await _characterService.GetCharacterConnectionsAsync(characterName);
            var channels = await _characterService.GetCharacterChannelsAsync(characterName);

            return Ok(new CharacterDiagnosticResponse
            {
                Character = new DetailedCharacterDto
                {
                    Id = character.Id,
                    Name = character.Name,
                    Status = character.Status,
                    StatusMessage = character.StatusMessage,
                    Gender = character.Gender,
                    IsOnline = character.IsOnline,
                    LastSeen = character.LastSeen,
                    FirstSeen = character.FirstSeen,
                    LastUpdated = character.LastUpdated,
                    ProfileData = character.ProfileData,
                    StructuredProfileData = character.StructuredProfileData,
                    RawProData = character.RawProData
                },
                Profile = profile,
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
                Channels = channels.ToArray(),
                HasProfileData = !string.IsNullOrEmpty(character.ProfileData),
                HasStructuredProfile = profile != null,
                ProfileAge = character.LastUpdated,
                ConnectionCount = connections.Count,
                ChannelCount = channels.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get diagnostic information for character {CharacterName}", characterName);
            return StatusCode(500, new { message = "Failed to get character diagnostic information" });
        }
    }

    /// <summary>
    /// Search characters with diagnostic information
    /// </summary>
    [HttpGet("diagnostic/search")]
    public async Task<ActionResult<CharacterDiagnosticSearchResponse>> SearchCharactersDiagnostic([FromQuery] string q, [FromQuery] int limit = 50)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(q))
            {
                return BadRequest(new { message = "Search query is required" });
            }

            var characters = await _characterService.SearchCharactersAsync(q, limit);
            var diagnosticResults = new List<CharacterDiagnosticSummary>();

            foreach (var character in characters)
            {
                var profile = character.GetStructuredProfile();
                var connections = await _characterService.GetCharacterConnectionsAsync(character.Name);
                var channels = await _characterService.GetCharacterChannelsAsync(character.Name);

                diagnosticResults.Add(new CharacterDiagnosticSummary
                {
                    Id = character.Id,
                    Name = character.Name,
                    Status = character.Status,
                    StatusMessage = character.StatusMessage,
                    Gender = character.Gender,
                    IsOnline = character.IsOnline,
                    LastSeen = character.LastSeen,
                    FirstSeen = character.FirstSeen,
                    LastUpdated = character.LastUpdated,
                    HasProfileData = !string.IsNullOrEmpty(character.ProfileData),
                    HasStructuredProfile = profile != null,
                    ProfileFieldCount = profile != null ? profile.Info.Count + profile.Kinks.Count : 0,
                    ConnectionCount = connections.Count,
                    ChannelCount = channels.Count,
                    ProfileAge = character.LastUpdated
                });
            }

            return Ok(new CharacterDiagnosticSearchResponse
            {
                Query = q,
                Characters = diagnosticResults.ToArray(),
                TotalCount = diagnosticResults.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to search characters with diagnostic information for query {Query}", q);
            return StatusCode(500, new { message = "Failed to search characters" });
        }
    }

    /// <summary>
    /// Get character database statistics
    /// </summary>
    [HttpGet("diagnostic/stats")]
    public async Task<ActionResult<CharacterStatsResponse>> GetCharacterStats()
    {
        try
        {
            var totalCharacters = await _characterService.GetTotalCharacterCountAsync();
            var onlineCharacters = await _characterService.GetOnlineCharactersAsync();
            var charactersWithProfiles = await _characterService.GetCharactersWithProfilesAsync();
            var recentCharacters = await _characterService.GetRecentlyUpdatedCharactersAsync(24); // Last 24 hours

            return Ok(new CharacterStatsResponse
            {
                TotalCharacters = totalCharacters,
                OnlineCharacters = onlineCharacters.Count,
                CharactersWithProfiles = charactersWithProfiles.Count,
                RecentlyUpdated = recentCharacters.Count,
                ProfileCoverage = totalCharacters > 0 ? (double)charactersWithProfiles.Count / totalCharacters * 100 : 0,
                OnlinePercentage = totalCharacters > 0 ? (double)onlineCharacters.Count / totalCharacters * 100 : 0
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get character statistics");
            return StatusCode(500, new { message = "Failed to get character statistics" });
        }
    }

    /// <summary>
    /// Manually request a profile update from F-Chat
    /// </summary>
    [HttpPost("diagnostic/request-profile")]
    public Task<ActionResult> RequestProfileManually([FromBody] RequestProfileRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.CharacterName))
            {
                return Task.FromResult<ActionResult>(BadRequest(new { message = "Character name is required" }));
            }

            // This would need to be implemented in the FChatService
            // For now, we'll return a placeholder response
            _logger.LogInformation("Manual profile request for character {CharacterName}", request.CharacterName);
            
            return Task.FromResult<ActionResult>(Ok(new { 
                message = $"Profile request submitted for character '{request.CharacterName}'",
                characterName = request.CharacterName,
                timestamp = DateTime.UtcNow
            }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to request profile for character {CharacterName}", request.CharacterName);
            return Task.FromResult<ActionResult>(StatusCode(500, new { message = "Failed to request profile" }));
        }
    }

    #endregion
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
    public DateTime LastUpdated { get; set; }
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

// Diagnostic DTOs
public class DetailedCharacterDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? StatusMessage { get; set; }
    public string Gender { get; set; } = string.Empty;
    public bool IsOnline { get; set; }
    public DateTime LastSeen { get; set; }
    public DateTime FirstSeen { get; set; }
    public DateTime LastUpdated { get; set; }
    public string? ProfileData { get; set; }
    public string? StructuredProfileData { get; set; }
    public string? RawProData { get; set; }
}

public class CharacterDiagnosticResponse
{
    public DetailedCharacterDto Character { get; set; } = new();
    public ProfileData? Profile { get; set; }
    public CharacterConnectionDto[] Connections { get; set; } = [];
    public string[] Channels { get; set; } = [];
    public bool HasProfileData { get; set; }
    public bool HasStructuredProfile { get; set; }
    public DateTime ProfileAge { get; set; }
    public int ConnectionCount { get; set; }
    public int ChannelCount { get; set; }
}

public class CharacterDiagnosticSummary
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? StatusMessage { get; set; }
    public string Gender { get; set; } = string.Empty;
    public bool IsOnline { get; set; }
    public DateTime LastSeen { get; set; }
    public DateTime FirstSeen { get; set; }
    public DateTime LastUpdated { get; set; }
    public bool HasProfileData { get; set; }
    public bool HasStructuredProfile { get; set; }
    public int ProfileFieldCount { get; set; }
    public int ConnectionCount { get; set; }
    public int ChannelCount { get; set; }
    public DateTime ProfileAge { get; set; }
}

public class CharacterDiagnosticSearchResponse
{
    public string Query { get; set; } = string.Empty;
    public CharacterDiagnosticSummary[] Characters { get; set; } = [];
    public int TotalCount { get; set; }
}

public class CharacterStatsResponse
{
    public int TotalCharacters { get; set; }
    public int OnlineCharacters { get; set; }
    public int CharactersWithProfiles { get; set; }
    public int RecentlyUpdated { get; set; }
    public double ProfileCoverage { get; set; }
    public double OnlinePercentage { get; set; }
}

public class RequestProfileRequest
{
    public string CharacterName { get; set; } = string.Empty;
}
