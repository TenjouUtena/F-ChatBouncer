using FChatBouncer.Server.Services;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;

namespace FChatBouncer.Server.HealthChecks;

/// <summary>
/// Health check for F-Chat WebSocket connectivity
/// Checks if any WebSocket connections are active and healthy
/// </summary>
public class FChatWebSocketHealthCheck : IHealthCheck
{
    private readonly IFChatService _fchatService;
    private readonly ILogger<FChatWebSocketHealthCheck> _logger;
    private readonly IServiceProvider _serviceProvider;

    public FChatWebSocketHealthCheck(
        IFChatService fchatService,
        ILogger<FChatWebSocketHealthCheck> logger,
        IServiceProvider serviceProvider)
    {
        _fchatService = fchatService;
        _logger = logger;
        _serviceProvider = serviceProvider;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            // Check if the service has any active WebSocket connections
            // This is a basic check - in a real implementation, you might want to:
            // 1. Check connection state of active connections
            // 2. Verify recent message activity
            // 3. Test connection with a ping/pong
            
            // For now, we'll check if there are any active character connections in the database
            using var scope = _serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<Data.BouncerDbContext>();
            
            var activeConnectionsCount = await dbContext.CharacterConnections
                .Where(cc => cc.IsConnected)
                .CountAsync(cancellationToken);
            
            var data = new Dictionary<string, object>
            {
                { "activeConnections", activeConnectionsCount },
                { "timestamp", DateTime.UtcNow.ToString("O") }
            };

            if (activeConnectionsCount > 0)
            {
                _logger.LogDebug("F-Chat health check: {Count} active connections", activeConnectionsCount);
                return HealthCheckResult.Healthy($"F-Chat service operational ({activeConnectionsCount} active connections)", data);
            }
            else
            {
                // No active connections, but service is still operational
                // This is not necessarily unhealthy - just means no users are connected
                _logger.LogDebug("F-Chat health check: No active connections");
                return HealthCheckResult.Healthy("F-Chat service operational (no active connections)", data);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "F-Chat health check failed");
            return HealthCheckResult.Unhealthy($"F-Chat service health check error: {ex.Message}", ex);
        }
    }
}

