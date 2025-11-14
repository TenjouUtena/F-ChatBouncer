using Prometheus;

namespace FChatBouncer.Server.Metrics;

/// <summary>
/// Prometheus metrics for F-ChatBouncer application
/// Provides observability into system health and performance
/// </summary>
public static class ApplicationMetrics
{
    // ========== Connection Metrics ==========
    
    /// <summary>
    /// Total number of active WebSocket connections to F-Chat
    /// </summary>
    public static readonly Gauge ActiveWebSocketConnections = Prometheus.Metrics.CreateGauge(
        "fchatbouncer_active_websocket_connections",
        "Number of active WebSocket connections to F-Chat");

    /// <summary>
    /// Total number of active character connections
    /// </summary>
    public static readonly Gauge ActiveCharacterConnections = Prometheus.Metrics.CreateGauge(
        "fchatbouncer_active_character_connections",
        "Number of active character connections");

    /// <summary>
    /// Total number of active SignalR connections from clients
    /// </summary>
    public static readonly Gauge ActiveSignalRConnections = Prometheus.Metrics.CreateGauge(
        "fchatbouncer_active_signalr_connections",
        "Number of active SignalR connections from clients");

    /// <summary>
    /// Counter for WebSocket connection attempts
    /// </summary>
    public static readonly Counter WebSocketConnectionAttempts = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_websocket_connection_attempts_total",
        "Total number of WebSocket connection attempts",
        new CounterConfiguration { LabelNames = new[] { "status" } });

    /// <summary>
    /// Counter for WebSocket disconnections
    /// </summary>
    public static readonly Counter WebSocketDisconnections = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_websocket_disconnections_total",
        "Total number of WebSocket disconnections",
        new CounterConfiguration { LabelNames = new[] { "reason" } });

    // ========== Message Metrics ==========

    /// <summary>
    /// Counter for messages sent to F-Chat
    /// </summary>
    public static readonly Counter MessagesSent = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_messages_sent_total",
        "Total number of messages sent to F-Chat",
        new CounterConfiguration { LabelNames = new[] { "message_type" } });

    /// <summary>
    /// Counter for messages received from F-Chat
    /// </summary>
    public static readonly Counter MessagesReceived = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_messages_received_total",
        "Total number of messages received from F-Chat",
        new CounterConfiguration { LabelNames = new[] { "message_type" } });

    /// <summary>
    /// Counter for messages queued when disconnected
    /// </summary>
    public static readonly Counter MessagesQueued = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_messages_queued_total",
        "Total number of messages queued when disconnected");

    /// <summary>
    /// Gauge for current queue depth
    /// </summary>
    public static readonly Gauge MessageQueueDepth = Prometheus.Metrics.CreateGauge(
        "fchatbouncer_message_queue_depth",
        "Current number of messages in queue");

    /// <summary>
    /// Histogram for message processing latency
    /// </summary>
    public static readonly Histogram MessageProcessingDuration = Prometheus.Metrics.CreateHistogram(
        "fchatbouncer_message_processing_duration_seconds",
        "Duration of message processing",
        new HistogramConfiguration
        {
            LabelNames = new[] { "message_type" },
            Buckets = Histogram.ExponentialBuckets(0.001, 2, 10) // 1ms to 512ms
        });

    // ========== Profile Metrics ==========

    /// <summary>
    /// Counter for profile requests
    /// </summary>
    public static readonly Counter ProfileRequests = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_profile_requests_total",
        "Total number of profile requests",
        new CounterConfiguration { LabelNames = new[] { "status" } });

    /// <summary>
    /// Gauge for profile request queue depth
    /// </summary>
    public static readonly Gauge ProfileQueueDepth = Prometheus.Metrics.CreateGauge(
        "fchatbouncer_profile_queue_depth",
        "Current number of profile requests in queue");

    /// <summary>
    /// Histogram for profile request processing duration
    /// </summary>
    public static readonly Histogram ProfileProcessingDuration = Prometheus.Metrics.CreateHistogram(
        "fchatbouncer_profile_processing_duration_seconds",
        "Duration of profile request processing",
        new HistogramConfiguration
        {
            Buckets = Histogram.ExponentialBuckets(0.1, 2, 10) // 100ms to 51s
        });

    // ========== Database Metrics ==========

    /// <summary>
    /// Counter for database queries
    /// </summary>
    public static readonly Counter DatabaseQueries = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_database_queries_total",
        "Total number of database queries",
        new CounterConfiguration { LabelNames = new[] { "operation", "table" } });

    /// <summary>
    /// Histogram for database query duration
    /// </summary>
    public static readonly Histogram DatabaseQueryDuration = Prometheus.Metrics.CreateHistogram(
        "fchatbouncer_database_query_duration_seconds",
        "Duration of database queries",
        new HistogramConfiguration
        {
            LabelNames = new[] { "operation", "table" },
            Buckets = Histogram.ExponentialBuckets(0.001, 2, 10) // 1ms to 512ms
        });

    // ========== Redis Metrics ==========

    /// <summary>
    /// Counter for Redis operations
    /// </summary>
    public static readonly Counter RedisOperations = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_redis_operations_total",
        "Total number of Redis operations",
        new CounterConfiguration { LabelNames = new[] { "operation", "status" } });

    /// <summary>
    /// Histogram for Redis operation duration
    /// </summary>
    public static readonly Histogram RedisOperationDuration = Prometheus.Metrics.CreateHistogram(
        "fchatbouncer_redis_operation_duration_seconds",
        "Duration of Redis operations",
        new HistogramConfiguration
        {
            LabelNames = new[] { "operation" },
            Buckets = Histogram.ExponentialBuckets(0.0001, 2, 10) // 0.1ms to 51ms
        });

    // ========== F-List API Metrics ==========

    /// <summary>
    /// Counter for F-List API calls
    /// </summary>
    public static readonly Counter FListApiCalls = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_flist_api_calls_total",
        "Total number of F-List API calls",
        new CounterConfiguration { LabelNames = new[] { "endpoint", "status" } });

    /// <summary>
    /// Histogram for F-List API call duration
    /// </summary>
    public static readonly Histogram FListApiDuration = Prometheus.Metrics.CreateHistogram(
        "fchatbouncer_flist_api_duration_seconds",
        "Duration of F-List API calls",
        new HistogramConfiguration
        {
            LabelNames = new[] { "endpoint" },
            Buckets = Histogram.ExponentialBuckets(0.1, 2, 10) // 100ms to 51s
        });

    // ========== Authentication Metrics ==========

    /// <summary>
    /// Counter for authentication attempts
    /// </summary>
    public static readonly Counter AuthenticationAttempts = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_authentication_attempts_total",
        "Total number of authentication attempts",
        new CounterConfiguration { LabelNames = new[] { "method", "status" } });

    /// <summary>
    /// Counter for active user sessions
    /// </summary>
    public static readonly Gauge ActiveUserSessions = Prometheus.Metrics.CreateGauge(
        "fchatbouncer_active_user_sessions",
        "Number of active user sessions");

    // ========== Error Metrics ==========

    /// <summary>
    /// Counter for errors by category
    /// </summary>
    public static readonly Counter Errors = Prometheus.Metrics.CreateCounter(
        "fchatbouncer_errors_total",
        "Total number of errors by category",
        new CounterConfiguration { LabelNames = new[] { "category", "severity" } });

    // ========== System Metrics ==========

    /// <summary>
    /// Gauge for memory usage
    /// </summary>
    public static readonly Gauge MemoryUsageBytes = Prometheus.Metrics.CreateGauge(
        "fchatbouncer_memory_usage_bytes",
        "Current memory usage in bytes");

    /// <summary>
    /// Gauge for thread pool queue length
    /// </summary>
    public static readonly Gauge ThreadPoolQueueLength = Prometheus.Metrics.CreateGauge(
        "fchatbouncer_threadpool_queue_length",
        "Current thread pool queue length");

    // ========== Helper Methods ==========

    /// <summary>
    /// Updates system metrics (called periodically)
    /// </summary>
    public static void UpdateSystemMetrics()
    {
        // Memory usage
        var process = System.Diagnostics.Process.GetCurrentProcess();
        MemoryUsageBytes.Set(process.WorkingSet64);

        // Thread pool metrics
        ThreadPool.GetAvailableThreads(out _, out _);
        ThreadPool.GetMaxThreads(out var maxWorkerThreads, out _);
        ThreadPool.GetAvailableThreads(out var availableWorkerThreads, out _);
        ThreadPoolQueueLength.Set(maxWorkerThreads - availableWorkerThreads);
    }
}

