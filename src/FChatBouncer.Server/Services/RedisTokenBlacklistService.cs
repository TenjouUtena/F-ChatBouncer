using StackExchange.Redis;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Redis-based implementation of token blacklist service
/// </summary>
public class RedisTokenBlacklistService : ITokenBlacklistService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<RedisTokenBlacklistService> _logger;
    private const string BlacklistKeyPrefix = "blacklist:token:";
    
    public RedisTokenBlacklistService(
        IConnectionMultiplexer redis,
        ILogger<RedisTokenBlacklistService> logger)
    {
        _redis = redis;
        _logger = logger;
    }
    
    public async Task BlacklistTokenAsync(string tokenJti, DateTime expiresAt)
    {
        if (string.IsNullOrEmpty(tokenJti))
        {
            throw new ArgumentNullException(nameof(tokenJti));
        }
        
        try
        {
            var db = _redis.GetDatabase();
            var key = GetBlacklistKey(tokenJti);
            
            // Calculate TTL based on token expiration
            var ttl = expiresAt - DateTime.UtcNow;
            if (ttl <= TimeSpan.Zero)
            {
                _logger.LogWarning("Attempted to blacklist already-expired token {TokenJti}", tokenJti);
                return;
            }
            
            // Store token with TTL (value doesn't matter, we just check existence)
            await db.StringSetAsync(key, "blacklisted", ttl);
            
            _logger.LogInformation("Token {TokenJti} blacklisted until {ExpiresAt}", tokenJti, expiresAt);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to blacklist token {TokenJti}", tokenJti);
            throw;
        }
    }
    
    public async Task<bool> IsTokenBlacklistedAsync(string tokenJti)
    {
        if (string.IsNullOrEmpty(tokenJti))
        {
            return false;
        }
        
        try
        {
            var db = _redis.GetDatabase();
            var key = GetBlacklistKey(tokenJti);
            
            var exists = await db.KeyExistsAsync(key);
            
            if (exists)
            {
                _logger.LogWarning("Blocked blacklisted token {TokenJti}", tokenJti);
            }
            
            return exists;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check token blacklist status for {TokenJti}", tokenJti);
            // Fail open: if Redis is down, allow the request (rely on token expiration)
            return false;
        }
    }
    
    public async Task RemoveFromBlacklistAsync(string tokenJti)
    {
        if (string.IsNullOrEmpty(tokenJti))
        {
            throw new ArgumentNullException(nameof(tokenJti));
        }
        
        try
        {
            var db = _redis.GetDatabase();
            var key = GetBlacklistKey(tokenJti);
            
            await db.KeyDeleteAsync(key);
            
            _logger.LogInformation("Token {TokenJti} removed from blacklist", tokenJti);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove token {TokenJti} from blacklist", tokenJti);
            throw;
        }
    }
    
    private static string GetBlacklistKey(string tokenJti)
    {
        return $"{BlacklistKeyPrefix}{tokenJti}";
    }
}

