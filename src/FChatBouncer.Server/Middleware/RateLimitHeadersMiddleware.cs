using System.Threading.RateLimiting;

namespace FChatBouncer.Server.Middleware;

/// <summary>
/// Middleware to add rate limit information headers to responses
/// </summary>
public class RateLimitHeadersMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RateLimitHeadersMiddleware> _logger;
    
    public RateLimitHeadersMiddleware(RequestDelegate next, ILogger<RateLimitHeadersMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }
    
    public async Task InvokeAsync(HttpContext context)
    {
        // Execute the next middleware in the pipeline
        await _next(context);
        
        // Add rate limit headers if available from the rate limiter
        if (context.Response.StatusCode == StatusCodes.Status429TooManyRequests)
        {
            // Headers are already set by the rate limiter's OnRejected callback
            return;
        }
        
        // For successful requests, add rate limit info if available from items
        if (context.Items.TryGetValue("RateLimit-Limit", out var limit))
        {
            context.Response.Headers.Append("X-RateLimit-Limit", limit.ToString() ?? "");
        }
        
        if (context.Items.TryGetValue("RateLimit-Remaining", out var remaining))
        {
            context.Response.Headers.Append("X-RateLimit-Remaining", remaining.ToString() ?? "");
        }
        
        if (context.Items.TryGetValue("RateLimit-Reset", out var reset))
        {
            context.Response.Headers.Append("X-RateLimit-Reset", reset.ToString() ?? "");
        }
    }
}

/// <summary>
/// Extension method to add rate limit headers middleware
/// </summary>
public static class RateLimitHeadersMiddlewareExtensions
{
    public static IApplicationBuilder UseRateLimitHeaders(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<RateLimitHeadersMiddleware>();
    }
}

