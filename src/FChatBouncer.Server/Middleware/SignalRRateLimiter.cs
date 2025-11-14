using Microsoft.AspNetCore.SignalR;
using StackExchange.Redis;
using System.Collections.Concurrent;

namespace FChatBouncer.Server.Middleware;

/// <summary>
/// Rate limiter for SignalR hub methods using Redis for distributed state
/// </summary>
public class SignalRRateLimiter
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<SignalRRateLimiter> _logger;
    private readonly ConcurrentDictionary<string, RateLimitConfig> _configs;
    
    public SignalRRateLimiter(IConnectionMultiplexer redis, ILogger<SignalRRateLimiter> logger)
    {
        _redis = redis;
        _logger = logger;
        _configs = new ConcurrentDictionary<string, RateLimitConfig>();
        
        // Configure rate limits for different hub methods
        _configs.TryAdd("SendMessage", new RateLimitConfig { Limit = 30, WindowSeconds = 60 });
        _configs.TryAdd("SendMessageFromCharacter", new RateLimitConfig { Limit = 30, WindowSeconds = 60 });
        _configs.TryAdd("RequestProfile", new RateLimitConfig { Limit = 10, WindowSeconds = 60 });
        _configs.TryAdd("JoinChannelForCharacter", new RateLimitConfig { Limit = 20, WindowSeconds = 60 });
        _configs.TryAdd("RefreshChannelCharacters", new RateLimitConfig { Limit = 5, WindowSeconds = 60 });
    }
    
    /// <summary>
    /// Check if a request is allowed under rate limiting
    /// </summary>
    /// <param name="userId">User ID</param>
    /// <param name="methodName">Hub method name</param>
    /// <param name="key">Optional additional key (e.g., character name)</param>
    /// <returns>True if request is allowed, false if rate limit exceeded</returns>
    public async Task<(bool Allowed, int Remaining, int ResetSeconds)> CheckRateLimitAsync(
        string userId, 
        string methodName, 
        string? key = null)
    {
        if (!_configs.TryGetValue(methodName, out var config))
        {
            // No rate limit configured for this method
            return (true, -1, 0);
        }
        
        try
        {
            var db = _redis.GetDatabase();
            var redisKey = $"ratelimit:signalr:{userId}:{methodName}";
            if (!string.IsNullOrEmpty(key))
            {
                redisKey += $":{key}";
            }
            
            // Get current window
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var windowStart = now - (now % config.WindowSeconds);
            var windowKey = $"{redisKey}:{windowStart}";
            
            // Increment counter
            var count = await db.StringIncrementAsync(windowKey);
            
            // Set expiration on first increment
            if (count == 1)
            {
                await db.KeyExpireAsync(windowKey, TimeSpan.FromSeconds(config.WindowSeconds * 2));
            }
            
            var remaining = Math.Max(0, config.Limit - (int)count);
            var resetSeconds = config.WindowSeconds - (int)(now % config.WindowSeconds);
            
            if (count > config.Limit)
            {
                _logger.LogWarning(
                    "Rate limit exceeded for user {UserId}, method {MethodName}, key {Key}. Count: {Count}, Limit: {Limit}",
                    userId, methodName, key, count, config.Limit);
                return (false, 0, resetSeconds);
            }
            
            return (true, remaining, resetSeconds);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking rate limit for user {UserId}, method {MethodName}", userId, methodName);
            // Allow request if Redis fails (fail open)
            return (true, -1, 0);
        }
    }
    
    /// <summary>
    /// Get rate limit status without incrementing counter
    /// </summary>
    public async Task<(int Current, int Limit, int ResetSeconds)> GetRateLimitStatusAsync(
        string userId,
        string methodName,
        string? key = null)
    {
        if (!_configs.TryGetValue(methodName, out var config))
        {
            return (0, -1, 0);
        }
        
        try
        {
            var db = _redis.GetDatabase();
            var redisKey = $"ratelimit:signalr:{userId}:{methodName}";
            if (!string.IsNullOrEmpty(key))
            {
                redisKey += $":{key}";
            }
            
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var windowStart = now - (now % config.WindowSeconds);
            var windowKey = $"{redisKey}:{windowStart}";
            
            var count = (int)(await db.StringGetAsync(windowKey));
            var resetSeconds = config.WindowSeconds - (int)(now % config.WindowSeconds);
            
            return (count, config.Limit, resetSeconds);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting rate limit status for user {UserId}, method {MethodName}", userId, methodName);
            return (0, -1, 0);
        }
    }
}

/// <summary>
/// Rate limit configuration for a specific method
/// </summary>
public class RateLimitConfig
{
    public int Limit { get; set; }
    public int WindowSeconds { get; set; }
}

