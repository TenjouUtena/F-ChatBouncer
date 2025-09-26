using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for interacting with F-List mapping API to get human-readable names
/// </summary>
public interface IFListMappingService
{
    /// <summary>
    /// Get mapping data for infotags, kinks, and list items
    /// </summary>
    /// <returns>Mapping response with human-readable names</returns>
    Task<MappingResponse> GetMappingAsync();

    /// <summary>
    /// Get cached mapping data if available and valid
    /// </summary>
    /// <returns>Cached mapping data or null if not available/expired</returns>
    Task<MappingResponse?> GetCachedMappingAsync();

    /// <summary>
    /// Refresh the mapping cache
    /// </summary>
    /// <returns>Updated mapping response</returns>
    Task<MappingResponse> RefreshMappingCacheAsync();
}
