using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace FChatBouncer.Server.Services;

public class MemoService : IMemoService
{
    private readonly BouncerDbContext _context;
    private readonly IUserService _userService;
    private readonly ICharacterService _characterService;
    private readonly ILogger<MemoService> _logger;
    private readonly HttpClient _httpClient;
    private readonly IEncryptionService _encryptionService;

    public MemoService(
        BouncerDbContext context,
        IUserService userService,
        ICharacterService characterService,
        ILogger<MemoService> logger,
        HttpClient httpClient,
        IEncryptionService encryptionService)
    {
        _context = context;
        _userService = userService;
        _characterService = characterService;
        _logger = logger;
        _httpClient = httpClient;
        _encryptionService = encryptionService;
    }

    public async Task<MemoData?> GetMemoAsync(string userId, string characterName)
    {
        return null;
#pragma warning disable CS0162 // Unreachable code detected
        try
        {
            // Get user settings to retrieve F-Chat credentials
            var settings = await _userService.GetUserSettingsAsync(userId);
            if (settings?.FChatCredentialsEncrypted == null)
            {
                _logger.LogWarning("No F-Chat credentials found for user {UserId}, cannot fetch memo", userId);
                return null;
            }

            // Decrypt F-Chat credentials using AES-256-GCM
            string username, password;
            try
            {
                (username, password) = _encryptionService.DecryptCredentials(settings.FChatCredentialsEncrypted);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to decrypt F-Chat credentials for user {UserId}. Credentials may be in old format.", userId);
                return null;
            }

            // Create HTTP request to F-List memo API
            var request = new HttpRequestMessage(HttpMethod.Get, 
                $"https://www.f-list.net/json/character-memo-get.json?target={Uri.EscapeDataString(characterName)}");

            // Add authentication cookies (we'll need to get session cookies first)
            var sessionCookies = await GetSessionCookiesAsync(username, password);
            if (sessionCookies == null)
            {
                _logger.LogWarning("Failed to get session cookies for user {UserId}", userId);
                return null;
            }

            request.Headers.Add("Cookie", sessionCookies);

            _logger.LogDebug("Fetching memo for character {CharacterName} from F-List API", characterName);

            var response = await _httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("F-List memo API returned non-success status: {StatusCode} for character {CharacterName}", 
                    response.StatusCode, characterName);
                return null;
            }

            var memoData = JsonSerializer.Deserialize<MemoData>(content);
            if (memoData?.Error != null && !string.IsNullOrEmpty(memoData.Error))
            {
                _logger.LogWarning("F-List memo API returned error for character {CharacterName}: {Error}", 
                    characterName, memoData.Error);
                return null;
            }

            _logger.LogDebug("Successfully fetched memo for character {CharacterName}: {Memo}", 
                characterName, memoData?.Note ?? "No memo");

            return memoData;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch memo for character {CharacterName} (User: {UserId})", 
                characterName, userId);
            return null;
        }
#pragma warning restore CS0162 // Unreachable code detected
    }

    public async Task UpdateMemoAsync(string userId, string characterName, string? memo)
    {
        try
        {
            // Update the character's memo in the database
            var character = await _characterService.GetOrCreateCharacterAsync(characterName);
            character.Memo = memo;
            character.MemoLastUpdated = DateTime.UtcNow;
            
            // Save changes to the database
            await _context.SaveChangesAsync();
            
            _logger.LogInformation("Updated memo for character {CharacterName} (User: {UserId}): {Memo}", 
                characterName, userId, memo ?? "No memo");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update memo for character {CharacterName} (User: {UserId})", 
                characterName, userId);
            throw;
        }
    }

    public async Task RefreshMemoAsync(string userId, string characterName)
    {
        try
        {
            var memoData = await GetMemoAsync(userId, characterName);
            await UpdateMemoAsync(userId, characterName, memoData?.Note);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh memo for character {CharacterName} (User: {UserId})", 
                characterName, userId);
            throw;
        }
    }

    private async Task<string?> GetSessionCookiesAsync(string username, string password)
    {
        try
        {
            // First, we need to authenticate with F-List to get session cookies
            var loginData = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("account", username),
                new KeyValuePair<string, string>("password", password)
            });

            var loginResponse = await _httpClient.PostAsync("https://www.f-list.net/json/getApiTicket.php", loginData);
            var loginContent = await loginResponse.Content.ReadAsStringAsync();

            if (!loginResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to authenticate with F-List for session cookies");
                return null;
            }

            var loginResult = JsonSerializer.Deserialize<JsonElement>(loginContent);
            if (loginResult.TryGetProperty("error", out var errorElement) && 
                !string.IsNullOrEmpty(errorElement.GetString()))
            {
                _logger.LogWarning("F-List authentication failed for session cookies: {Error}", 
                    errorElement.GetString());
                return null;
            }

            // Extract cookies from the response headers
            if (loginResponse.Headers.TryGetValues("Set-Cookie", out var cookies))
            {
                var cookieString = string.Join("; ", cookies);
                _logger.LogDebug("Retrieved session cookies for F-List API");
                return cookieString;
            }

            _logger.LogWarning("No session cookies found in F-List authentication response");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get session cookies from F-List");
            return null;
        }
    }
}
