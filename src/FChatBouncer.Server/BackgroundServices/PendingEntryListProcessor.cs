using FChatBouncer.Server.Configuration;
using FChatBouncer.Server.Infrastructure;
using FChatBouncer.Server.MessageQueue;
using Microsoft.Extensions.Options;

namespace FChatBouncer.Server.BackgroundServices;

public class PendingEntryListProcessor : BackgroundService
{
    private readonly ILogger<PendingEntryListProcessor> _logger;
    private readonly IRedisConnectionFactory _redisConnectionFactory;
    private readonly MessageQueueOptions _options;

    public PendingEntryListProcessor(
        ILogger<PendingEntryListProcessor> logger,
        IRedisConnectionFactory redisConnectionFactory,
        IOptions<MessageQueueOptions> options)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _redisConnectionFactory = redisConnectionFactory ?? throw new ArgumentNullException(nameof(redisConnectionFactory));
        _options = options.Value ?? new MessageQueueOptions();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, _options.Streams.TrimIntervalMinutes));
        _logger.LogInformation("Pending entry processor started with interval {IntervalMinutes} minutes", interval.TotalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await InspectPendingEntriesAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Graceful shutdown
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to inspect pending entry lists");
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

        _logger.LogInformation("Pending entry processor stopped");
    }

    private async Task InspectPendingEntriesAsync(CancellationToken cancellationToken)
    {
        var db = _redisConnectionFactory.GetDatabase();

        foreach (var pattern in StreamKeys.GetStreamScanPatterns())
        {
            foreach (var redisKey in _redisConnectionFactory.GetServer().Keys(pattern: pattern))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var streamKey = redisKey.ToString();
                try
                {
                    var groups = await db.StreamGroupInfoAsync(streamKey).ConfigureAwait(false);
                    foreach (var group in groups)
                    {
                        if (group.PendingMessageCount > 0)
                        {
                            _logger.LogWarning("Stream {StreamKey} group {GroupName} has {Pending} pending messages (last delivered {LastDeliveredId})",
                                streamKey,
                                group.Name,
                                group.PendingMessageCount,
                                group.LastDeliveredId);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to inspect pending entries for stream {StreamKey}", streamKey);
                }
            }
        }
    }
}

