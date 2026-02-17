using System.Security.Cryptography;
using System.Text;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Manages temporary FChat tickets for secure reconnection
/// </summary>
public class TicketManager
{
    private readonly Dictionary<string, TicketInfo> _tickets = new();
    private readonly ILogger<TicketManager> _logger;
    private readonly string _encryptionKey;

    public TicketManager(ILogger<TicketManager> logger, IConfiguration configuration)
    {
        _logger = logger;
        _encryptionKey = configuration["CREDENTIAL_ENCRYPTION_KEY"]
            ?? Environment.GetEnvironmentVariable("CREDENTIAL_ENCRYPTION_KEY")
            ?? throw new InvalidOperationException(
                "CREDENTIAL_ENCRYPTION_KEY not configured. Set the environment variable or add it to configuration.");
    }

    /// <summary>
    /// Stores a temporary FChat ticket for a user/character combination
    /// </summary>
    public void StoreTicket(string userId, string characterName, string ticket, TimeSpan expiration)
    {
        var key = $"{userId}:{characterName}";
        var ticketInfo = new TicketInfo
        {
            Ticket = EncryptTicket(ticket),
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
            return DecryptTicket(ticketInfo.Ticket);
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

    /// <summary>
    /// Encrypts a ticket for storage
    /// </summary>
    private string EncryptTicket(string ticket)
    {
        try
        {
            using var aes = Aes.Create();
            aes.Key = Encoding.UTF8.GetBytes(_encryptionKey.PadRight(32).Substring(0, 32));
            aes.IV = new byte[16]; // Simple IV for this use case

            using var encryptor = aes.CreateEncryptor();
            var ticketBytes = Encoding.UTF8.GetBytes(ticket);
            var encryptedBytes = encryptor.TransformFinalBlock(ticketBytes, 0, ticketBytes.Length);

            return Convert.ToBase64String(encryptedBytes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to encrypt ticket");
            throw;
        }
    }

    /// <summary>
    /// Decrypts a stored ticket
    /// </summary>
    private string DecryptTicket(string encryptedTicket)
    {
        try
        {
            using var aes = Aes.Create();
            aes.Key = Encoding.UTF8.GetBytes(_encryptionKey.PadRight(32).Substring(0, 32));
            aes.IV = new byte[16]; // Simple IV for this use case

            using var decryptor = aes.CreateDecryptor();
            var encryptedBytes = Convert.FromBase64String(encryptedTicket);
            var decryptedBytes = decryptor.TransformFinalBlock(encryptedBytes, 0, encryptedBytes.Length);

            return Encoding.UTF8.GetString(decryptedBytes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decrypt ticket");
            throw;
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
}
