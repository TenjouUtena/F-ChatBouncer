using System.Diagnostics;
using Serilog.Context;

namespace FChatBouncer.Server.Extensions;

/// <summary>
/// Extension methods for enhanced logging functionality.
/// Provides helpers for performance logging, scoped logging, and common logging patterns.
/// </summary>
public static class LoggingExtensions
{
    /// <summary>
    /// Creates a timing scope that logs the duration of an operation.
    /// Usage: using (logger.TimeOperation("OperationName")) { ... }
    /// </summary>
    public static IDisposable TimeOperation(this ILogger logger, string operationName, LogLevel logLevel = LogLevel.Information)
    {
        return new OperationTimer(logger, operationName, logLevel);
    }

    /// <summary>
    /// Logs a security event with standardized format.
    /// </summary>
    public static void LogSecurityEvent(
        this ILogger logger,
        string eventType,
        string userId,
        string? details = null,
        bool success = true)
    {
        if (success)
        {
            logger.LogInformation(
                "Security Event: {EventType} | User: {UserId} | Details: {Details}",
                eventType,
                userId,
                details ?? "None");
        }
        else
        {
            logger.LogWarning(
                "Security Event FAILED: {EventType} | User: {UserId} | Details: {Details}",
                eventType,
                userId,
                details ?? "None");
        }
    }

    /// <summary>
    /// Logs a performance warning if an operation takes longer than the threshold.
    /// </summary>
    public static void LogPerformanceIfSlow(
        this ILogger logger,
        string operationName,
        TimeSpan duration,
        TimeSpan threshold)
    {
        if (duration > threshold)
        {
            logger.LogWarning(
                "Performance: {OperationName} took {DurationMs}ms (threshold: {ThresholdMs}ms)",
                operationName,
                duration.TotalMilliseconds,
                threshold.TotalMilliseconds);
        }
    }

    /// <summary>
    /// Logs F-Chat protocol messages with standardized format.
    /// </summary>
    public static void LogFChatMessage(
        this ILogger logger,
        string direction,
        string commandType,
        string? characterName = null,
        string? additionalInfo = null)
    {
        logger.LogDebug(
            "F-Chat {Direction}: {CommandType} | Character: {Character} | Info: {Info}",
            direction,
            commandType,
            characterName ?? "N/A",
            additionalInfo ?? "None");
    }

    /// <summary>
    /// Logs SignalR hub method invocations with standardized format.
    /// </summary>
    public static void LogHubMethodInvocation(
        this ILogger logger,
        string methodName,
        string connectionId,
        string? userId = null,
        string? additionalInfo = null)
    {
        logger.LogDebug(
            "SignalR Hub Method: {MethodName} | Connection: {ConnectionId} | User: {UserId} | Info: {Info}",
            methodName,
            connectionId,
            userId ?? "N/A",
            additionalInfo ?? "None");
    }

    /// <summary>
    /// Logs database query execution with timing.
    /// </summary>
    public static void LogDatabaseQuery(
        this ILogger logger,
        string queryType,
        TimeSpan duration,
        int? recordCount = null)
    {
        logger.LogDebug(
            "Database Query: {QueryType} | Duration: {DurationMs}ms | Records: {RecordCount}",
            queryType,
            duration.TotalMilliseconds,
            recordCount?.ToString() ?? "N/A");
    }

    /// <summary>
    /// Logs Redis operations with timing and result.
    /// </summary>
    public static void LogRedisOperation(
        this ILogger logger,
        string operation,
        string key,
        TimeSpan duration,
        bool success = true)
    {
        if (success)
        {
            logger.LogTrace(
                "Redis: {Operation} | Key: {Key} | Duration: {DurationMs}ms",
                operation,
                key,
                duration.TotalMilliseconds);
        }
        else
        {
            logger.LogWarning(
                "Redis FAILED: {Operation} | Key: {Key} | Duration: {DurationMs}ms",
                operation,
                key,
                duration.TotalMilliseconds);
        }
    }

    /// <summary>
    /// Creates a scoped logger with additional properties.
    /// Usage: using (logger.BeginScope(...)) { ... }
    /// </summary>
    public static IDisposable BeginScopeWithProperties(
        this ILogger logger,
        params (string Key, object Value)[] properties)
    {
        var disposables = properties
            .Select(p => LogContext.PushProperty(p.Key, p.Value))
            .ToList();

        return new CompositeDisposable(disposables);
    }

    /// <summary>
    /// Logs an external API call with timing and result.
    /// </summary>
    public static void LogExternalApiCall(
        this ILogger logger,
        string apiName,
        string endpoint,
        TimeSpan duration,
        int statusCode,
        bool success = true)
    {
        var logLevel = success ? LogLevel.Information : LogLevel.Warning;
        
        logger.Log(
            logLevel,
            "External API: {ApiName} | Endpoint: {Endpoint} | Status: {StatusCode} | Duration: {DurationMs}ms",
            apiName,
            endpoint,
            statusCode,
            duration.TotalMilliseconds);
    }

    /// <summary>
    /// Logs character connection state changes.
    /// </summary>
    public static void LogCharacterStateChange(
        this ILogger logger,
        string characterName,
        string oldState,
        string newState,
        string? userId = null)
    {
        logger.LogInformation(
            "Character State Change: {CharacterName} | {OldState} -> {NewState} | User: {UserId}",
            characterName,
            oldState,
            newState,
            userId ?? "N/A");
    }
}

/// <summary>
/// Internal class for timing operations.
/// </summary>
internal class OperationTimer : IDisposable
{
    private readonly ILogger _logger;
    private readonly string _operationName;
    private readonly LogLevel _logLevel;
    private readonly Stopwatch _stopwatch;
    private bool _disposed;

    public OperationTimer(ILogger logger, string operationName, LogLevel logLevel)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _operationName = operationName ?? throw new ArgumentNullException(nameof(operationName));
        _logLevel = logLevel;
        _stopwatch = Stopwatch.StartNew();

        _logger.Log(_logLevel, "Starting: {OperationName}", _operationName);
    }

    public void Dispose()
    {
        if (_disposed) return;

        _stopwatch.Stop();
        _logger.Log(
            _logLevel,
            "Completed: {OperationName} in {DurationMs}ms",
            _operationName,
            _stopwatch.ElapsedMilliseconds);

        _disposed = true;
    }
}

/// <summary>
/// Helper class to dispose multiple disposables.
/// </summary>
internal class CompositeDisposable : IDisposable
{
    private readonly List<IDisposable> _disposables;
    private bool _disposed;

    public CompositeDisposable(List<IDisposable> disposables)
    {
        _disposables = disposables ?? throw new ArgumentNullException(nameof(disposables));
    }

    public void Dispose()
    {
        if (_disposed) return;

        foreach (var disposable in _disposables)
        {
            disposable?.Dispose();
        }

        _disposed = true;
    }
}

