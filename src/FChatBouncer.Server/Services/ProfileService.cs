using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Collections.Concurrent;
using Npgsql;

namespace FChatBouncer.Server.Services;

public class ProfileService : IProfileService
{
    private readonly BouncerDbContext _context;
    private readonly IFChatService _fChatService;
    private readonly ICharacterService _characterService;
    private readonly IMemoService _memoService;
    private readonly IFListCharacterDataService _characterDataService;
    private readonly IUserService _userService;
    private readonly ILogger<ProfileService> _logger;
    private readonly IProfileRateLimiter _rateLimiter;
    private readonly ConcurrentDictionary<string, Task> _pendingRequests = new();

    public ProfileService(
        BouncerDbContext context,
        IFChatService fChatService,
        ICharacterService characterService,
        IMemoService memoService,
        IFListCharacterDataService characterDataService,
        IUserService userService,
        ILogger<ProfileService> logger,
        IProfileRateLimiter rateLimiter)
    {
        _context = context;
        _fChatService = fChatService;
        _characterService = characterService;
        _memoService = memoService;
        _characterDataService = characterDataService;
        _userService = userService;
        _logger = logger;
        _rateLimiter = rateLimiter;
    }

    public async Task SaveProfileAsync(string userId, string characterName, string profileData, string? rawProData = null)
    {
        try
        {
            // Use CharacterService to update the character profile
            await _characterService.UpdateCharacterProfileAsync(characterName, profileData, rawProData);

            // Also maintain legacy Profile table for backward compatibility
            var existingProfile = await _context.Profiles
                .FirstOrDefaultAsync(p => p.UserId == userId && p.CharacterName == characterName);

            if (existingProfile != null)
            {
                // Update existing profile
                existingProfile.ProfileData = profileData;
                existingProfile.RawProData = rawProData;
                existingProfile.UpdatedAt = DateTime.UtcNow;
                _logger.LogInformation("Updated legacy profile for character {CharacterName} (User: {UserId})", characterName, userId);
            }
            else
            {
                // Create new profile
                var profile = new Profile
                {
                    UserId = userId,
                    CharacterName = characterName,
                    ProfileData = profileData,
                    RawProData = rawProData,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.Profiles.Add(profile);
                _logger.LogInformation("Created new legacy profile for character {CharacterName} (User: {UserId})", characterName, userId);
            }

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
            {
                // Handle unique constraint violation - character was created/updated by another thread
                _logger.LogWarning("Character {CharacterName} profile was updated by another thread, skipping duplicate profile save", characterName);
            }

            // Log the raw PRO data for analysis
            if (!string.IsNullOrEmpty(rawProData))
            {
                _logger.LogInformation("PRO Data received for {CharacterName}: {RawProData}", characterName, rawProData);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save profile for character {CharacterName} (User: {UserId})", characterName, userId);
            throw;
        }
    }

    public async Task<Profile?> GetProfileAsync(string userId, string characterName)
    {
        return await _context.Profiles
            .FirstOrDefaultAsync(p => p.UserId == userId && p.CharacterName == characterName);
    }

    public async Task<List<Profile>> GetUserProfilesAsync(string userId)
    {
        return await _context.Profiles
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.UpdatedAt)
            .ToListAsync();
    }

    public async Task SaveStructuredProfileAsync(string userId, ProfileData profileData)
    {
        try
        {
            // Use CharacterService to update the character profile
            await _characterService.UpdateCharacterProfileAsync(profileData.CharacterName, profileData);

            // Also maintain legacy Profile table for backward compatibility
            var profileJson = JsonSerializer.Serialize(profileData, new JsonSerializerOptions
            {
                WriteIndented = true
            });

            await SaveProfileAsync(userId, profileData.CharacterName, profileJson);

            _logger.LogInformation("Saved structured profile for character {CharacterName} (User: {UserId}): {Summary}",
                profileData.CharacterName, userId, profileData.GetSummary());

            // Refresh memo data when profile is updated
            //_ = Task.Run(async () =>
            //{
            //    try
            //    {
            //        await _memoService.RefreshMemoAsync(userId, profileData.CharacterName);
            //    }
            //    catch (Exception ex)
            //    {
            //        _logger.LogWarning(ex, "Failed to refresh memo for character {CharacterName} (User: {UserId})",
            //            profileData.CharacterName, userId);
            //    }
            //});
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save structured profile for character {CharacterName} (User: {UserId})",
                profileData.CharacterName, userId);
            throw;
        }
    }

    public async Task<ProfileData?> GetStructuredProfileAsync(string userId, string characterName)
    {
        try
        {
            // First try to get from CharacterService (unified character data)
            var characterProfile = await _characterService.GetCharacterProfileAsync(characterName);
            if (characterProfile != null)
            {
                _logger.LogDebug("Retrieved structured profile from CharacterService for character {CharacterName} (User: {UserId}): {Summary}",
                    characterName, userId, characterProfile.GetSummary());
                return characterProfile;
            }

            // Fallback to legacy Profile table
            var profile = await GetProfileAsync(userId, characterName);
            if (profile == null || string.IsNullOrEmpty(profile.ProfileData))
            {
                return null;
            }

            // Try to deserialize the profile data back to ProfileData
            var profileData = JsonSerializer.Deserialize<ProfileData>(profile.ProfileData);
            if (profileData != null)
            {
                _logger.LogDebug("Retrieved structured profile from legacy table for character {CharacterName} (User: {UserId}): {Summary}",
                    characterName, userId, profileData.GetSummary());
            }

            return profileData;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize profile data for character {CharacterName} (User: {UserId}). Data may be in old format.",
                characterName, userId);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get structured profile for character {CharacterName} (User: {UserId})",
                characterName, userId);
            throw;
        }
    }

    public async Task<ProfileData?> GetCachedProfileAsync(string userId, string characterName, bool allowStale = false)
    {
        try
        {
            var profile = await GetProfileAsync(userId, characterName);
            if (profile == null)
            {
                _logger.LogDebug("No cached profile found for character {CharacterName} (User: {UserId})", characterName, userId);
                return null;
            }

            var age = DateTime.UtcNow - profile.UpdatedAt;
            var isStale = age.TotalHours >= 6;

            _logger.LogDebug("Cached profile for character {CharacterName} (User: {UserId}) is {Age:F1} hours old, stale: {IsStale}",
                characterName, userId, age.TotalHours, isStale);

            // If profile is fresh (< 6 hours), return it
            if (!isStale)
            {
                var profileData = await GetStructuredProfileAsync(userId, characterName);
                if (profileData != null)
                {
                    _logger.LogDebug("Returning fresh cached profile for character {CharacterName} (User: {UserId})", characterName, userId);
                    return profileData;
                }
            }

            // If profile is stale (>= 6 hours)
            if (isStale)
            {
                // Trigger a background refresh (fire and forget)
                _ = Task.Run(async () =>
                {
                    try
                    {
                        _logger.LogInformation("Triggering background refresh for stale profile: {CharacterName} (User: {UserId})", characterName, userId);
                        await RequestProfileAsync(userId, characterName);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to refresh stale profile for {CharacterName} (User: {UserId})", characterName, userId);
                    }
                });

                // Return stale data if allowed, otherwise return null
                if (allowStale)
                {
                    var staleProfileData = await GetStructuredProfileAsync(userId, characterName);
                    if (staleProfileData != null)
                    {
                        _logger.LogDebug("Returning stale cached profile for character {CharacterName} (User: {UserId})", characterName, userId);
                        return staleProfileData;
                    }
                }
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting cached profile for character {CharacterName} (User: {UserId})", characterName, userId);
            return null;
        }
    }

    public async Task RequestProfileAsync(string userId, string characterName)
    {
        var requestKey = $"{userId}:{characterName}";
        
        try
        {
            // Check if there's already a pending request for this character
            if (_pendingRequests.TryGetValue(requestKey, out var existingTask))
            {
                _logger.LogDebug("Profile request already in progress for {CharacterName} (User: {UserId}), waiting for existing request", 
                    characterName, userId);
                await existingTask;
                return;
            }

            // Check rate limiting first
            if (!await _rateLimiter.IsRequestAllowedAsync(userId, characterName))
            {
                var timeUntilNext = _rateLimiter.GetTimeUntilNextRequest(userId, characterName);
                _logger.LogWarning("Profile request blocked by rate limiter for {CharacterName} (User: {UserId}). Next request allowed in {TimeUntilNext}", 
                    characterName, userId, timeUntilNext);
                throw new InvalidOperationException($"Rate limited. Next request allowed in {timeUntilNext.TotalSeconds:F0} seconds.");
            }

            _logger.LogInformation("Requesting profile for character {CharacterName} (User: {UserId})", characterName, userId);

            // Record the request for rate limiting
            _rateLimiter.RecordRequest(userId, characterName);

            // Create a new task for this request
            var requestTask = RequestProfileWithFallbackAsync(userId, characterName);
            
            // Store the task to prevent duplicate requests
            _pendingRequests.TryAdd(requestKey, requestTask);
            
            try
            {
                // Execute the request
                await requestTask;
            }
            finally
            {
                // Remove the task from pending requests when done
                _pendingRequests.TryRemove(requestKey, out _);
            }
        }
        catch (Exception ex)
        {
            // Make sure to remove from pending requests on error
            _pendingRequests.TryRemove(requestKey, out _);
            _logger.LogError(ex, "Failed to request profile for character {CharacterName} (User: {UserId})", characterName, userId);
            throw;
        }
    }

    private async Task RequestProfileWithFallbackAsync(string userId, string characterName)
    {
        try
        {
            // Try F-List API first with automatic ticket renewal
            try
            {
                _logger.LogInformation("Attempting to fetch profile for {CharacterName} (User: {UserId}) using F-List API with ticket renewal", 
                    characterName, userId);
                
                // Get F-Chat credentials from user settings
                var settings = await _userService.GetUserSettingsAsync(userId);
                if (settings?.FChatCredentialsEncrypted == null)
                {
                    _logger.LogInformation("No F-Chat credentials found for user {UserId}, falling back to PRO/PRD commands", userId);
                    await _fChatService.RequestProfileAsync(userId, characterName);
                    return;
                }

                // Decode credentials
                var credentialsBytes = Convert.FromBase64String(settings.FChatCredentialsEncrypted);
                var credentials = System.Text.Encoding.UTF8.GetString(credentialsBytes);
                var parts = credentials.Split(':');

                if (parts.Length != 2)
                {
                    _logger.LogError("Invalid credentials format for user {UserId}", userId);
                    await _fChatService.RequestProfileAsync(userId, characterName);
                    return;
                }

                var account = parts[0];
                var password = parts[1];
                
                // Use the new method with automatic ticket renewal
                var characterData = await _characterDataService.GetCharacterDataWithMappingAndTicketRenewalAsync(characterName, account, password);
                
                // Convert CharacterDataResponse to ProfileData
                var profileData = ConvertCharacterDataToProfileData(characterData);
                
                // Save the structured profile data
                await SaveStructuredProfileAsync(userId, profileData);
                
                _logger.LogInformation("Successfully fetched and saved profile for {CharacterName} (User: {UserId}) using F-List API with ticket renewal: {Summary}", 
                    characterName, userId, profileData.GetSummary());
                
                return;
            }
            catch (Exception apiEx)
            {
                _logger.LogWarning(apiEx, "F-List API with ticket renewal failed for {CharacterName} (User: {UserId}), falling back to PRO/PRD commands", 
                    characterName, userId);
                
                // Fall back to PRO/PRD commands
                await _fChatService.RequestProfileAsync(userId, characterName);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Both F-List API and PRO/PRD commands failed for {CharacterName} (User: {UserId})", 
                characterName, userId);
            throw;
        }
    }

    private ProfileData ConvertCharacterDataToProfileData(CharacterDataResponse characterData)
    {
        var profileData = new ProfileData
        {
            CharacterName = characterData.Name,
            Description = characterData.Description ?? string.Empty,
            Timestamp = DateTime.UtcNow
        };

        // Convert infotags to info dictionary (keys should already be human-readable after mapping)
        foreach (var infotag in characterData.Infotags)
        {
            if (!string.IsNullOrEmpty(infotag.Value))
            {
                profileData.Info[infotag.Key] = infotag.Value;
            }
        }

        // Convert kinks to structured kink list (keys should already be human-readable after mapping)
        foreach (var kink in characterData.Kinks)
        {
            if (!string.IsNullOrEmpty(kink.Value))
            {
                var kinkInfo = new KinkInfo
                {
                    KinkId = kink.Key, // This will be the human-readable name after mapping
                    KinkName = kink.Key,
                    KinkPreference = kink.Value,
                    IsCustom = false
                };
                profileData.Kinks.Add(kinkInfo);
            }
        }

        // Add custom kinks
        foreach (var customKinkEntry in characterData.CustomKinks)
        {
            var customKink = customKinkEntry.Value;
            var kinkInfo = new KinkInfo
            {
                KinkId = customKinkEntry.Key,
                KinkName = customKink.Name,
                KinkPreference = customKink.Choice,
                IsCustom = true
            };
            profileData.Kinks.Add(kinkInfo);
        }

        // Add view count
        profileData.Info["View Count"] = characterData.ViewCount.ToString();

        // Add images
        if (characterData.Images.Any())
        {
            var imageIds = string.Join(", ", characterData.Images.Select(img => img.ImageId));
            profileData.Info["Images"] = imageIds;
            
            // Add detailed image information for frontend
            foreach (var image in characterData.Images)
            {
                var imageKey = $"Image_{image.ImageId}";
                var imageInfo = $"{image.ImageId}.{image.Extension}|{image.Width}x{image.Height}";
                if (!string.IsNullOrEmpty(image.Description))
                {
                    imageInfo += $"|{image.Description}";
                }
                profileData.Info[imageKey] = imageInfo;
            }

            // Populate the images array with structured data
            foreach (var image in characterData.Images)
            {
                profileData.Images.Add(new ProfileImage
                {
                    ImageId = image.ImageId,
                    ImageExt = image.Extension,
                    ImageDescription = image.Description
                });
            }
        }

        // Add inlines
        if (characterData.Inlines.Any())
        {
            var inlineHashes = string.Join(", ", characterData.Inlines.Select(inline => inline.Value.Hash));
            profileData.Info["Inlines"] = inlineHashes;
        }

        // Extract gender from the profile data
        profileData.ExtractGender();

        return profileData;
    }

    public async Task<ProfileData?> GetCharacterDataAsync(string userId, string characterName)
    {
        try
        {
            _logger.LogInformation("Getting character data for {CharacterName} (User: {UserId}) with automatic ticket renewal", characterName, userId);

            // Get F-Chat credentials from user settings
            var settings = await _userService.GetUserSettingsAsync(userId);
            if (settings?.FChatCredentialsEncrypted == null)
            {
                _logger.LogWarning("No F-Chat credentials found for user {UserId}", userId);
                return null;
            }

            // Decode credentials
            var credentialsBytes = Convert.FromBase64String(settings.FChatCredentialsEncrypted);
            var credentials = System.Text.Encoding.UTF8.GetString(credentialsBytes);
            var parts = credentials.Split(':');

            if (parts.Length != 2)
            {
                _logger.LogError("Invalid credentials format for user {UserId}", userId);
                return null;
            }

            var account = parts[0];
            var password = parts[1];

            // Check rate limiting
            if (!await _rateLimiter.IsRequestAllowedAsync(userId, characterName))
            {
                var timeUntilNext = _rateLimiter.GetTimeUntilNextRequest(userId, characterName);
                _logger.LogWarning("Character data request blocked by rate limiter for {CharacterName} (User: {UserId}). Next request allowed in {TimeUntilNext}", 
                    characterName, userId, timeUntilNext);
                throw new InvalidOperationException($"Rate limited. Next request allowed in {timeUntilNext.TotalSeconds:F0} seconds.");
            }

            // Record the request for rate limiting
            _rateLimiter.RecordRequest(userId, characterName);

            // Get character data from F-List API with automatic ticket renewal
            var characterData = await _characterDataService.GetCharacterDataWithMappingAndTicketRenewalAsync(characterName, account, password);

            // Convert to ProfileData format
            var profileData = _characterDataService.ConvertToProfileData(characterData);

            // Save the profile data
            await SaveStructuredProfileAsync(userId, profileData);

            _logger.LogInformation("Successfully retrieved and saved character data for {CharacterName} (User: {UserId}) with automatic ticket renewal", characterName, userId);

            return profileData;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get character data for {CharacterName} (User: {UserId})", characterName, userId);
            throw;
        }
    }

    private Task<FChatWebSocketClient?> GetWebSocketClientAsync(string userId, string characterName)
    {
        try
        {
            // Use reflection to access the private _connections field from FChatService
            var fChatServiceType = _fChatService.GetType();
            var connectionsField = fChatServiceType.GetField("_connections", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            
            if (connectionsField?.GetValue(_fChatService) is Dictionary<string, Dictionary<string, FChatWebSocketClient>> connections)
            {
                if (connections.TryGetValue(userId, out var userConnections) &&
                    userConnections.TryGetValue(characterName, out var client))
                {
                    return Task.FromResult<FChatWebSocketClient?>(client);
                }
            }

            return Task.FromResult<FChatWebSocketClient?>(null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get WebSocket client for user {UserId}, character {CharacterName}", userId, characterName);
            return Task.FromResult<FChatWebSocketClient?>(null);
        }
    }
}