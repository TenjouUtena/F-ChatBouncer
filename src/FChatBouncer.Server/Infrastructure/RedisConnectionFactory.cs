using FChatBouncer.Server.Configuration;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace FChatBouncer.Server.Infrastructure;

/// <summary>
/// Manages Redis connections with connection pooling, health monitoring, and reconnection logic.
/// Implements singleton pattern for connection multiplexer to ensure efficient connection reuse.
/// </summary>
public class RedisConnectionFactory : IRedisConnectionFactory, IDisposable
{
    private readonly RedisSettings _settings;
    private readonly ILogger<RedisConnectionFactory> _logger;
    private IConnectionMultiplexer? _connection;
    private readonly SemaphoreSlim _connectionLock = new(1, 1);
    private bool _disposed;

    public RedisConnectionFactory(
        IOptions<RedisSettings> settings,
        ILogger<RedisConnectionFactory> logger)
    {
        _settings = settings.Value ?? throw new ArgumentNullException(nameof(settings));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Gets or creates the Redis connection multiplexer.
    /// Uses double-check locking pattern for thread-safe lazy initialization.
    /// </summary>
    public IConnectionMultiplexer GetConnection()
    {
        if (_connection != null && _connection.IsConnected)
        {
            return _connection;
        }

        _connectionLock.Wait();
        try
        {
            if (_connection != null && _connection.IsConnected)
            {
                return _connection;
            }

            _logger.LogInformation("Creating new Redis connection to {ConnectionString}", _settings.ConnectionString);
            
            var configurationOptions = BuildConfigurationOptions();
            _connection = ConnectionMultiplexer.Connect(configurationOptions);

            // Register event handlers for connection monitoring
            RegisterConnectionEvents(_connection);

            _logger.LogInformation("Redis connection established successfully");
            return _connection;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to Redis at {ConnectionString}", _settings.ConnectionString);
            throw new InvalidOperationException($"Unable to connect to Redis: {ex.Message}", ex);
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    /// <summary>
    /// Gets a Redis database instance.
    /// </summary>
    public IDatabase GetDatabase(int db = -1)
    {
        var connection = GetConnection();
        return connection.GetDatabase(db == -1 ? _settings.Database : db);
    }

    /// <summary>
    /// Gets the Redis server for administrative operations.
    /// </summary>
    public IServer GetServer()
    {
        var connection = GetConnection();
        var endpoints = connection.GetEndPoints();
        
        if (endpoints.Length == 0)
        {
            throw new InvalidOperationException("No Redis endpoints available");
        }

        return connection.GetServer(endpoints[0]);
    }

    /// <summary>
    /// Performs a health check by attempting to ping Redis.
    /// </summary>
    public async Task<bool> IsHealthyAsync()
    {
        try
        {
            if (_connection == null || !_connection.IsConnected)
            {
                _logger.LogWarning("Redis connection is not established");
                return false;
            }

            var db = GetDatabase();
            var result = await db.PingAsync();
            
            var isHealthy = result.TotalMilliseconds < 1000; // Consider healthy if responds within 1 second
            
            if (!isHealthy)
            {
                _logger.LogWarning("Redis ping took {Ms}ms, which exceeds healthy threshold", result.TotalMilliseconds);
            }

            return isHealthy;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Redis health check failed");
            return false;
        }
    }

    /// <summary>
    /// Gets connection status information for monitoring.
    /// </summary>
    public string GetConnectionStatus()
    {
        if (_connection == null)
        {
            return "Not initialized";
        }

        if (!_connection.IsConnected)
        {
            return "Disconnected";
        }

        var config = _connection.Configuration;
        var endpoints = _connection.GetEndPoints();
        var endpointInfo = string.Join(", ", endpoints.Select(e => e.ToString()));

        return $"Connected to {endpointInfo} (Database: {_settings.Database})";
    }

    /// <summary>
    /// Builds Redis configuration options from settings.
    /// </summary>
    private ConfigurationOptions BuildConfigurationOptions()
    {
        var configOptions = ConfigurationOptions.Parse(_settings.ConnectionString);
        
        configOptions.ConnectTimeout = _settings.ConnectTimeout;
        configOptions.SyncTimeout = _settings.SyncTimeout;
        configOptions.AbortOnConnectFail = _settings.AbortOnConnectFail;
        configOptions.ConnectRetry = _settings.ConnectRetry;
        configOptions.KeepAlive = _settings.KeepAlive;
        configOptions.AllowAdmin = _settings.AllowAdmin;
        configOptions.Ssl = _settings.UseSsl;
        
        // Set client name for easier identification in Redis
        configOptions.ClientName = "FChatBouncer";
        
        // Enable reconnection
        configOptions.ReconnectRetryPolicy = new ExponentialRetry(5000); // Start with 5 second delay

        _logger.LogInformation(
            "Redis configuration: Timeout={Timeout}ms, SSL={Ssl}, Database={Db}, Retry={Retry}",
            _settings.ConnectTimeout,
            _settings.UseSsl,
            _settings.Database,
            _settings.ConnectRetry);

        return configOptions;
    }

    /// <summary>
    /// Registers event handlers to monitor connection health.
    /// </summary>
    private void RegisterConnectionEvents(IConnectionMultiplexer connection)
    {
        connection.ConnectionFailed += (sender, args) =>
        {
            _logger.LogError(
                "Redis connection failed: {EndPoint}, Failure: {FailureType}, Exception: {Exception}",
                args.EndPoint,
                args.FailureType,
                args.Exception?.Message);
        };

        connection.ConnectionRestored += (sender, args) =>
        {
            _logger.LogInformation(
                "Redis connection restored: {EndPoint}, Failure: {FailureType}",
                args.EndPoint,
                args.FailureType);
        };

        connection.ErrorMessage += (sender, args) =>
        {
            _logger.LogError("Redis error: {Message} on {EndPoint}", args.Message, args.EndPoint);
        };

        connection.InternalError += (sender, args) =>
        {
            _logger.LogError(args.Exception, "Redis internal error on {EndPoint}", args.EndPoint);
        };
    }

    /// <summary>
    /// Disposes the Redis connection.
    /// </summary>
    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _logger.LogInformation("Disposing Redis connection");
        
        _connection?.Dispose();
        _connectionLock.Dispose();
        
        _disposed = true;
        GC.SuppressFinalize(this);
    }
}

