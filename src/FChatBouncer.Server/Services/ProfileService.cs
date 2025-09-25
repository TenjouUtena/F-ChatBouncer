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
    private readonly ILogger<ProfileService> _logger;
    private readonly IProfileRateLimiter _rateLimiter;
    private readonly ConcurrentDictionary<string, Task> _pendingRequests = new();

    public ProfileService(
        BouncerDbContext context,
        IFChatService fChatService,
        ICharacterService characterService,
        ILogger<ProfileService> logger,
        IProfileRateLimiter rateLimiter)
    {
        _context = context;
        _fChatService = fChatService;
        _characterService = characterService;
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
            var requestTask = _fChatService.RequestProfileAsync(userId, characterName);
            
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
}