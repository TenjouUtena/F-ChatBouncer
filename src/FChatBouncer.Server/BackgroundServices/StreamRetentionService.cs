using FChatBouncer.Server.Configuration;
using FChatBouncer.Server.Infrastructure;
using FChatBouncer.Server.MessageQueue;
using Microsoft.Extensions.Options;

namespace FChatBouncer.Server.BackgroundServices;

public class StreamRetentionService : BackgroundService
{
    private readonly ILogger<StreamRetentionService> _logger;
    private readonly IMessageQueue _messageQueue;
    private readonly IRedisConnectionFactory _redisConnectionFactory;
    private readonly MessageQueueOptions _options;

    public StreamRetentionService(
        ILogger<StreamRetentionService> logger,
        IMessageQueue messageQueue,
        IRedisConnectionFactory redisConnectionFactory,
        IOptions<MessageQueueOptions> options)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _messageQueue = messageQueue ?? throw new ArgumentNullException(nameof(messageQueue));
        _redisConnectionFactory = redisConnectionFactory ?? throw new ArgumentNullException(nameof(redisConnectionFactory));
        _options = options.Value ?? new MessageQueueOptions();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var retention = _options.Streams.RetentionPolicy;
        if (retention.MaxMessages <= 0)
        {
            _logger.LogInformation("Stream retention disabled (MaxMessages <= 0)");
            return;
        }

        var interval = TimeSpan.FromMinutes(Math.Max(1, _options.Streams.TrimIntervalMinutes));
        _logger.LogInformation("Stream retention service started with interval {Interval} minutes and max {MaxMessages} messages per stream",
            interval.TotalMinutes,
            retention.MaxMessages);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TrimStreamsAsync(retention.MaxMessages, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Graceful shutdown
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Stream retention cycle failed");
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

        _logger.LogInformation("Stream retention service stopped");
    }

    private async Task TrimStreamsAsync(int maxMessages, CancellationToken cancellationToken)
    {
        var server = _redisConnectionFactory.GetServer();
        foreach (var pattern in StreamKeys.GetStreamScanPatterns())
        {
            foreach (var redisKey in server.Keys(pattern: pattern))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var streamKey = redisKey.ToString();
                try
                {
                    await _messageQueue.TrimStreamAsync(streamKey, maxMessages, cancellationToken).ConfigureAwait(false);
                    _logger.LogDebug("Trimmed stream {StreamKey} to max {MaxMessages} messages", streamKey, maxMessages);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to trim stream {StreamKey}", streamKey);
                }
            }
        }
    }
}

