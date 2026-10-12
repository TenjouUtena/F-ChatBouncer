using FChatBouncer.Server.Models;
using System.Text.Json;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Fetches F-List's kink and infotag mapping and caches it in-process for 24 hours.
/// Registered as a singleton so the cache is shared across requests.
/// </summary>
public class FListMappingService : IFListMappingService
{
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<FListMappingService> _logger;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private MappingResponse? _cached;
    private DateTime _cachedAt;

    public FListMappingService(IHttpClientFactory httpClientFactory, ILogger<FListMappingService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<MappingResponse> GetMappingAsync(CancellationToken ct = default)
    {
        if (_cached is not null && DateTime.UtcNow - _cachedAt < Ttl) return _cached;

        await _refreshLock.WaitAsync(ct);
        try
        {
            if (_cached is not null && DateTime.UtcNow - _cachedAt < Ttl) return _cached;

            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync("https://www.f-list.net/json/api/mapping-list.php", ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to fetch mapping data. Status: {StatusCode}", response.StatusCode);
                throw new HttpRequestException($"Failed to fetch mapping data. Status: {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync(ct);

            var mapping = JsonSerializer.Deserialize<MappingResponse>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? throw new InvalidOperationException("Failed to deserialize mapping response");

            if (mapping.HasError)
            {
                _logger.LogError("Mapping API returned error: {Error}", mapping.Error);
                throw new InvalidOperationException($"Mapping API error: {mapping.Error}");
            }

            _cached = mapping;
            _cachedAt = DateTime.UtcNow;
            _logger.LogInformation("Refreshed F-List mapping cache");
            return mapping;
        }
        finally
        {
            _refreshLock.Release();
        }
    }
}
