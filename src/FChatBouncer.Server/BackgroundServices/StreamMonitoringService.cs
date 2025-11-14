using FChatBouncer.Server.Configuration;
using FChatBouncer.Server.Infrastructure;
using FChatBouncer.Server.MessageQueue;
using FChatBouncer.Server.Metrics;
using Microsoft.Extensions.Options;

namespace FChatBouncer.Server.BackgroundServices;

public class StreamMonitoringService : BackgroundService
{
    private readonly ILogger<StreamMonitoringService> _logger;
    private readonly IRedisConnectionFactory _redisConnectionFactory;
    private readonly MessageQueueOptions _options;

    public StreamMonitoringService(
        ILogger<StreamMonitoringService> logger,
        IRedisConnectionFactory redisConnectionFactory,
        IOptions<MessageQueueOptions> options)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _redisConnectionFactory = redisConnectionFactory ?? throw new ArgumentNullException(nameof(redisConnectionFactory));
        _options = options.Value ?? new MessageQueueOptions();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var monitoringOptions = _options.Monitoring;
        if (!monitoringOptions.EnableStreamSizeTracking && !monitoringOptions.EnableConsumerLagTracking)
        {
            _logger.LogInformation("Stream monitoring disabled via configuration");
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Max(30, monitoringOptions.CheckIntervalSeconds));
        _logger.LogInformation("Stream monitoring service started with interval {IntervalSeconds}s", interval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CollectMetricsAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // graceful shutdown
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Stream monitoring cycle failed");
            }

            try
            {
                await Task.Delay(interval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _logger.LogInformation("Stream monitoring service stopped");
    }

    private async Task CollectMetricsAsync(CancellationToken cancellationToken)
    {
        var db = _redisConnectionFactory.GetDatabase();
        var server = _redisConnectionFactory.GetServer();

        long totalMessages = 0;

        foreach (var pattern in StreamKeys.GetStreamScanPatterns())
        {
            foreach (var redisKey in server.Keys(pattern: pattern))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var streamKey = redisKey.ToString();

                try
                {
                    var length = await db.StreamLengthAsync(streamKey).ConfigureAwait(false);
                    totalMessages += length;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to collect stream metrics for {StreamKey}", streamKey);
                }
            }
        }

        ApplicationMetrics.MessageQueueDepth.Set(totalMessages);
        _logger.LogDebug("Collected message queue metrics - total messages across streams: {TotalMessages}", totalMessages);
    }
}

