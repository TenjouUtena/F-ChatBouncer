using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for interacting with F-List mapping API to get human-readable names
/// </summary>
public interface IFListMappingService
{
    /// <summary>
    /// Get mapping data for infotags, kinks, and list items (cached for 24 hours)
    /// </summary>
    Task<MappingResponse> GetMappingAsync(CancellationToken ct = default);
}
