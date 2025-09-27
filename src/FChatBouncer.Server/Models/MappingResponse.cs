using System.Text.Json.Serialization;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Response model for F-List mapping API endpoint
/// Used to get human-readable names for infotags, kinks, and list items
/// </summary>
public class MappingResponse
{
    /// <summary>
    /// List of kinks with their details
    /// </summary>
    [JsonPropertyName("kinks")]
    public List<KinkItem> Kinks { get; set; } = new();

    /// <summary>
    /// List of kink groups
    /// </summary>
    [JsonPropertyName("kink_groups")]
    public List<KinkGroup> KinkGroups { get; set; } = new();

    /// <summary>
    /// List of infotags
    /// </summary>
    [JsonPropertyName("infotags")]
    public List<InfotagItem> Infotags { get; set; } = new();

    /// <summary>
    /// List of infotag groups
    /// </summary>
    [JsonPropertyName("infotag_groups")]
    public List<InfotagGroup> InfotagGroups { get; set; } = new();

    /// <summary>
    /// List of list items
    /// </summary>
    [JsonPropertyName("listitems")]
    public List<ListItem> ListItems { get; set; } = new();

    /// <summary>
    /// Error message if the request failed
    /// </summary>
    [JsonPropertyName("error")]
    public string? Error { get; set; }

    /// <summary>
    /// Check if the response contains an error
    /// </summary>
    public bool HasError => !string.IsNullOrEmpty(Error);

    /// <summary>
    /// Get kink by ID
    /// </summary>
    public KinkItem? GetKinkById(string id) => Kinks.FirstOrDefault(k => k.Id == id);

    /// <summary>
    /// Get kink by name
    /// </summary>
    public KinkItem? GetKinkByName(string name) => Kinks.FirstOrDefault(k => k.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Get infotag by ID
    /// </summary>
    public InfotagItem? GetInfotagById(string id) => Infotags.FirstOrDefault(i => i.Id == id);

    /// <summary>
    /// Get infotag by name
    /// </summary>
    public InfotagItem? GetInfotagByName(string name) => Infotags.FirstOrDefault(i => i.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Get list item by ID
    /// </summary>
    public ListItem? GetListItemById(string id) => ListItems.FirstOrDefault(l => l.Id == id);

    /// <summary>
    /// Get list item by name
    /// </summary>
    public ListItem? GetListItemByName(string name) => ListItems.FirstOrDefault(l => l.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
}

/// <summary>
/// Represents a kink item from the F-List API
/// </summary>
public class KinkItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("group_id")]
    public string GroupId { get; set; } = string.Empty;
}

/// <summary>
/// Represents a kink group from the F-List API
/// </summary>
public class KinkGroup
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

/// <summary>
/// Represents an infotag item from the F-List API
/// </summary>
public class InfotagItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("list")]
    public string List { get; set; } = string.Empty;

    [JsonPropertyName("group_id")]
    public string GroupId { get; set; } = string.Empty;
}

/// <summary>
/// Represents an infotag group from the F-List API
/// </summary>
public class InfotagGroup
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

/// <summary>
/// Represents a list item from the F-List API
/// </summary>
public class ListItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("value")]
    public string Value { get; set; } = string.Empty;
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
