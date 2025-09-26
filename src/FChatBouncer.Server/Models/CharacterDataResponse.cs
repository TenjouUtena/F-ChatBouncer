using System.Text.Json.Serialization;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Response model for F-List character-data.php API endpoint
/// </summary>
public class CharacterDataResponse
{
    /// <summary>
    /// Character's unique ID
    /// </summary>
    [JsonPropertyName("id")]
    public int Id { get; set; }

    /// <summary>
    /// Character's name
    /// </summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Character's description
    /// </summary>
    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Character's view count
    /// </summary>
    [JsonPropertyName("views")]
    public int ViewCount { get; set; }

    /// <summary>
    /// Whether custom kinks are shown first
    /// </summary>
    [JsonPropertyName("customs_first")]
    public bool CustomsFirst { get; set; }

    /// <summary>
    /// Custom title
    /// </summary>
    [JsonPropertyName("custom_title")]
    public string CustomTitle { get; set; } = string.Empty;

    /// <summary>
    /// Whether this is the user's own character
    /// </summary>
    [JsonPropertyName("is_self")]
    public bool IsSelf { get; set; }

    /// <summary>
    /// Character settings
    /// </summary>
    [JsonPropertyName("settings")]
    public CharacterSettings? Settings { get; set; }

    /// <summary>
    /// Character badges
    /// </summary>
    [JsonPropertyName("badges")]
    public List<object> Badges { get; set; } = new();

    /// <summary>
    /// When the character was created (Unix timestamp)
    /// </summary>
    [JsonPropertyName("created_at")]
    public long CreatedAt { get; set; }

    /// <summary>
    /// When the character was last updated (Unix timestamp)
    /// </summary>
    [JsonPropertyName("updated_at")]
    public long UpdatedAt { get; set; }

    /// <summary>
    /// Character's infotags (key-value pairs)
    /// </summary>
    [JsonPropertyName("infotags")]
    public Dictionary<string, string> Infotags { get; set; } = new();

    /// <summary>
    /// Character's kinks (key-value pairs where key is kink ID, value is preference level)
    /// </summary>
    [JsonPropertyName("kinks")]
    public Dictionary<string, string> Kinks { get; set; } = new();

    /// <summary>
    /// Character's custom kinks (dictionary keyed by custom kink ID)
    /// </summary>
    [JsonPropertyName("custom_kinks")]
    public Dictionary<string, CustomKink> CustomKinks { get; set; } = new();

    /// <summary>
    /// Character's inlines (dictionary keyed by inline ID)
    /// </summary>
    [JsonPropertyName("inlines")]
    public Dictionary<string, CharacterInline> Inlines { get; set; } = new();

    /// <summary>
    /// Character's images
    /// </summary>
    [JsonPropertyName("images")]
    public List<CharacterImage> Images { get; set; } = new();

    /// <summary>
    /// Character list (other characters by this user)
    /// </summary>
    [JsonPropertyName("character_list")]
    public List<CharacterListItem> CharacterList { get; set; } = new();

    /// <summary>
    /// Timezone offset
    /// </summary>
    [JsonPropertyName("timezone")]
    public int Timezone { get; set; }

    /// <summary>
    /// Current user information
    /// </summary>
    [JsonPropertyName("current_user")]
    public CurrentUser? CurrentUser { get; set; }

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
/// Custom kink information
/// </summary>
public class CustomKink
{
    /// <summary>
    /// Custom kink name
    /// </summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Custom kink description
    /// </summary>
    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Custom kink preference level
    /// </summary>
    [JsonPropertyName("choice")]
    public string Choice { get; set; } = string.Empty;

    /// <summary>
    /// Child custom kinks
    /// </summary>
    [JsonPropertyName("children")]
    public List<object> Children { get; set; } = new();
}

/// <summary>
/// Character image information
/// </summary>
public class CharacterImage
{
    /// <summary>
    /// Image ID
    /// </summary>
    [JsonPropertyName("image_id")]
    public string ImageId { get; set; } = string.Empty;

    /// <summary>
    /// Image extension
    /// </summary>
    [JsonPropertyName("extension")]
    public string Extension { get; set; } = string.Empty;

    /// <summary>
    /// Image height
    /// </summary>
    [JsonPropertyName("height")]
    public string Height { get; set; } = string.Empty;

    /// <summary>
    /// Image width
    /// </summary>
    [JsonPropertyName("width")]
    public string Width { get; set; } = string.Empty;

    /// <summary>
    /// Image description
    /// </summary>
    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Sort order
    /// </summary>
    [JsonPropertyName("sort_order")]
    public int? SortOrder { get; set; }
}

/// <summary>
/// Character inline information
/// </summary>
public class CharacterInline
{
    /// <summary>
    /// Inline hash
    /// </summary>
    [JsonPropertyName("hash")]
    public string Hash { get; set; } = string.Empty;

    /// <summary>
    /// Inline extension
    /// </summary>
    [JsonPropertyName("extension")]
    public string Extension { get; set; } = string.Empty;

    /// <summary>
    /// Whether the inline is NSFW
    /// </summary>
    [JsonPropertyName("nsfw")]
    public bool Nsfw { get; set; }
}

/// <summary>
/// Character settings
/// </summary>
public class CharacterSettings
{
    /// <summary>
    /// Whether custom kinks are shown first
    /// </summary>
    [JsonPropertyName("customs_first")]
    public bool CustomsFirst { get; set; }

    /// <summary>
    /// Whether to show friends
    /// </summary>
    [JsonPropertyName("show_friends")]
    public bool ShowFriends { get; set; }

    /// <summary>
    /// Whether guestbook is enabled
    /// </summary>
    [JsonPropertyName("guestbook")]
    public bool Guestbook { get; set; }

    /// <summary>
    /// Whether to prevent bookmarks
    /// </summary>
    [JsonPropertyName("prevent_bookmarks")]
    public bool PreventBookmarks { get; set; }

    /// <summary>
    /// Whether the profile is public
    /// </summary>
    [JsonPropertyName("public")]
    public bool Public { get; set; }
}

/// <summary>
/// Character list item
/// </summary>
public class CharacterListItem
{
    /// <summary>
    /// Character ID
    /// </summary>
    [JsonPropertyName("id")]
    public int Id { get; set; }

    /// <summary>
    /// Character name
    /// </summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

/// <summary>
/// Current user information
/// </summary>
public class CurrentUser
{
    /// <summary>
    /// Inline mode
    /// </summary>
    [JsonPropertyName("inline_mode")]
    public int InlineMode { get; set; }

    /// <summary>
    /// Whether animated icons are enabled
    /// </summary>
    [JsonPropertyName("animated_icons")]
    public bool AnimatedIcons { get; set; }
}
