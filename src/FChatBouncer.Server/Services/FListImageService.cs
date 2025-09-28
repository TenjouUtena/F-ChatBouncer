using System.Text.Json;
using System.Text.Json.Serialization;
using FChatBouncer.Server.Models;
using Microsoft.Extensions.Logging;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for fetching character image metadata from F-List API
/// </summary>
public class FListImageService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<FListImageService> _logger;

    public FListImageService(HttpClient httpClient, ILogger<FListImageService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    /// <summary>
    /// Fetch image metadata for a character from F-List profile-images API
    /// </summary>
    /// <param name="characterId">The character ID</param>
    /// <returns>List of image metadata, or empty list if failed</returns>
    public async Task<List<CharacterImage>> GetCharacterImagesAsync(int characterId)
    {
        try
        {
            _logger.LogInformation("Fetching image metadata for character ID: {CharacterId}", characterId);

            var formData = new List<KeyValuePair<string, string>>
            {
                new("character_id", characterId.ToString())
            };

            var formContent = new FormUrlEncodedContent(formData);
            
            var response = await _httpClient.PostAsync("https://www.f-list.net/json/profile-images.json", formContent);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch image metadata for character ID {CharacterId}. Status: {StatusCode}", 
                    characterId, response.StatusCode);
                return new List<CharacterImage>();
            }

            var jsonContent = await response.Content.ReadAsStringAsync();
            _logger.LogInformation("IMAGETROUBLESHOOT: Image API response: {jsonContent}", jsonContent);
            var imageResponse = JsonSerializer.Deserialize<ImageResponse>(jsonContent);

            if (imageResponse == null || !string.IsNullOrEmpty(imageResponse.Error))
            {
                _logger.LogWarning("Image API returned error for character ID {CharacterId}: {Error}", 
                    characterId, imageResponse?.Error ?? "Unknown error");
                return new List<CharacterImage>();
            }

            _logger.LogInformation("Successfully fetched {ImageCount} images for character ID {CharacterId}", 
                imageResponse.Images.Count, characterId);

            return imageResponse.Images;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching image metadata for character ID {CharacterId}", characterId);
            return new List<CharacterImage>();
        }
    }
}

/// <summary>
/// Response model for F-List profile-images.json API
/// </summary>
public class ImageResponse
{
    [JsonPropertyName("images")]
    public List<CharacterImage> Images { get; set; } = new();

    [JsonPropertyName("error")]
    public string? Error { get; set; }
}
