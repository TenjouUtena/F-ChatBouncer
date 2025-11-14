using FChatBouncer.Server.Services;
using System.IdentityModel.Tokens.Jwt;

namespace FChatBouncer.Server.Middleware;

/// <summary>
/// Middleware to check if JWT tokens are blacklisted
/// </summary>
public class TokenBlacklistMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TokenBlacklistMiddleware> _logger;
    
    public TokenBlacklistMiddleware(RequestDelegate next, ILogger<TokenBlacklistMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }
    
    public async Task InvokeAsync(HttpContext context, ITokenBlacklistService tokenBlacklistService)
    {
        // Only check authenticated requests
        if (context.User.Identity?.IsAuthenticated == true)
        {
            // Extract JTI claim from token
            var jtiClaim = context.User.FindFirst(JwtRegisteredClaimNames.Jti);
            
            if (jtiClaim != null)
            {
                var tokenJti = jtiClaim.Value;
                
                // Check if token is blacklisted
                if (await tokenBlacklistService.IsTokenBlacklistedAsync(tokenJti))
                {
                    _logger.LogWarning("Rejected blacklisted token {TokenJti} from user {UserId}",
                        tokenJti, context.User.Identity.Name);
                    
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(new
                    {
                        error = "Token invalidated",
                        message = "This token has been invalidated. Please log in again."
                    }));
                    return;
                }
            }
        }
        
        await _next(context);
    }
}

/// <summary>
/// Extension method to add token blacklist middleware
/// </summary>
public static class TokenBlacklistMiddlewareExtensions
{
    public static IApplicationBuilder UseTokenBlacklist(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<TokenBlacklistMiddleware>();
    }
}

