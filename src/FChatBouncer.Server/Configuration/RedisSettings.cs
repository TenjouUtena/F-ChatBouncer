namespace FChatBouncer.Server.Configuration;

/// <summary>
/// Configuration settings for Redis connection and caching.
/// </summary>
public class RedisSettings
{
    /// <summary>
    /// Redis connection string. Format: "localhost:6379" or "redis-server:6379,password=mypassword"
    /// </summary>
    public string ConnectionString { get; set; } = "localhost:6379";

    /// <summary>
    /// Redis instance name prefix for keys (helps with multi-tenant scenarios)
    /// </summary>
    public string InstanceName { get; set; } = "FChatBouncer:";

    /// <summary>
    /// Enable SSL/TLS for Redis connection
    /// </summary>
    public bool UseSsl { get; set; } = false;

    /// <summary>
    /// Redis database number to use (0-15 typically)
    /// </summary>
    public int Database { get; set; } = 0;

    /// <summary>
    /// Connection timeout in milliseconds
    /// </summary>
    public int ConnectTimeout { get; set; } = 5000;

    /// <summary>
    /// Sync timeout in milliseconds
    /// </summary>
    public int SyncTimeout { get; set; } = 5000;

    /// <summary>
    /// Allow admin operations (dangerous in production)
    /// </summary>
    public bool AllowAdmin { get; set; } = false;

    /// <summary>
    /// Abort on connection failure (if false, will queue commands)
    /// </summary>
    public bool AbortOnConnectFail { get; set; } = false;

    /// <summary>
    /// Maximum number of connection retry attempts
    /// </summary>
    public int ConnectRetry { get; set; } = 3;

    /// <summary>
    /// Keep alive interval in seconds (-1 = disabled, 0 = default, >0 = seconds)
    /// </summary>
    public int KeepAlive { get; set; } = 60;

    /// <summary>
    /// Default cache expiration time in minutes
    /// </summary>
    public int DefaultCacheExpirationMinutes { get; set; } = 60;
}

