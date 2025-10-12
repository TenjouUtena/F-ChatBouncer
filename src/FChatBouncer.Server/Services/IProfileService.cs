using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

public interface IProfileService
{
    Task SaveProfileAsync(string userId, string characterName, string profileData, string? rawProData = null);
    Task SaveStructuredProfileAsync(string userId, ProfileData profileData);
    Task<Profile?> GetProfileAsync(string userId, string characterName);
    Task<ProfileData?> GetStructuredProfileAsync(string userId, string characterName);
    Task<ProfileData?> GetCachedProfileAsync(string userId, string characterName, bool allowStale = false);
    Task<List<Profile>> GetUserProfilesAsync(string userId);
    Task RequestProfileAsync(string userId, string characterName);
    Task ProcessProfileRequestAsync(string userId, string characterName);
    Task<ProfileData?> GetCharacterDataAsync(string userId, string characterName);
    Task NotifyProfileAvailableAsync(string userId, string characterName);
}