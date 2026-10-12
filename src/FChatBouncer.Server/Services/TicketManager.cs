namespace FChatBouncer.Server.Services;

/// <summary>
/// Manages temporary FChat tickets for secure reconnection
/// </summary>
public class TicketManager
{
    private readonly Dictionary<string, TicketInfo> _tickets = new();
    private readonly ILogger<TicketManager> _logger;
    private readonly IEncryptionService _encryptionService;

    public TicketManager(ILogger<TicketManager> logger, IEncryptionService encryptionService)
    {
        _logger = logger;
        _encryptionService = encryptionService;
    }

    /// <summary>
    /// Stores a temporary FChat ticket for a user/character combination
    /// </summary>
    public void StoreTicket(string userId, string characterName, string ticket, TimeSpan expiration)
    {
        var key = $"{userId}:{characterName}";
        var ticketInfo = new TicketInfo
        {
            Ticket = _encryptionService.Encrypt(ticket),
            ExpiresAt = DateTime.UtcNow.Add(expiration),
            CharacterName = characterName,
            UserId = userId
        };

        _tickets[key] = ticketInfo;
        _logger.LogDebug("Stored ticket for user {UserId}, character {CharacterName}, expires at {ExpiresAt}", 
            userId, characterName, ticketInfo.ExpiresAt);
    }

    /// <summary>
    /// Retrieves a valid ticket for a user/character combination
    /// </summary>
    public string? GetValidTicket(string userId, string characterName)
    {
        var key = $"{userId}:{characterName}";
        if (_tickets.TryGetValue(key, out var ticketInfo) && ticketInfo.ExpiresAt > DateTime.UtcNow)
        {
            _logger.LogDebug("Retrieved valid ticket for user {UserId}, character {CharacterName}", 
                userId, characterName);
            return _encryptionService.Decrypt(ticketInfo.Ticket);
        }

        // Remove expired ticket
        if (_tickets.ContainsKey(key))
        {
            _tickets.Remove(key);
            _logger.LogDebug("Removed expired ticket for user {UserId}, character {CharacterName}", 
                userId, characterName);
        }

        return null;
    }

    /// <summary>
    /// Removes a ticket for a user/character combination
    /// </summary>
    public void RemoveTicket(string userId, string characterName)
    {
        var key = $"{userId}:{characterName}";
        if (_tickets.Remove(key))
        {
            _logger.LogDebug("Removed ticket for user {UserId}, character {CharacterName}", 
                userId, characterName);
        }
    }

    /// <summary>
    /// Cleans up expired tickets
    /// </summary>
    public void CleanupExpiredTickets()
    {
        var expiredKeys = _tickets
            .Where(kvp => kvp.Value.ExpiresAt <= DateTime.UtcNow)
            .Select(kvp => kvp.Key)
            .ToList();

        foreach (var key in expiredKeys)
        {
            _tickets.Remove(key);
        }

        if (expiredKeys.Count > 0)
        {
            _logger.LogDebug("Cleaned up {Count} expired tickets", expiredKeys.Count);
        }
    }
}

/// <summary>
/// Information about a stored ticket
/// </summary>
public class TicketInfo
{
    public string Ticket { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string CharacterName { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
}

/// <summary>
/// Information about a pending credential request
/// </summary>
public class CredentialRequest
{
    public string RequestId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string CharacterName { get; set; } = string.Empty;
    public DateTime RequestedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    /// <summary>
    /// Indicates whether the previous login attempt failed, so the frontend
    /// should prompt for fresh credentials instead of auto-submitting stored ones.
    /// </summary>
    public bool LastLoginFailed { get; set; }
}
