using FChatBouncer.Server.Models;
using System.Text.Json;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for interacting with F-List mapping API to get human-readable names
/// </summary>
public class FListMappingService : IFListMappingService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<FListMappingService> _logger;
    private CachedMappingData? _cachedMapping;

    public FListMappingService(HttpClient httpClient, ILogger<FListMappingService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<MappingResponse> GetMappingAsync()
    {
        // Try to get cached mapping first
        var cachedMapping = await GetCachedMappingAsync();
        if (cachedMapping != null)
        {
            _logger.LogDebug("Using cached mapping data");
            return cachedMapping;
        }

        // Cache is expired or doesn't exist, fetch new data
        return await RefreshMappingCacheAsync();
    }

    public Task<MappingResponse?> GetCachedMappingAsync()
    {
        if (_cachedMapping?.IsValid == true)
        {
            return Task.FromResult<MappingResponse?>(_cachedMapping.Data);
        }

        return Task.FromResult<MappingResponse?>(null);
    }

    public async Task<MappingResponse> RefreshMappingCacheAsync()
    {
        try
        {
            _logger.LogInformation("Fetching mapping data from F-List API");

            // F-List mapping endpoint (this is a placeholder - we need to find the actual endpoint)
            // Based on F-List API documentation, this should be the mapping endpoint
            var response = await _httpClient.GetAsync("https://www.f-list.net/json/api/mapping-list.php");

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to fetch mapping data. Status: {StatusCode}", response.StatusCode);
                throw new HttpRequestException($"Failed to fetch mapping data. Status: {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();
            _logger.LogDebug("Received mapping data: {Content}", content);

            var mappingResponse = JsonSerializer.Deserialize<MappingResponse>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (mappingResponse == null)
            {
                _logger.LogError("Failed to deserialize mapping response");
                throw new InvalidOperationException("Failed to deserialize mapping response");
            }

            if (mappingResponse.HasError)
            {
                _logger.LogError("Mapping API returned error: {Error}", mappingResponse.Error);
                throw new InvalidOperationException($"Mapping API error: {mappingResponse.Error}");
            }

            // Cache the mapping data
            _cachedMapping = new CachedMappingData
            {
                Data = mappingResponse,
                CachedAt = DateTime.UtcNow
            };

            _logger.LogInformation("Successfully cached mapping data. Infotags: {InfotagCount}, Kinks: {KinkCount}, KinkGroups: {KinkGroupCount}, InfotagGroups: {InfotagGroupCount}, ListItems: {ListItemCount}",
                mappingResponse.Infotags.Count, mappingResponse.Kinks.Count, mappingResponse.KinkGroups.Count, mappingResponse.InfotagGroups.Count, mappingResponse.ListItems.Count);

            return mappingResponse;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh mapping cache");
            throw;
        }
    }
}
