using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using FChatBouncer.Server.Hubs;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Collections.Concurrent;
using Npgsql;
using Microsoft.AspNetCore.SignalR;

namespace FChatBouncer.Server.Services;

public class ProfileService : IProfileService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IFChatService _fChatService;
    private readonly ILogger<ProfileService> _logger;
    private readonly IProfileRateLimiter _rateLimiter;
    private readonly IHubContext<BouncerHub> _hubContext;
    private readonly IProfileQueueService _profileQueueService;
    private readonly ConcurrentDictionary<string, Task> _pendingRequests = new();

    public ProfileService(
        IServiceProvider serviceProvider,
        IFChatService fChatService,
        ILogger<ProfileService> logger,
        IProfileRateLimiter rateLimiter,
        IHubContext<BouncerHub> hubContext,
        IProfileQueueService profileQueueService)
    {
        _serviceProvider = serviceProvider;
        _fChatService = fChatService;
        _logger = logger;
        _rateLimiter = rateLimiter;
        _hubContext = hubContext;
        _profileQueueService = profileQueueService;
    }

    public async Task SaveProfileAsync(string userId, string characterName, string profileData, string? rawProData = null)
    {
        using var scope = _serviceProvider.CreateScope();
        var characterService = scope.ServiceProvider.GetRequiredService<ICharacterService>();
        
        try
        {
            // Use CharacterService to update the character profile (unified storage in Character table)
            await characterService.UpdateCharacterProfileAsync(characterName, profileData, rawProData);

            _logger.LogInformation("Saved profile for character {CharacterName} (User: {UserId})", characterName, userId);

            // Log the raw PRO data for analysis
            if (!string.IsNullOrEmpty(rawProData))
            {
                _logger.LogDebug("PRO Data received for {CharacterName}: {RawProData}", characterName, rawProData);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save profile for character {CharacterName} (User: {UserId})", characterName, userId);
            throw;
        }
    }

    [Obsolete("Profile table removed - use GetStructuredProfileAsync instead")]
    public async Task<Profile?> GetProfileAsync(string userId, string characterName)
    {
        // Profile table has been removed - this method is deprecated
        _logger.LogWarning("GetProfileAsync called but Profile table has been removed - use GetStructuredProfileAsync instead");
        return null;
    }

    [Obsolete("Profile table removed - use CharacterService to get character profiles")]
    public async Task<List<Profile>> GetUserProfilesAsync(string userId)
    {
        // Profile table has been removed - this method is deprecated
        _logger.LogWarning("GetUserProfilesAsync called but Profile table has been removed");
        return new List<Profile>();
    }

    public async Task SaveStructuredProfileAsync(string userId, ProfileData profileData)
    {
        using var scope = _serviceProvider.CreateScope();
        var characterService = scope.ServiceProvider.GetRequiredService<ICharacterService>();
        
        try
        {
            // Use CharacterService to update the character profile (unified storage in Character table)
            await characterService.UpdateCharacterProfileAsync(profileData.CharacterName, profileData);

            _logger.LogInformation("Saved structured profile for character {CharacterName} (User: {UserId}): {Summary}",
                profileData.CharacterName, userId, profileData.GetSummary());

            // Notify the frontend that a new profile is available
            await NotifyProfileAvailableAsync(userId, profileData.CharacterName);

            // Refresh memo data when profile is updated (disabled for now)
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
        using var scope = _serviceProvider.CreateScope();
        var characterService = scope.ServiceProvider.GetRequiredService<ICharacterService>();
        
        try
        {
            // Get from CharacterService (unified character data)
            var characterProfile = await characterService.GetCharacterProfileAsync(characterName);
            if (characterProfile != null)
            {
                _logger.LogDebug("Retrieved structured profile from CharacterService for character {CharacterName} (User: {UserId}): {Summary}",
                    characterName, userId, characterProfile.GetSummary());
                return characterProfile;
            }

            _logger.LogDebug("No profile found for character {CharacterName} (User: {UserId})", characterName, userId);
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
        using var scope = _serviceProvider.CreateScope();
        var characterService = scope.ServiceProvider.GetRequiredService<ICharacterService>();
        
        try
        {
            // First try to get from CharacterService (unified character data) - this is the most efficient path
            var characterProfile = await characterService.GetCharacterProfileAsync(characterName);
            if (characterProfile != null)
            {
                // Check if this profile is stale by looking at the timestamp
                var age = DateTime.UtcNow - characterProfile.Timestamp;
                var isStale = age.TotalHours >= 24;

                _logger.LogDebug("Retrieved cached profile from CharacterService for character {CharacterName} (User: {UserId}). Age: {Age:F1} hours, stale: {IsStale}",
                    characterName, userId, age.TotalHours, isStale);

                // If profile is fresh (< 6 hours), return it immediately
                if (!isStale)
                {
                    _logger.LogDebug("Returning fresh cached profile for character {CharacterName} (User: {UserId})", characterName, userId);
                    return characterProfile;
                }

                // If profile is stale (>= 24 hours)
                if (isStale)
                {
                    // Check if there's already a request in the queue to avoid duplicates
                    var isInQueue = await _profileQueueService.IsProfileRequestInQueueAsync(userId, characterName);
                    
                    if (!isInQueue)
                    {
                        // Add stale profile to queue for background refresh
                        var queued = await _profileQueueService.EnqueueProfileRequestAsync(
                            userId, 
                            characterName, 
                            ProfileRequestType.StaleRefresh, 
                            ProfileRequestPriority.Normal);
                        
                        if (queued)
                        {
                            _logger.LogInformation("Queued stale profile refresh for {CharacterName} (User: {UserId})", characterName, userId);
                        }
                        else
                        {
                            _logger.LogDebug("Stale profile refresh already queued for {CharacterName} (User: {UserId})", characterName, userId);
                        }
                    }
                    else
                    {
                        _logger.LogDebug("Stale profile refresh already in queue for {CharacterName} (User: {UserId})", characterName, userId);
                    }

                    // Return stale data if allowed, otherwise return null
                    if (allowStale)
                    {
                        _logger.LogDebug("Returning stale cached profile for character {CharacterName} (User: {UserId})", characterName, userId);
                        return characterProfile;
                    }
                }

                return characterProfile;
            }

            // No profile found - queue a new profile request
            _logger.LogInformation("No profile found for {CharacterName} (User: {UserId}), queuing new profile request", characterName, userId);
            
            // Check if there's already a request in the queue to avoid duplicates
            var newRequestInQueue = await _profileQueueService.IsProfileRequestInQueueAsync(userId, characterName);
            
            if (!newRequestInQueue)
            {
                // Add new profile request to queue
                var newRequestQueued = await _profileQueueService.EnqueueProfileRequestAsync(
                    userId, 
                    characterName, 
                    ProfileRequestType.InitialLoad, 
                    ProfileRequestPriority.High);
                
                if (newRequestQueued)
                {
                    _logger.LogInformation("Queued new profile request for {CharacterName} (User: {UserId})", characterName, userId);
                }
                else
                {
                    _logger.LogDebug("Profile request already queued for {CharacterName} (User: {UserId})", characterName, userId);
                }
            }
            else
            {
                _logger.LogDebug("Profile request already in queue for {CharacterName} (User: {UserId})", characterName, userId);
            }

            // Failed to get profile from CharacterService, try legacy Profile table
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
        // For manual requests, add to queue with high priority
        var queued = await _profileQueueService.EnqueueProfileRequestAsync(
            userId, 
            characterName, 
            ProfileRequestType.ManualRequest, 
            ProfileRequestPriority.High);
        
        if (!queued)
        {
            _logger.LogDebug("Profile request already queued for {CharacterName} (User: {UserId})", characterName, userId);
        }
        else
        {
            _logger.LogInformation("Queued manual profile request for {CharacterName} (User: {UserId})", characterName, userId);
        }
    }

    /// <summary>
    /// Process a profile request from the queue (called by ProfileQueueProcessor)
    /// </summary>
    public async Task ProcessProfileRequestAsync(string userId, string characterName)
    {
        var requestKey = $"{userId}:{characterName}";
        
        try
        {
            // Check if there's already a pending request for this character
            if (_pendingRequests.TryGetValue(requestKey, out var existingTask))
            {
                _logger.LogDebug("Profile request already in progress for {CharacterName} (User: {UserId}), waiting for existing request", 
                    characterName, userId);
                try
                {
                    await existingTask;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Existing profile request failed for {CharacterName} (User: {UserId}), continuing with new request", 
                        characterName, userId);
                }
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

            _logger.LogInformation("Processing profile request for character {CharacterName} (User: {UserId})", characterName, userId);

            // Record the request for rate limiting
            _rateLimiter.RecordRequest(userId, characterName);

            // Create a new task for this request
            var requestTask = RequestProfileWithFallbackAsync(userId, characterName);
            
            // Store the task to prevent duplicate requests - use TryAdd to be thread-safe
            if (!_pendingRequests.TryAdd(requestKey, requestTask))
            {
                // Another thread added a task between our check and add, wait for it instead
                _logger.LogDebug("Another thread started profile request for {CharacterName} (User: {UserId}), waiting for it", 
                    characterName, userId);
                if (_pendingRequests.TryGetValue(requestKey, out var concurrentTask))
                {
                    await concurrentTask;
                }
                return;
            }
            
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
            _logger.LogError(ex, "Failed to process profile request for character {CharacterName} (User: {UserId})", characterName, userId);
            throw;
        }
    }

    private async Task RequestProfileWithFallbackAsync(string userId, string characterName)
    {
        using var scope = _serviceProvider.CreateScope();
        var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
        var characterDataService = scope.ServiceProvider.GetRequiredService<IFListCharacterDataService>();
        
        try
        {
            // Try F-List API first with automatic ticket renewal
            try
            {
                _logger.LogInformation("Attempting to fetch profile for {CharacterName} (User: {UserId}) using F-List API with ticket renewal", 
                    characterName, userId);
                
                // Get F-Chat credentials from user settings
                var settings = await userService.GetUserSettingsAsync(userId);
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
                var characterData = await characterDataService.GetCharacterDataWithMappingAndTicketRenewalAsync(characterName, account, password);
                
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
                IsCustom = true,
                Description = customKink.Description
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
        using var scope = _serviceProvider.CreateScope();
        var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
        var characterDataService = scope.ServiceProvider.GetRequiredService<IFListCharacterDataService>();
        
        try
        {
            _logger.LogInformation("Getting character data for {CharacterName} (User: {UserId}) with automatic ticket renewal", characterName, userId);

            // Get F-Chat credentials from user settings
            var settings = await userService.GetUserSettingsAsync(userId);
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
            var characterData = await characterDataService.GetCharacterDataWithMappingAndTicketRenewalAsync(characterName, account, password);

            // Convert to ProfileData format
            var profileData = characterDataService.ConvertToProfileData(characterData);

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

    public async Task NotifyProfileAvailableAsync(string userId, string characterName)
    {
        try
        {
            _logger.LogDebug("Notifying frontend that profile is available for character {CharacterName} (User: {UserId})", characterName, userId);
            
            // Validate character name before sending
            if (string.IsNullOrEmpty(characterName))
            {
                _logger.LogWarning("Attempted to notify frontend with null or empty character name (User: {UserId})", userId);
                return;
            }
            
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("ProfileAvailable", new
            {
                CharacterName = characterName,
                Timestamp = DateTime.UtcNow
            });
            
            _logger.LogDebug("Successfully sent ProfileAvailable notification for character {CharacterName} (User: {UserId})", characterName, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to notify frontend about available profile for character {CharacterName} (User: {UserId})", characterName, userId);
        }
    }
}