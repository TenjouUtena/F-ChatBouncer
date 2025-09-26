using FChatBouncer.Server.Models;
using System.Text.Json;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for interacting with F-List character-data.php API endpoint
/// </summary>
public class FListCharacterDataService : IFListCharacterDataService
{
    private readonly HttpClient _httpClient;
    private readonly IFListMappingService _mappingService;
    private readonly ILogger<FListCharacterDataService> _logger;

    public FListCharacterDataService(
        HttpClient httpClient, 
        IFListMappingService mappingService,
        ILogger<FListCharacterDataService> logger)
    {
        _httpClient = httpClient;
        _mappingService = mappingService;
        _logger = logger;
    }

    public async Task<CharacterDataResponse> GetCharacterDataAsync(string characterName, string ticket, string account)
    {
        try
        {
            _logger.LogInformation("Fetching character data for {CharacterName} from F-List API", characterName);

            // Prepare form data for POST request
            var formData = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("name", characterName),
                new KeyValuePair<string, string>("ticket", ticket),
                new KeyValuePair<string, string>("account", account)
            });

            // Make POST request to character-data.php endpoint
            var response = await _httpClient.PostAsync("https://www.f-list.net/json/api/character-data.php", formData);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to fetch character data for {CharacterName}. Status: {StatusCode}", 
                    characterName, response.StatusCode);
                throw new HttpRequestException($"Failed to fetch character data. Status: {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();
            _logger.LogDebug("Received character data for {CharacterName}: {Content}", characterName, content);

            var characterData = JsonSerializer.Deserialize<CharacterDataResponse>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (characterData == null)
            {
                _logger.LogError("Failed to deserialize character data response for {CharacterName}", characterName);
                throw new InvalidOperationException("Failed to deserialize character data response");
            }

            if (characterData.HasError)
            {
                _logger.LogError("Character data API returned error for {CharacterName}: {Error}", 
                    characterName, characterData.Error);
                throw new InvalidOperationException($"Character data API error: {characterData.Error}");
            }

            _logger.LogInformation("Successfully fetched character data for {CharacterName}. ID: {Id}, ViewCount: {ViewCount}, Infotags: {InfotagCount}, Kinks: {KinkCount}",
                characterName, characterData.Id, characterData.ViewCount, characterData.Infotags.Count, characterData.Kinks.Count);

            return characterData;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get character data for {CharacterName}", characterName);
            throw;
        }
    }

    public async Task<CharacterDataResponse> GetCharacterDataWithMappingAsync(string characterName, string ticket, string account)
    {
        // Get character data
        var characterData = await GetCharacterDataAsync(characterName, ticket, account);

        // Get mapping data for human-readable names
        try
        {
            var mapping = await _mappingService.GetMappingAsync();
            
            // Apply human-readable names to the character data
            ApplyMappingToCharacterData(characterData, mapping);
            
            _logger.LogDebug("Applied mapping to character data for {CharacterName}", characterName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to apply mapping to character data for {CharacterName}, using raw data", characterName);
            // Continue with raw data if mapping fails
        }

        return characterData;
    }

    public ProfileData ConvertToProfileData(CharacterDataResponse characterData, MappingResponse? mapping = null)
    {
        var profileData = new ProfileData
        {
            CharacterName = characterData.Name,
            Timestamp = DateTime.UtcNow
        };

        // Convert infotags to profile fields
        foreach (var (key, value) in characterData.Infotags)
        {
            var fieldName = mapping?.Infotags.GetValueOrDefault(key) ?? key;
            profileData.Info[fieldName] = value;
        }

        // Convert kinks to profile fields
        foreach (var (key, value) in characterData.Kinks)
        {
            var kinkName = mapping?.Kinks.GetValueOrDefault(key) ?? key;
            profileData.Info[$"Kink: {kinkName}"] = value;
        }

        // Add custom kinks
        foreach (var customKinkEntry in characterData.CustomKinks)
        {
            var customKink = customKinkEntry.Value;
            profileData.Info[$"Custom Kink: {customKink.Name}"] = $"{customKink.Choice} - {customKink.Description}";
        }

        // Add description
        if (!string.IsNullOrEmpty(characterData.Description))
        {
            profileData.Info["Description"] = characterData.Description;
        }

        // Add view count
        profileData.Info["View Count"] = characterData.ViewCount.ToString();

        // Add images
        if (characterData.Images.Any())
        {
            var imageIds = string.Join(", ", characterData.Images.Select(img => img.ImageId));
            profileData.Info["Images"] = imageIds;
        }

        // Add inlines
        if (characterData.Inlines.Any())
        {
            var inlineHashes = string.Join(", ", characterData.Inlines.Select(inline => inline.Value.Hash));
            profileData.Info["Inlines"] = inlineHashes;
        }

        // Extract gender from profile data
        profileData.ExtractGender();

        _logger.LogDebug("Converted character data to ProfileData for {CharacterName}. Fields: {FieldCount}", 
            characterData.Name, profileData.GetAllFields().Count);

        return profileData;
    }

    private void ApplyMappingToCharacterData(CharacterDataResponse characterData, MappingResponse mapping)
    {
        // Create new dictionaries with human-readable names
        var mappedInfotags = new Dictionary<string, string>();
        var mappedKinks = new Dictionary<string, string>();
        var mappedSubkinks = new Dictionary<string, string>();

        // Map infotags
        foreach (var (key, value) in characterData.Infotags)
        {
            var humanReadableName = mapping.Infotags.GetValueOrDefault(key) ?? key;
            mappedInfotags[humanReadableName] = value;
        }

        // Map kinks
        foreach (var (key, value) in characterData.Kinks)
        {
            var humanReadableName = mapping.Kinks.GetValueOrDefault(key) ?? key;
            mappedKinks[humanReadableName] = value;
        }

        // Replace the original dictionaries
        characterData.Infotags = mappedInfotags;
        characterData.Kinks = mappedKinks;
    }
}
