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
    private readonly IFListTicketManager _ticketManager;
    private readonly FListImageService _imageService;
    private readonly ILogger<FListCharacterDataService> _logger;

    public FListCharacterDataService(
        HttpClient httpClient, 
        IFListMappingService mappingService,
        IFListTicketManager ticketManager,
        FListImageService imageService,
        ILogger<FListCharacterDataService> logger)
    {
        _httpClient = httpClient;
        _mappingService = mappingService;
        _ticketManager = ticketManager;
        _imageService = imageService;
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

            CharacterDataResponse? characterData;
            try
            {
                characterData = JsonSerializer.Deserialize<CharacterDataResponse>(content, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to deserialize character data for {CharacterName}. Content: {Content}", characterName, content);
                
                // Try to extract basic information from the JSON even if deserialization fails
                try
                {
                    using var doc = JsonDocument.Parse(content);
                    var name = doc.RootElement.GetProperty("name").GetString() ?? characterName;
                    _logger.LogWarning("JSON deserialization failed for {CharacterName}, but basic data extraction succeeded", name);
                    
                    // Return a minimal response with basic info
                    return new CharacterDataResponse
                    {
                        Name = name,
                        Id = doc.RootElement.TryGetProperty("id", out var idElement) ? idElement.GetInt32() : 0,
                        Description = doc.RootElement.TryGetProperty("description", out var descElement) ? descElement.GetString() ?? "" : "",
                        ViewCount = doc.RootElement.TryGetProperty("views", out var viewsElement) ? viewsElement.GetInt32() : 0,
                        Infotags = new Dictionary<string, string>(),
                        Kinks = new Dictionary<string, string>(),
                        CustomKinks = new Dictionary<string, CustomKink>(),
                        Images = new List<CharacterImage>(),
                        Inlines = new Dictionary<string, CharacterInline>()
                    };
                }
                catch (JsonException fallbackEx)
                {
                    _logger.LogError(fallbackEx, "Complete JSON parsing failure for {CharacterName}. Raw content: {Content}", characterName, content);
                    throw new InvalidOperationException($"Failed to parse character data JSON for {characterName}: {ex.Message}", ex);
                }
            }

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

            _logger.LogInformation("Successfully fetched character data for {CharacterName}. ID: {Id}, ViewCount: {ViewCount}, Infotags: {InfotagCount}, Kinks: {KinkCount}, Images: {ImageCount}",
                characterName, characterData.Id, characterData.ViewCount, characterData.Infotags.Count, characterData.Kinks.Count, characterData.Images.Count);

            // Fetch detailed image metadata from F-List profile-images API
            try
            {
                var detailedImages = await _imageService.GetCharacterImagesAsync(characterData.Id);
                if (detailedImages.Any())
                {
                    characterData.Images = detailedImages;
                    _logger.LogInformation("Updated {ImageCount} images with detailed metadata for {CharacterName}", 
                        detailedImages.Count, characterName);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to fetch detailed image metadata for {CharacterName}, using basic image data", characterName);
                // Continue with basic image data if detailed fetch fails
            }

            return characterData;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get character data for {CharacterName}", characterName);
            throw;
        }
    }

    /// <summary>
    /// Gets character data with automatic ticket renewal on expiration
    /// </summary>
    public async Task<CharacterDataResponse> GetCharacterDataWithTicketRenewalAsync(string characterName, string account, string password)
    {
        try
        {
            // Get a valid ticket (will be renewed if expired)
            var ticket = await _ticketManager.GetValidTicketAsync(account, password);
            if (string.IsNullOrEmpty(ticket))
            {
                throw new InvalidOperationException("Failed to obtain valid F-List API ticket");
            }

            // Try to get character data with the ticket
            try
            {
                return await GetCharacterDataAsync(characterName, ticket, account);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("ticket has expired") || ex.Message.Contains("no ticket requested") || ex.Message.Contains("Invalid ticket"))
            {
                _logger.LogWarning("Ticket expired for {CharacterName}, clearing and retrying with new ticket", characterName);
                
                // Clear the expired ticket and get a new one
                _ticketManager.ClearTicket(account);
                ticket = await _ticketManager.GetValidTicketAsync(account, password);
                
                if (string.IsNullOrEmpty(ticket))
                {
                    throw new InvalidOperationException("Failed to obtain new F-List API ticket after expiration");
                }

                // Retry with the new ticket
                return await GetCharacterDataAsync(characterName, ticket, account);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get character data with ticket renewal for {CharacterName}", characterName);
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
            
            _logger.LogInformation("Applied mapping to character data for {CharacterName}", characterName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to apply mapping to character data for {CharacterName}, using raw data", characterName);
            // Continue with raw data if mapping fails
        }

        return characterData;
    }

    /// <summary>
    /// Gets character data with mapping and automatic ticket renewal on expiration
    /// </summary>
    public async Task<CharacterDataResponse> GetCharacterDataWithMappingAndTicketRenewalAsync(string characterName, string account, string password)
    {
        // Get character data with ticket renewal
        var characterData = await GetCharacterDataWithTicketRenewalAsync(characterName, account, password);

        // Get mapping data for human-readable names
        try
        {
            var mapping = await _mappingService.GetMappingAsync();
            
            // Apply human-readable names to the character data
            ApplyMappingToCharacterData(characterData, mapping);
            
            _logger.LogInformation("Applied mapping to character data for {CharacterName}", characterName);
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
        _logger.LogInformation("=== ConvertToProfileData START for {CharacterName} ===", characterData.Name);
        _logger.LogInformation("Input characterData has {ImageCount} images", characterData.Images.Count);
        
        var profileData = new ProfileData
        {
            CharacterName = characterData.Name,
            Description = characterData.Description ?? string.Empty,
            Timestamp = DateTime.UtcNow
        };

        // Convert infotags to profile fields (non-kink data)
        foreach (var (key, value) in characterData.Infotags)
        {
            var infotag = mapping?.GetInfotagById(key);
            var fieldName = infotag?.Name ?? key;
            profileData.Info[fieldName] = value;
        }

        // Convert kinks to structured kink list
        foreach (var (key, value) in characterData.Kinks)
        {
            var kink = mapping?.GetKinkById(key);
            var kinkInfo = new KinkInfo
            {
                KinkId = key,
                KinkName = kink?.Name ?? key,
                KinkPreference = value,
                IsCustom = false
            };
            profileData.Kinks.Add(kinkInfo);
        }

        // Add custom kinks
        foreach (var customKinkEntry in characterData.CustomKinks)
        {
            var customKink = customKinkEntry.Value;
            var kinkInfo = new KinkInfo
            {
                KinkId = customKinkEntry.Key,
                KinkName = customKink.Name,
                KinkPreference = customKink.Choice,
                IsCustom = true
            };
            profileData.Kinks.Add(kinkInfo);
        }


        // Add view count
        profileData.Info["View Count"] = characterData.ViewCount.ToString();

        // Add images with detailed metadata
        _logger.LogInformation("Processing {ImageCount} images for {CharacterName}", characterData.Images.Count, characterData.Name);
        if (characterData.Images.Any())
        {
            var imageIds = string.Join(", ", characterData.Images.Select(img => img.ImageId));
            profileData.Info["Images"] = imageIds;
            
            // Add detailed image information for frontend
            foreach (var image in characterData.Images)
            {
                var imageKey = $"Image_{image.ImageId}";
                var imageInfo = $"{image.ImageId}.{image.Extension}|{image.Width}x{image.Height}";
                if (!string.IsNullOrEmpty(image.Description))
                {
                    imageInfo += $"|{image.Description}";
                }
                profileData.Info[imageKey] = imageInfo;
            }

            // Populate the new images array with structured data
            foreach (var image in characterData.Images)
            {
                profileData.Images.Add(new ProfileImage
                {
                    ImageId = image.ImageId,
                    ImageExt = image.Extension,
                    ImageDescription = image.Description
                });
                _logger.LogInformation("Added image {ImageId}.{Extension} to ProfileData for {CharacterName}", 
                    image.ImageId, image.Extension, characterData.Name);
            }
            _logger.LogInformation("Added {ImageCount} images to ProfileData for {CharacterName}", profileData.Images.Count, characterData.Name);
        }
        else
        {
            _logger.LogInformation("No images found for {CharacterName}", characterData.Name);
        }

        // Add inlines
        if (characterData.Inlines.Any())
        {
            var inlineHashes = string.Join(", ", characterData.Inlines.Select(inline => inline.Value.Hash));
            profileData.Info["Inlines"] = inlineHashes;
        }

        // Extract gender from profile data
        profileData.ExtractGender();

        _logger.LogInformation("=== ConvertToProfileData END for {CharacterName} ===", characterData.Name);
        _logger.LogInformation("Final ProfileData has {ImageCount} images, {InfoCount} info fields, {KinkCount} kinks", 
            profileData.Images.Count, profileData.Info.Count, profileData.Kinks.Count);

        return profileData;
    }

    private void ApplyMappingToCharacterData(CharacterDataResponse characterData, MappingResponse mapping)
    {
        _logger.LogInformation("Applying mapping to character data for {CharacterName}. Original infotags: {InfotagCount}, kinks: {KinkCount}", 
            characterData.Name, characterData.Infotags.Count, characterData.Kinks.Count);

        // Create new dictionaries with human-readable names
        var mappedInfotags = new Dictionary<string, string>();
        var mappedKinks = new Dictionary<string, string>();
        var mappedSubkinks = new Dictionary<string, string>();

        // Map infotags
        foreach (var (key, value) in characterData.Infotags)
        {
            var infotag = mapping.GetInfotagById(key);
            var humanReadableName = infotag?.Name ?? key;
            
            // Map the value if it's numeric
            var mappedValue = value;
            if (!string.IsNullOrEmpty(value) && System.Text.RegularExpressions.Regex.IsMatch(value, @"^\d+$"))
            {
                var mappedValueById = mapping.GetInfotagValueById(value);
                if (!string.IsNullOrEmpty(mappedValueById))
                {
                    mappedValue = mappedValueById;
                    _logger.LogInformation("Mapped infotag value {InfotagId} -> {InfotagName}: {OriginalValue} -> {MappedValue}", key, humanReadableName, value, mappedValue);
                }
                else
                {
                    _logger.LogInformation("No value mapping found for infotag {InfotagId} -> {InfotagName}, value: {Value}", key, humanReadableName, value);
                }
            }
            
            mappedInfotags[humanReadableName] = mappedValue;
            
            if (infotag == null)
            {
                _logger.LogInformation("No mapping found for infotag ID: {InfotagId}, using raw key", key);
            }
            else
            {
                _logger.LogInformation("Mapped infotag {InfotagId} -> {InfotagName}", key, humanReadableName);
            }
        }

        // Map kinks
        foreach (var (key, value) in characterData.Kinks)
        {
            var kink = mapping.GetKinkById(key);
            var humanReadableName = kink?.Name ?? key;
            mappedKinks[humanReadableName] = value;
            
            if (kink == null)
            {
                _logger.LogInformation("No mapping found for kink ID: {KinkId}, using raw key", key);
            }
            else
            {
                _logger.LogInformation("Mapped kink {KinkId} -> {KinkName}", key, humanReadableName);
            }
        }

        // Replace the original dictionaries
        characterData.Infotags = mappedInfotags;
        characterData.Kinks = mappedKinks;
        
        _logger.LogInformation("Applied mapping to character data for {CharacterName}. Mapped infotags: {InfotagCount}, kinks: {KinkCount}", 
            characterData.Name, characterData.Infotags.Count, characterData.Kinks.Count);
    }
}
