using Serilog.Context;

namespace FChatBouncer.Server.Middleware;

/// <summary>
/// Middleware that adds a correlation ID to each request for tracking across logs.
/// The correlation ID is either provided by the client in the X-Correlation-Id header,
/// or generated automatically. It's added to all log entries for that request.
/// </summary>
public class CorrelationIdMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;
    private const string CorrelationIdHeaderName = "X-Correlation-Id";
    private const string CorrelationIdLogPropertyName = "CorrelationId";

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next ?? throw new ArgumentNullException(nameof(next));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Get or generate correlation ID
        var correlationId = GetOrGenerateCorrelationId(context);

        // Add correlation ID to response headers
        if (!context.Response.HasStarted)
        {
            context.Response.Headers.TryAdd(CorrelationIdHeaderName, correlationId);
        }

        // Store in HttpContext items for access throughout the request
        context.Items[CorrelationIdLogPropertyName] = correlationId;

        // Push correlation ID into Serilog LogContext so it appears in all logs for this request
        using (LogContext.PushProperty(CorrelationIdLogPropertyName, correlationId))
        {
            _logger.LogDebug("Request started with CorrelationId: {CorrelationId}", correlationId);
            
            try
            {
                await _next(context);
            }
            finally
            {
                _logger.LogDebug("Request ended with CorrelationId: {CorrelationId}", correlationId);
            }
        }
    }

    /// <summary>
    /// Gets the correlation ID from the request header, or generates a new one if not present.
    /// </summary>
    private string GetOrGenerateCorrelationId(HttpContext context)
    {
        // Check if client provided a correlation ID
        if (context.Request.Headers.TryGetValue(CorrelationIdHeaderName, out var correlationIdFromHeader))
        {
            var providedId = correlationIdFromHeader.FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(providedId))
            {
                _logger.LogTrace("Using client-provided CorrelationId: {CorrelationId}", providedId);
                return providedId;
            }
        }

        // Generate a new correlation ID
        var newCorrelationId = Guid.NewGuid().ToString("N");
        _logger.LogTrace("Generated new CorrelationId: {CorrelationId}", newCorrelationId);
        return newCorrelationId;
    }
}

/// <summary>
/// Extension methods for registering the CorrelationIdMiddleware.
/// </summary>
public static class CorrelationIdMiddlewareExtensions
{
    /// <summary>
    /// Adds the CorrelationIdMiddleware to the application pipeline.
    /// Should be added early in the pipeline to ensure all logs have correlation IDs.
    /// </summary>
    public static IApplicationBuilder UseCorrelationId(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<CorrelationIdMiddleware>();
    }
}

