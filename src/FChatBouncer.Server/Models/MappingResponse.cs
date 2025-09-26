using System.Text.Json.Serialization;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Response model for F-List mapping API endpoint
/// Used to get human-readable names for infotags, kinks, and list items
/// </summary>
public class MappingResponse
{
    /// <summary>
    /// Mapping of infotag IDs to human-readable names
    /// </summary>
    [JsonPropertyName("infotags")]
    public Dictionary<string, string> Infotags { get; set; } = new();

    /// <summary>
    /// Mapping of kink IDs to human-readable names
    /// </summary>
    [JsonPropertyName("kinks")]
    public Dictionary<string, string> Kinks { get; set; } = new();

    /// <summary>
    /// Mapping of subkink IDs to human-readable names
    /// </summary>
    [JsonPropertyName("subkinks")]
    public Dictionary<string, string> Subkinks { get; set; } = new();

    /// <summary>
    /// Mapping of list item IDs to human-readable names
    /// </summary>
    [JsonPropertyName("list_items")]
    public Dictionary<string, string> ListItems { get; set; } = new();

    /// <summary>
    /// Error message if the request failed
    /// </summary>
    [JsonPropertyName("error")]
    public string? Error { get; set; }

    /// <summary>
    /// Check if the response contains an error
    /// </summary>
    public bool HasError => !string.IsNullOrEmpty(Error);
}

/// <summary>
/// Cached mapping data with timestamp
/// </summary>
public class CachedMappingData
{
    /// <summary>
    /// The mapping data
    /// </summary>
    public MappingResponse Data { get; set; } = new();

    /// <summary>
    /// When this mapping was cached
    /// </summary>
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// How long this mapping is valid (default: 24 hours)
    /// </summary>
    public TimeSpan CacheDuration { get; set; } = TimeSpan.FromHours(24);

    /// <summary>
    /// Check if the cached mapping is still valid
    /// </summary>
    public bool IsValid => DateTime.UtcNow - CachedAt < CacheDuration;
}
