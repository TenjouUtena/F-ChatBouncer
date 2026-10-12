using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

public interface IProfileService
{
    /// <summary>
    /// Returns the cached profile (possibly stale), whether it is stale, and whether this call queued a refresh.
    /// </summary>
    Task<(ProfileData? Profile, DateTime? FetchedAt, bool IsStale, bool RefreshQueued)> GetAsync(string userId, string characterName, bool queueIfStale = true);

    /// <summary>
    /// Force a refresh regardless of age. Used by the modal's refresh button.
    /// </summary>
    Task<bool> RequestRefreshAsync(string userId, string characterName);

    /// <summary>
    /// Fetch the profile from F-List and store it. Called only by ProfileFetchWorker.
    /// </summary>
    Task FetchAndStoreAsync(string userId, string characterName, CancellationToken ct);

    Task NotifyProfileAvailableAsync(string userId, string characterName);
}
