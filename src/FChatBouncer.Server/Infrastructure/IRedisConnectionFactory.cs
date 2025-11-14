using StackExchange.Redis;

namespace FChatBouncer.Server.Infrastructure;

/// <summary>
/// Interface for managing Redis connections with connection pooling and health checks.
/// </summary>
public interface IRedisConnectionFactory
{
    /// <summary>
    /// Gets the current Redis connection multiplexer.
    /// </summary>
    /// <returns>The connection multiplexer for Redis operations.</returns>
    IConnectionMultiplexer GetConnection();

    /// <summary>
    /// Gets a Redis database instance.
    /// </summary>
    /// <param name="db">Database number (default: -1 for default database)</param>
    /// <returns>The Redis database instance.</returns>
    IDatabase GetDatabase(int db = -1);

    /// <summary>
    /// Gets the Redis server for administrative operations.
    /// </summary>
    /// <returns>The Redis server instance.</returns>
    IServer GetServer();

    /// <summary>
    /// Checks if Redis is connected and responsive.
    /// </summary>
    /// <returns>True if Redis is healthy, false otherwise.</returns>
    Task<bool> IsHealthyAsync();

    /// <summary>
    /// Gets the connection status information.
    /// </summary>
    /// <returns>Connection status string.</returns>
    string GetConnectionStatus();
}

