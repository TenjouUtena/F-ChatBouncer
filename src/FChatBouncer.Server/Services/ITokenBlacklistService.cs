namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for managing blacklisted JWT tokens in Redis
/// </summary>
public interface ITokenBlacklistService
{
    /// <summary>
    /// Add a token to the blacklist
    /// </summary>
    /// <param name="tokenJti">JWT Token ID (jti claim)</param>
    /// <param name="expiresAt">When the token expires (TTL for Redis key)</param>
    Task BlacklistTokenAsync(string tokenJti, DateTime expiresAt);
    
    /// <summary>
    /// Check if a token is blacklisted
    /// </summary>
    /// <param name="tokenJti">JWT Token ID (jti claim)</param>
    /// <returns>True if token is blacklisted, false otherwise</returns>
    Task<bool> IsTokenBlacklistedAsync(string tokenJti);
    
    /// <summary>
    /// Remove a token from the blacklist (for testing/admin purposes)
    /// </summary>
    /// <param name="tokenJti">JWT Token ID (jti claim)</param>
    Task RemoveFromBlacklistAsync(string tokenJti);
}

