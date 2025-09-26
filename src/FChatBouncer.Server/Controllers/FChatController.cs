using FChatBouncer.Server.Services;
using FChatBouncer.Server.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FChatBouncer.Server.Controllers;

[ApiController]
[Route("api/fchat")]
[Authorize]
public class FChatController : ControllerBase
{
    private readonly IFChatService _fChatService;
    private readonly IProfileService _profileService;
    private readonly IMemoService _memoService;
    private readonly ILogger<FChatController> _logger;

    public FChatController(
        IFChatService fChatService,
        IProfileService profileService,
        IMemoService memoService,
        ILogger<FChatController> logger)
    {
        _fChatService = fChatService;
        _profileService = profileService;
        _memoService = memoService;
        _logger = logger;
    }

    [HttpGet("characters")]
    public async Task<ActionResult<CharacterListResponse>> GetCharacters()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var characters = await _fChatService.GetCharactersAsync(userId);

            return Ok(new CharacterListResponse
            {
                Characters = characters.Select(c => new CharacterDto
                {
                    Name = c.Name,
                    Status = c.Status,
                    StatusMessage = c.StatusMessage,
                    Gender = c.Gender
                }).ToArray()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get characters for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get characters" });
        }
    }

    [HttpPost("character/select")]
    public async Task<ActionResult> SelectCharacter([FromBody] SelectCharacterRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                _logger.LogWarning("Character select request failed: User not authenticated");
                return Unauthorized();
            }

            _logger.LogInformation("=== CHARACTER SWITCH REQUEST START ===");
            _logger.LogInformation("User {UserId} requesting to switch to character: {CharacterName}", userId, request.CharacterName);

            // Get current active character before switching
            var currentActiveCharacter = await _fChatService.GetActiveCharacterAsync(userId);
            _logger.LogInformation("Current active character before switch: {CurrentCharacter}", currentActiveCharacter ?? "None");

            // Get available characters
            var availableCharacters = await _fChatService.GetCharactersAsync(userId);
            _logger.LogInformation("Available characters for user {UserId}: {Characters}", 
                userId, string.Join(", ", availableCharacters.Select(c => c.Name)));

            var switchStartTime = DateTime.UtcNow;
            _logger.LogInformation("Starting character switch at: {StartTime}", switchStartTime);

            await _fChatService.SelectCharacterAsync(userId, request.CharacterName);

            var switchEndTime = DateTime.UtcNow;
            var switchDuration = switchEndTime - switchStartTime;
            _logger.LogInformation("Character switch completed at: {EndTime}, Duration: {Duration}ms", 
                switchEndTime, switchDuration.TotalMilliseconds);

            // Verify the switch was successful
            var newActiveCharacter = await _fChatService.GetActiveCharacterAsync(userId);
            _logger.LogInformation("New active character after switch: {NewCharacter}", newActiveCharacter ?? "None");

            if (newActiveCharacter == request.CharacterName)
            {
                _logger.LogInformation("Character switch successful: {CharacterName} is now active", request.CharacterName);
            }
            else
            {
                _logger.LogWarning("Character switch may have failed: Expected {ExpectedCharacter}, but active character is {ActualCharacter}", 
                    request.CharacterName, newActiveCharacter ?? "None");
            }

            _logger.LogInformation("=== CHARACTER SWITCH REQUEST END ===");

            return Ok(new { message = "Character selected successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to select character {CharacterName} for user {UserId}",
                request.CharacterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to select character" });
        }
    }

    [HttpGet("status")]
    public async Task<ActionResult<FChatStatusResponse>> GetFChatStatus()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var isConnected = await _fChatService.IsUserConnectedAsync(userId);
            var selectedCharacter = await _fChatService.GetSelectedCharacterAsync(userId);

            return Ok(new FChatStatusResponse
            {
                IsConnected = isConnected,
                SelectedCharacter = selectedCharacter?.Name,
                Status = isConnected ? "Connected" : "Disconnected"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get F-Chat status for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get F-Chat status" });
        }
    }

    [HttpGet("profile/{characterName}")]
    public async Task<ActionResult<ProfileResponse>> GetProfile(string characterName, [FromQuery] bool allowStale = true)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            _logger.LogDebug("Profile request for character {CharacterName} (User: {UserId}, AllowStale: {AllowStale})",
                characterName, userId, allowStale);

            // Try to get cached profile first
            var cachedProfile = await _profileService.GetCachedProfileAsync(userId, characterName, allowStale);
            if (cachedProfile != null)
            {
                return Ok(new ProfileResponse
                {
                    CharacterName = characterName,
                    ProfileData = cachedProfile,
                    IsCached = true,
                    Age = DateTime.UtcNow - cachedProfile.Timestamp
                });
            }

            // If no cached profile, trigger a fresh request
            await _profileService.RequestProfileAsync(userId, characterName);

            return Ok(new ProfileResponse
            {
                CharacterName = characterName,
                ProfileData = null,
                IsCached = false,
                Message = "Profile request sent. Check back in a moment."
            });
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("Rate limited"))
        {
            _logger.LogWarning("Profile request rate limited for character {CharacterName} (User: {UserId}): {Message}",
                characterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value, ex.Message);
            return StatusCode(429, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get profile for character {CharacterName} (User: {UserId})",
                characterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get profile" });
        }
    }

    [HttpPost("profile/request")]
    public async Task<ActionResult> RequestProfile([FromBody] ProfileRequestDto request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            await _profileService.RequestProfileAsync(userId, request.CharacterName);

            return Ok(new { message = "Profile request sent successfully" });
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("Rate limited"))
        {
            _logger.LogWarning("Profile request rate limited for character {CharacterName} (User: {UserId}): {Message}",
                request.CharacterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value, ex.Message);
            return StatusCode(429, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to request profile for character {CharacterName} (User: {UserId})",
                request.CharacterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to request profile" });
        }
    }

    [HttpGet("channel/{channelId}/characters")]
    public async Task<ActionResult<ChannelCharacterListResponse>> GetChannelCharacters(string channelId, [FromQuery] string? characterName = null)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            // Use provided character name or get active character
            var activeCharacter = characterName ?? await _fChatService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null)
            {
                return BadRequest(new { message = "No character selected" });
            }

            var characters = await _fChatService.GetChannelCharactersAsync(userId, activeCharacter, channelId);

            return Ok(new ChannelCharacterListResponse
            {
                ChannelId = channelId,
                Characters = characters.Select(c => new ChannelCharacterDto
                {
                    CharacterName = c.CharacterName,
                    JoinedAt = c.JoinedAt,
                    LastSeenAt = c.LastSeenAt,
                    Status = c.Status.ToString()
                }).ToArray()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get characters for channel {ChannelId} (User: {UserId})",
                channelId, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get channel characters" });
        }
    }

    [HttpPost("channel/{channelId}/characters/refresh")]
    public async Task<ActionResult> RefreshChannelCharacters(string channelId, [FromQuery] string? characterName = null)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            // Use provided character name or get active character
            var activeCharacter = characterName ?? await _fChatService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null)
            {
                return BadRequest(new { message = "No character selected" });
            }

            var success = await _fChatService.RequestChannelOperatorListAsync(userId, activeCharacter, channelId);

            if (success)
            {
                return Ok(new { message = "Character list refresh requested successfully" });
            }
            else
            {
                return StatusCode(500, new { message = "Failed to refresh character list" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh characters for channel {ChannelId} (User: {UserId})",
                channelId, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to refresh channel characters" });
        }
    }

    [HttpPost("status/update")]
    public async Task<ActionResult> UpdateStatus([FromBody] UpdateStatusRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            // Get active character
            var activeCharacter = await _fChatService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null)
            {
                return BadRequest(new { message = "No character selected" });
            }

            await _fChatService.SendStatusUpdateAsync(userId, activeCharacter, request.Status, request.StatusMessage);

            return Ok(new { message = "Status updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update status for user {UserId}",
                User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to update status" });
        }
    }

    [HttpGet("friends")]
    public async Task<ActionResult<FriendsResponse>> GetFriends()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            var friendsData = await _fChatService.GetFriendsAndBookmarksAsync(userId);

            return Ok(new FriendsResponse
            {
                Friends = friendsData.Friends.Select(f => new FriendDto
                {
                    Name = f.Name,
                    Status = f.Status,
                    StatusMessage = f.StatusMessage,
                    IsOnline = f.IsOnline,
                    LastSeen = f.LastSeen,
                    Gender = f.Gender
                }).ToArray(),
                Bookmarks = friendsData.Bookmarks.ToArray(),
                BookmarksWithStatus = friendsData.BookmarksWithStatus.Select(f => new FriendDto
                {
                    Name = f.Name,
                    Status = f.Status,
                    StatusMessage = f.StatusMessage,
                    IsOnline = f.IsOnline,
                    LastSeen = f.LastSeen,
                    Gender = f.Gender
                }).ToArray()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get friends for user {UserId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get friends" });
        }
    }

    [HttpPost("search")]
    public async Task<ActionResult> SearchCharacters([FromBody] SearchRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            // Get active character
            var activeCharacter = await _fChatService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null)
            {
                return BadRequest(new { message = "No character selected" });
            }

            // Convert search criteria to dictionary
            var searchCriteria = new Dictionary<string, object>();
            
            if (request.Kinks?.Any() == true)
            {
                searchCriteria["kinks"] = request.Kinks;
            }
            
            if (request.Genders?.Any() == true)
            {
                searchCriteria["genders"] = request.Genders;
            }
            
            if (request.Orientations?.Any() == true)
            {
                searchCriteria["orientations"] = request.Orientations;
            }
            
            if (request.Languages?.Any() == true)
            {
                searchCriteria["languages"] = request.Languages;
            }
            
            if (request.Furryprefs?.Any() == true)
            {
                searchCriteria["furryprefs"] = request.Furryprefs;
            }
            
            if (request.Roles?.Any() == true)
            {
                searchCriteria["roles"] = request.Roles;
            }

            await _fChatService.SearchCharactersAsync(userId, activeCharacter, searchCriteria);

            return Ok(new { message = "Search request sent successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to search characters for user {UserId}",
                User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to search characters" });
        }
    }

    [HttpPost("bookmark/add")]
    public async Task<ActionResult> AddBookmark([FromBody] BookmarkRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            // Get active character
            var activeCharacter = await _fChatService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null)
            {
                return BadRequest(new { message = "No character selected" });
            }

            var success = await _fChatService.AddBookmarkAsync(userId, activeCharacter, request.CharacterName);

            if (success)
            {
                return Ok(new { message = "Bookmark added successfully" });
            }
            else
            {
                return StatusCode(500, new { message = "Failed to add bookmark" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add bookmark for character {CharacterName} (User: {UserId})",
                request.CharacterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to add bookmark" });
        }
    }

    [HttpPost("bookmark/remove")]
    public async Task<ActionResult> RemoveBookmark([FromBody] BookmarkRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            // Get active character
            var activeCharacter = await _fChatService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null)
            {
                return BadRequest(new { message = "No character selected" });
            }

            var success = await _fChatService.RemoveBookmarkAsync(userId, activeCharacter, request.CharacterName);

            if (success)
            {
                return Ok(new { message = "Bookmark removed successfully" });
            }
            else
            {
                return StatusCode(500, new { message = "Failed to remove bookmark" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove bookmark for character {CharacterName} (User: {UserId})",
                request.CharacterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to remove bookmark" });
        }
    }

    [HttpGet("memo/{characterName}")]
    public async Task<ActionResult<MemoResponse>> GetMemo(string characterName)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            _logger.LogDebug("Memo request for character {CharacterName} (User: {UserId})", characterName, userId);

            var memoData = await _memoService.GetMemoAsync(userId, characterName);
            
            return Ok(new MemoResponse
            {
                CharacterName = characterName,
                Memo = memoData?.Note,
                HasMemo = !string.IsNullOrEmpty(memoData?.Note)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get memo for character {CharacterName} (User: {UserId})",
                characterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to get memo" });
        }
    }

    [HttpPost("memo/{characterName}/refresh")]
    public async Task<ActionResult> RefreshMemo(string characterName)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null)
            {
                return Unauthorized();
            }

            _logger.LogInformation("Refreshing memo for character {CharacterName} (User: {UserId})", characterName, userId);

            await _memoService.RefreshMemoAsync(userId, characterName);
            
            return Ok(new { message = "Memo refreshed successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh memo for character {CharacterName} (User: {UserId})",
                characterName, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return StatusCode(500, new { message = "Failed to refresh memo" });
        }
    }

}

// DTOs
public class CharacterDto
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? StatusMessage { get; set; }
    public string Gender { get; set; } = string.Empty;
}

public class CharacterListResponse
{
    public CharacterDto[] Characters { get; set; } = [];
}

public class SelectCharacterRequest
{
    public string CharacterName { get; set; } = string.Empty;
}

public class UpdateStatusRequest
{
    public string Status { get; set; } = string.Empty;
    public string? StatusMessage { get; set; }
}

public class FChatStatusResponse
{
    public bool IsConnected { get; set; }
    public string? SelectedCharacter { get; set; }
    public string Status { get; set; } = string.Empty;
}

public class ProfileResponse
{
    public string CharacterName { get; set; } = string.Empty;
    public ProfileData? ProfileData { get; set; }
    public bool IsCached { get; set; }
    public TimeSpan? Age { get; set; }
    public string? Message { get; set; }
}

public class ProfileRequestDto
{
    public string CharacterName { get; set; } = string.Empty;
}

public class ChannelCharacterDto
{
    public string CharacterName { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public string Status { get; set; } = string.Empty;
}

public class ChannelCharacterListResponse
{
    public string ChannelId { get; set; } = string.Empty;
    public ChannelCharacterDto[] Characters { get; set; } = [];
}

public class FriendDto
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? StatusMessage { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? LastSeen { get; set; }
    public string? Gender { get; set; }
}

public class FriendsResponse
{
    public FriendDto[] Friends { get; set; } = [];
    public string[] Bookmarks { get; set; } = [];
    public FriendDto[] BookmarksWithStatus { get; set; } = [];
}

public class SearchRequest
{
    public string[]? Kinks { get; set; }
    public string[]? Genders { get; set; }
    public string[]? Orientations { get; set; }
    public string[]? Languages { get; set; }
    public string[]? Furryprefs { get; set; }
    public string[]? Roles { get; set; }
}

public class BookmarkRequest
{
    public string CharacterName { get; set; } = string.Empty;
}

public class MemoResponse
{
    public string CharacterName { get; set; } = string.Empty;
    public string? Memo { get; set; }
    public bool HasMemo { get; set; }
}