using FChatBouncer.Server.Infrastructure;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace FChatBouncer.Server.HealthChecks;

/// <summary>
/// Health check for Redis connectivity and performance.
/// Checks if Redis is connected, responsive, and performing within acceptable thresholds.
/// </summary>
public class RedisHealthCheck : IHealthCheck
{
    private readonly IRedisConnectionFactory _connectionFactory;
    private readonly ILogger<RedisHealthCheck> _logger;

    public RedisHealthCheck(
        IRedisConnectionFactory connectionFactory,
        ILogger<RedisHealthCheck> logger)
    {
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var isHealthy = await _connectionFactory.IsHealthyAsync();
            
            if (!isHealthy)
            {
                var status = _connectionFactory.GetConnectionStatus();
                _logger.LogWarning("Redis health check failed: {Status}", status);
                
                return HealthCheckResult.Unhealthy(
                    $"Redis is not healthy. Status: {status}");
            }

            var connectionStatus = _connectionFactory.GetConnectionStatus();
            _logger.LogDebug("Redis health check passed: {Status}", connectionStatus);

            return HealthCheckResult.Healthy(
                $"Redis is healthy. {connectionStatus}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Redis health check threw an exception");
            
            return HealthCheckResult.Unhealthy(
                "Redis health check failed with exception",
                ex);
        }
    }
}

