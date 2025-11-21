using System.Text.Json.Serialization;

namespace FChatBouncer.Server.Models;

/// <summary>
/// Represents a kink with its details
/// </summary>
public class KinkInfo
{
    [JsonPropertyName("kink_id")]
    public string KinkId { get; set; } = string.Empty;

    [JsonPropertyName("kink_name")]
    public string KinkName { get; set; } = string.Empty;

    [JsonPropertyName("kink_pref")]
    public string KinkPreference { get; set; } = string.Empty;

    [JsonPropertyName("custom")]
    public bool IsCustom { get; set; } = false;

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

/// <summary>
/// Represents a profile image with its metadata
/// </summary>
public class ProfileImage
{
    [JsonPropertyName("image_id")]
    public string ImageId { get; set; } = string.Empty;

    [JsonPropertyName("image_ext")]
    public string ImageExt { get; set; } = string.Empty;

    [JsonPropertyName("image_description")]
    public string ImageDescription { get; set; } = string.Empty;
}

/// <summary>
/// Structured profile data class for F-Chat character profiles.
/// This represents the parsed and structured data from F-Chat's PRD command sequence.
/// </summary>
public class ProfileData
{
    /// <summary>
    /// Character name this profile belongs to
    /// </summary>
    [JsonPropertyName("character")]
    public string CharacterName { get; set; } = string.Empty;

    /// <summary>
    /// Character description/profile text
    /// </summary>
    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Character's gender
    /// </summary>
    [JsonPropertyName("gender")]
    public string Gender { get; set; } = "None";

    /// <summary>
    /// Basic character information fields (non-kink data)
    /// </summary>
    [JsonPropertyName("info")]
    public Dictionary<string, string> Info { get; set; } = new();

    /// <summary>
    /// Character's kinks with preferences
    /// </summary>
    [JsonPropertyName("kinks")]
    public List<KinkInfo> Kinks { get; set; } = new();

    /// <summary>
    /// Character's images with metadata
    /// </summary>
    [JsonPropertyName("images")]
    public List<ProfileImage> Images { get; set; } = new();

    /// <summary>
    /// Character's inline images (dictionary keyed by inline ID)
    /// </summary>
    [JsonPropertyName("inlines")]
    public Dictionary<string, CharacterInline> Inlines { get; set; } = new();

    /// <summary>
    /// When this profile data was built/received
    /// </summary>
    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Get a profile field value by key from info section
    /// </summary>
    public string? GetField(string key)
    {
        return Info.TryGetValue(key, out var value) ? value : null;
    }

    /// <summary>
    /// Get a summary of the profile data for logging/debugging
    /// </summary>
    public string GetSummary()
    {
        return $"Character: {CharacterName}, Gender: {Gender}, Info Fields: {Info.Count}, Kinks: {Kinks.Count}";
    }

    /// <summary>
    /// Extract and set gender from profile data
    /// </summary>
    public void ExtractGender()
    {
        // Common gender field names in F-Chat profiles
        var genderFieldNames = new[] { "gender", "Gender", "sex", "Sex" };

        foreach (var fieldName in genderFieldNames)
        {
            var genderValue = GetField(fieldName);
            if (!string.IsNullOrEmpty(genderValue))
            {
                Gender = NormalizeGender(genderValue);
                return;
            }
        }

        // Default to "None" if no gender found
        Gender = "None";
    }

    /// <summary>
    /// Normalize gender values to match F-List 3.0 standards
    /// </summary>
    private static string NormalizeGender(string rawGender)
    {
        if (string.IsNullOrWhiteSpace(rawGender))
            return "None";

        var normalized = rawGender.Trim().ToLowerInvariant();

        return normalized switch
        {
            "female" or "f" => "Female",
            "male" or "m" => "Male",
            "herm" or "hermaphrodite" => "Herm",
            "male-herm" or "maleherm" or "m-herm" => "Male-Herm",
            "shemale" or "trans-female" or "transfemale" => "Shemale",
            "cunt-boy" or "cuntboy" or "trans-male" or "transmale" => "Cunt-Boy",
            "transgender" or "trans" => "Transgender",
            "none" or "unknown" or "" => "None",
            _ => "None" // Default for unrecognized genders
        };
    }
}