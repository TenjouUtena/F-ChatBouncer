using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace FChatBouncer.Server.HealthChecks;

/// <summary>
/// Health check for F-List HTTP API connectivity
/// Tests connection to https://www.f-list.net
/// </summary>
public class FListApiHealthCheck : IHealthCheck
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<FListApiHealthCheck> _logger;
    private const string FListApiUrl = "https://www.f-list.net/json/api/";
    private const int TimeoutSeconds = 10;

    public FListApiHealthCheck(IHttpClientFactory httpClientFactory, ILogger<FListApiHealthCheck> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(TimeoutSeconds);

            var startTime = DateTime.UtcNow;
            
            // Try to HEAD the F-List API endpoint to check connectivity
            // We don't need a valid response, just checking if the API is reachable
            var response = await httpClient.GetAsync(FListApiUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            
            var duration = DateTime.UtcNow - startTime;

            // F-List API returns various status codes, we just care if we can reach it
            if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.BadRequest)
            {
                var data = new Dictionary<string, object>
                {
                    { "endpoint", FListApiUrl },
                    { "responseTime", $"{duration.TotalMilliseconds:F2}ms" },
                    { "statusCode", (int)response.StatusCode }
                };

                if (duration.TotalSeconds > 5)
                {
                    _logger.LogWarning("F-List API health check slow: {Duration}ms", duration.TotalMilliseconds);
                    return HealthCheckResult.Degraded($"F-List API responding slowly ({duration.TotalMilliseconds:F0}ms)", null, data);
                }

                return HealthCheckResult.Healthy($"F-List API accessible ({duration.TotalMilliseconds:F0}ms)", data);
            }
            else
            {
                var data = new Dictionary<string, object>
                {
                    { "endpoint", FListApiUrl },
                    { "statusCode", (int)response.StatusCode },
                    { "reasonPhrase", response.ReasonPhrase ?? "Unknown" }
                };

                _logger.LogWarning("F-List API health check failed: {StatusCode} {Reason}", 
                    response.StatusCode, response.ReasonPhrase);
                
                return HealthCheckResult.Unhealthy($"F-List API returned {response.StatusCode}", null, data);
            }
        }
        catch (TaskCanceledException)
        {
            _logger.LogError("F-List API health check timed out after {Timeout} seconds", TimeoutSeconds);
            return HealthCheckResult.Unhealthy($"F-List API request timed out after {TimeoutSeconds}s");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "F-List API health check failed with HTTP error");
            return HealthCheckResult.Unhealthy($"F-List API connection failed: {ex.Message}", ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "F-List API health check failed");
            return HealthCheckResult.Unhealthy($"F-List API health check error: {ex.Message}", ex);
        }
    }
}

