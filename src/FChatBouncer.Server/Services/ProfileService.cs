using FChatBouncer.Server.Data;
using FChatBouncer.Server.Hubs;
using FChatBouncer.Server.Models;
using Microsoft.AspNetCore.SignalR;
using System.Security.Cryptography;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Reads cached profiles from the Characters table and queues F-List fetches when they are
/// missing or stale. FetchAndStoreAsync is the only code path that writes ProfileJson.
/// </summary>
public class ProfileService : IProfileService
{
    private readonly BouncerDbContext _context;
    private readonly ICharacterService _characterService;
    private readonly IUserService _userService;
    private readonly IFListCharacterDataService _characterDataService;
    private readonly IEncryptionService _encryptionService;
    private readonly IProfileFetchQueue _fetchQueue;
    private readonly IHubContext<BouncerHub> _hubContext;
    private readonly ILogger<ProfileService> _logger;
    private readonly TimeSpan _staleAfter;

    public ProfileService(
        BouncerDbContext context,
        ICharacterService characterService,
        IUserService userService,
        IFListCharacterDataService characterDataService,
        IEncryptionService encryptionService,
        IProfileFetchQueue fetchQueue,
        IHubContext<BouncerHub> hubContext,
        IConfiguration configuration,
        ILogger<ProfileService> logger)
    {
        _context = context;
        _characterService = characterService;
        _userService = userService;
        _characterDataService = characterDataService;
        _encryptionService = encryptionService;
        _fetchQueue = fetchQueue;
        _hubContext = hubContext;
        _logger = logger;
        _staleAfter = configuration.GetValue<TimeSpan?>("ProfileStaleAfter") ?? TimeSpan.FromHours(24);
    }

    public async Task<(ProfileData? Profile, DateTime? FetchedAt, bool IsStale, bool RefreshQueued)> GetAsync(string userId, string characterName, bool queueIfStale = true)
    {
        var character = await _characterService.GetCharacterAsync(characterName);

        if (character?.ProfileJson is null)
        {
            var queued = _fetchQueue.TryEnqueue(new ProfileFetchRequest(userId, characterName, ProfilePriority.High));
            return (null, null, true, queued);
        }

        var isStale = character.ProfileFetchedAt is null || DateTime.UtcNow - character.ProfileFetchedAt > _staleAfter;
        var refreshQueued = isStale && queueIfStale &&
            _fetchQueue.TryEnqueue(new ProfileFetchRequest(userId, characterName, ProfilePriority.Normal));

        return (character.Profile, character.ProfileFetchedAt, isStale, refreshQueued);
    }

    public Task<bool> RequestRefreshAsync(string userId, string characterName)
    {
        var queued = _fetchQueue.TryEnqueue(new ProfileFetchRequest(userId, characterName, ProfilePriority.High));
        return Task.FromResult(queued);
    }

    public async Task FetchAndStoreAsync(string userId, string characterName, CancellationToken ct)
    {
        var settings = await _userService.GetUserSettingsAsync(userId);
        if (settings?.FChatCredentialsEncrypted == null)
        {
            _logger.LogWarning("No F-Chat credentials for user {UserId}; cannot fetch profile for {CharacterName}", userId, characterName);
            return;
        }

        string account, password;
        try
        {
            (account, password) = _encryptionService.DecryptCredentials(settings.FChatCredentialsEncrypted);
        }
        catch (CryptographicException ex)
        {
            _logger.LogError(ex, "Failed to decrypt F-Chat credentials for user {UserId}", userId);
            return;
        }

        ct.ThrowIfCancellationRequested();

        _logger.LogInformation("Fetching profile for {CharacterName} from F-List (User: {UserId})", characterName, userId);
        var characterData = await _characterDataService.GetCharacterDataWithMappingAndTicketRenewalAsync(characterName, account, password);
        var profile = _characterDataService.ConvertToProfileData(characterData);

        // Shares the scoped DbContext with CharacterService, so the tracked row is saved here
        var character = await _characterService.GetOrCreateCharacterAsync(characterName);
        character.Profile = profile;
        character.ProfileFetchedAt = DateTime.UtcNow;
        if (!string.IsNullOrEmpty(profile.Gender) && profile.Gender != "None")
        {
            character.Gender = profile.Gender;
        }
        await _context.SaveChangesAsync(ct);

        await NotifyProfileAvailableAsync(userId, characterName);
    }

    public async Task NotifyProfileAvailableAsync(string userId, string characterName)
    {
        if (string.IsNullOrEmpty(characterName))
        {
            _logger.LogWarning("Attempted to notify frontend with null or empty character name (User: {UserId})", userId);
            return;
        }

        try
        {
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("ProfileAvailable", new
            {
                CharacterName = characterName,
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to notify frontend about available profile for character {CharacterName} (User: {UserId})", characterName, userId);
        }
    }
}
