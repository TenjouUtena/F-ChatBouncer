using System.Collections.Concurrent;
using FChatBouncer.Server.Services;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Rate limiter for profile requests to prevent spam to F-List
/// </summary>
public interface IProfileRateLimiter
{
    /// <summary>
    /// Check if a profile request is allowed for the given user and character
    /// </summary>
    /// <param name="userId">User ID</param>
    /// <param name="characterName">Character name</param>
    /// <returns>True if request is allowed, false if rate limited</returns>
    Task<bool> IsRequestAllowedAsync(string userId, string characterName);
    
    /// <summary>
    /// Record a profile request attempt
    /// </summary>
    /// <param name="userId">User ID</param>
    /// <param name="characterName">Character name</param>
    void RecordRequest(string userId, string characterName);
    
    /// <summary>
    /// Get the time until the next request is allowed
    /// </summary>
    /// <param name="userId">User ID</param>
    /// <param name="characterName">Character name</param>
    /// <returns>TimeSpan until next request is allowed, or TimeSpan.Zero if allowed now</returns>
    TimeSpan GetTimeUntilNextRequest(string userId, string characterName);
}

/// <summary>
/// In-memory rate limiter for profile requests
/// </summary>
public class ProfileRateLimiter : IProfileRateLimiter
{
    private readonly ILogger<ProfileRateLimiter> _logger;
    private readonly ConcurrentDictionary<string, RequestRecord> _requestHistory = new();
    
    // Rate limiting configuration
    private static readonly TimeSpan RequestWindow = TimeSpan.FromMinutes(5); // 5-minute window
    private static readonly int MaxRequestsPerWindow = 3; // Max 3 requests per 5 minutes per character
    private static readonly TimeSpan MinTimeBetweenRequests = TimeSpan.FromSeconds(30); // Minimum 30 seconds between requests for same character
    
    public ProfileRateLimiter(ILogger<ProfileRateLimiter> logger)
    {
        _logger = logger;
        
        // Clean up old entries periodically
        _ = Task.Run(CleanupOldEntries);
    }
    
    public Task<bool> IsRequestAllowedAsync(string userId, string characterName)
    {
        var key = $"{userId}:{characterName}";
        var now = DateTime.UtcNow;
        
        if (!_requestHistory.TryGetValue(key, out var record))
        {
            return Task.FromResult(true); // No previous requests
        }
        
        // Check minimum time between requests
        if (now - record.LastRequestTime < MinTimeBetweenRequests)
        {
            _logger.LogWarning("Profile request rate limited for {CharacterName} (User: {UserId}) - too soon after last request", 
                characterName, userId);
            return Task.FromResult(false);
        }
        
        // Check requests within the window
        var requestsInWindow = record.RequestTimes.Count(t => now - t < RequestWindow);
        if (requestsInWindow >= MaxRequestsPerWindow)
        {
            _logger.LogWarning("Profile request rate limited for {CharacterName} (User: {UserId}) - exceeded {MaxRequests} requests in {WindowMinutes} minutes", 
                characterName, userId, MaxRequestsPerWindow, RequestWindow.TotalMinutes);
            return Task.FromResult(false);
        }
        
        return Task.FromResult(true);
    }
    
    public void RecordRequest(string userId, string characterName)
    {
        var key = $"{userId}:{characterName}";
        var now = DateTime.UtcNow;
        
        _requestHistory.AddOrUpdate(key, 
            new RequestRecord { LastRequestTime = now, RequestTimes = new List<DateTime> { now } },
            (_, existing) =>
            {
                existing.LastRequestTime = now;
                existing.RequestTimes.Add(now);
                
                // Keep only requests within the window
                existing.RequestTimes.RemoveAll(t => now - t >= RequestWindow);
                
                return existing;
            });
        
        _logger.LogDebug("Recorded profile request for {CharacterName} (User: {UserId})", characterName, userId);
    }
    
    public TimeSpan GetTimeUntilNextRequest(string userId, string characterName)
    {
        var key = $"{userId}:{characterName}";
        
        if (!_requestHistory.TryGetValue(key, out var record))
        {
            return TimeSpan.Zero;
        }
        
        var now = DateTime.UtcNow;
        
        // Check minimum time between requests
        var timeSinceLastRequest = now - record.LastRequestTime;
        if (timeSinceLastRequest < MinTimeBetweenRequests)
        {
            return MinTimeBetweenRequests - timeSinceLastRequest;
        }
        
        // Check requests within the window
        var requestsInWindow = record.RequestTimes.Count(t => now - t < RequestWindow);
        if (requestsInWindow >= MaxRequestsPerWindow)
        {
            var oldestRequestInWindow = record.RequestTimes.Where(t => now - t < RequestWindow).Min();
            return RequestWindow - (now - oldestRequestInWindow);
        }
        
        return TimeSpan.Zero;
    }
    
    private async Task CleanupOldEntries()
    {
        while (true)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(10)); // Clean up every 10 minutes
                
                var cutoff = DateTime.UtcNow - RequestWindow;
                var keysToRemove = new List<string>();
                
                foreach (var kvp in _requestHistory)
                {
                    var record = kvp.Value;
                    record.RequestTimes.RemoveAll(t => t < cutoff);
                    
                    if (record.RequestTimes.Count == 0 && record.LastRequestTime < cutoff)
                    {
                        keysToRemove.Add(kvp.Key);
                    }
                }
                
                foreach (var key in keysToRemove)
                {
                    _requestHistory.TryRemove(key, out _);
                }
                
                if (keysToRemove.Count > 0)
                {
                    _logger.LogDebug("Cleaned up {Count} old rate limit entries", keysToRemove.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during rate limiter cleanup");
            }
        }
    }
    
    private class RequestRecord
    {
        public DateTime LastRequestTime { get; set; }
        public List<DateTime> RequestTimes { get; set; } = new();
    }
}
