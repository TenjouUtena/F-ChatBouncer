using System.Text.Json.Serialization;

namespace FChatBouncer.Server.Models;

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
    /// Basic character information fields
    /// </summary>
    [JsonPropertyName("info")]
    public Dictionary<string, string> Info { get; set; } = new();

    /// <summary>
    /// Selected/custom profile fields
    /// </summary>
    [JsonPropertyName("select")]
    public Dictionary<string, string> Select { get; set; } = new();

    /// <summary>
    /// Additional profile sections (for any other data)
    /// </summary>
    [JsonPropertyName("additional")]
    public Dictionary<string, object> Additional { get; set; } = new();

    /// <summary>
    /// When this profile data was built/received
    /// </summary>
    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Character's gender (extracted from profile data)
    /// </summary>
    [JsonPropertyName("gender")]
    public string Gender { get; set; } = "None";

    /// <summary>
    /// Get a profile field value by key, searching across all sections
    /// </summary>
    public string? GetField(string key)
    {
        // Search in Info first
        if (Info.TryGetValue(key, out var infoValue))
            return infoValue;

        // Then in Select
        if (Select.TryGetValue(key, out var selectValue))
            return selectValue;

        // Finally in Additional (convert to string if found)
        if (Additional.TryGetValue(key, out var additionalValue))
            return additionalValue?.ToString();

        return null;
    }

    /// <summary>
    /// Get all profile fields as a flat dictionary
    /// </summary>
    public Dictionary<string, string> GetAllFields()
    {
        var allFields = new Dictionary<string, string>();

        // Add Info fields
        foreach (var (key, value) in Info)
        {
            allFields[key] = value;
        }

        // Add Select fields (may override Info fields)
        foreach (var (key, value) in Select)
        {
            allFields[key] = value;
        }

        // Add Additional fields as strings (may override previous fields)
        foreach (var (key, value) in Additional)
        {
            allFields[key] = value?.ToString() ?? "";
        }

        return allFields;
    }

    /// <summary>
    /// Get a summary of the profile data for logging/debugging
    /// </summary>
    public string GetSummary()
    {
        var totalFields = Info.Count + Select.Count + Additional.Count;
        return $"Character: {CharacterName}, Gender: {Gender}, Fields: {totalFields} (Info: {Info.Count}, Select: {Select.Count}, Additional: {Additional.Count})";
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