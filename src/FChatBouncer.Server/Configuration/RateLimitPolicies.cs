using System.Threading.RateLimiting;

namespace FChatBouncer.Server.Configuration;

/// <summary>
/// Defines rate limiting policies for API endpoints
/// </summary>
public static class RateLimitPolicies
{
    // Policy names
    public const string Authentication = "Authentication";
    public const string Registration = "Registration";
    public const string TokenRefresh = "TokenRefresh";
    public const string ProfileRequest = "ProfileRequest";
    public const string SearchRequest = "SearchRequest";
    public const string ChannelRefresh = "ChannelRefresh";
    public const string StatusUpdate = "StatusUpdate";
    public const string Messaging = "Messaging";
    public const string GlobalAuthenticated = "GlobalAuthenticated";
    public const string GlobalUnauthenticated = "GlobalUnauthenticated";
    
    /// <summary>
    /// Configure all rate limiting policies
    /// </summary>
    public static void AddRateLimitingPolicies(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            // Global rejection behavior
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            
            options.OnRejected = async (context, cancellationToken) =>
            {
                TimeSpan? retryAfter = null;
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
                {
                    retryAfter = retry;
                    context.HttpContext.Response.Headers.RetryAfter = retry.TotalSeconds.ToString();
                }
                
                context.HttpContext.Response.ContentType = "application/json";
                await context.HttpContext.Response.WriteAsync(
                    System.Text.Json.JsonSerializer.Serialize(new
                    {
                        error = "Too many requests",
                        message = "Rate limit exceeded. Please try again later.",
                        retryAfter = retryAfter?.TotalSeconds
                    }), cancellationToken);
            };
            
            // Authentication endpoint - 5 attempts per minute per IP
            options.AddPolicy(Authentication, context =>
            {
                var ipAddress = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ipAddress, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromMinutes(1),
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 0 // No queuing for auth attempts
                });
            });
            
            // Registration endpoint - 3 attempts per minute per IP
            options.AddPolicy(Registration, context =>
            {
                var ipAddress = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ipAddress, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 3,
                    Window = TimeSpan.FromMinutes(1),
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 0
                });
            });
            
            // Token refresh - 10 attempts per minute per user
            options.AddPolicy(TokenRefresh, context =>
            {
                var userId = context.User.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(userId, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromMinutes(1),
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 2
                });
            });
            
            // Profile requests - handled by ProfileService with 30-second delay
            // This is a lighter limit for the API endpoint itself
            options.AddPolicy(ProfileRequest, context =>
            {
                var userId = context.User.Identity?.Name ?? "anonymous";
                return RateLimitPartition.GetFixedWindowLimiter(userId, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromMinutes(1),
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 5
                });
            });
            
            // Search requests - 5 per minute per user
            options.AddPolicy(SearchRequest, context =>
            {
                var userId = context.User.Identity?.Name ?? "anonymous";
                return RateLimitPartition.GetSlidingWindowLimiter(userId, _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromMinutes(1),
                    SegmentsPerWindow = 2,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 2
                });
            });
            
            // Channel refresh - 2 per minute per user
            options.AddPolicy(ChannelRefresh, context =>
            {
                var userId = context.User.Identity?.Name ?? "anonymous";
                return RateLimitPartition.GetFixedWindowLimiter(userId, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 2,
                    Window = TimeSpan.FromMinutes(1),
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 1
                });
            });
            
            // Status update - 10 per minute per user
            options.AddPolicy(StatusUpdate, context =>
            {
                var userId = context.User.Identity?.Name ?? "anonymous";
                return RateLimitPartition.GetSlidingWindowLimiter(userId, _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromMinutes(1),
                    SegmentsPerWindow = 2,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 3
                });
            });
            
            // Messaging - 30 messages per minute per user (handled separately for SignalR)
            options.AddPolicy(Messaging, context =>
            {
                var userId = context.User.Identity?.Name ?? "anonymous";
                return RateLimitPartition.GetSlidingWindowLimiter(userId, _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = 30,
                    Window = TimeSpan.FromMinutes(1),
                    SegmentsPerWindow = 3,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 5
                });
            });
            
            // Global authenticated - 100 requests per minute per user
            options.AddPolicy(GlobalAuthenticated, context =>
            {
                var userId = context.User.Identity?.Name ?? "anonymous";
                return RateLimitPartition.GetTokenBucketLimiter(userId, _ => new TokenBucketRateLimiterOptions
                {
                    TokenLimit = 100,
                    ReplenishmentPeriod = TimeSpan.FromMinutes(1),
                    TokensPerPeriod = 100,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 10,
                    AutoReplenishment = true
                });
            });
            
            // Global unauthenticated - 20 requests per minute per IP
            options.AddPolicy(GlobalUnauthenticated, context =>
            {
                var ipAddress = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetTokenBucketLimiter(ipAddress, _ => new TokenBucketRateLimiterOptions
                {
                    TokenLimit = 20,
                    ReplenishmentPeriod = TimeSpan.FromMinutes(1),
                    TokensPerPeriod = 20,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 0,
                    AutoReplenishment = true
                });
            });
        });
    }
}

