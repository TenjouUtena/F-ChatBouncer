using FChatBouncer.Server.Metrics;
using Microsoft.EntityFrameworkCore;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Background service that periodically collects and updates system metrics
/// </summary>
public class MetricsCollectionService : BackgroundService
{
    private readonly ILogger<MetricsCollectionService> _logger;
    private readonly IServiceProvider _serviceProvider;
    private const int UpdateIntervalSeconds = 15; // Update metrics every 15 seconds

    public MetricsCollectionService(ILogger<MetricsCollectionService> logger, IServiceProvider serviceProvider)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Metrics Collection Service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CollectMetricsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error collecting metrics");
            }

            await Task.Delay(TimeSpan.FromSeconds(UpdateIntervalSeconds), stoppingToken);
        }

        _logger.LogInformation("Metrics Collection Service stopped");
    }

    private async Task CollectMetricsAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Data.BouncerDbContext>();

        // Update system metrics
        ApplicationMetrics.UpdateSystemMetrics();

        // Update connection metrics
        var activeCharacterConnections = await dbContext.CharacterConnections
            .Where(cc => cc.IsConnected)
            .CountAsync(cancellationToken);
        ApplicationMetrics.ActiveCharacterConnections.Set(activeCharacterConnections);

        // Update active user sessions
        var activeUserSessions = await dbContext.UserSessions
            .Where(s => s.Status == Models.SessionStatus.Connected)
            .CountAsync(cancellationToken);
        ApplicationMetrics.ActiveUserSessions.Set(activeUserSessions);

        // Update message queue depth (count messages queued in last 24 hours that haven't been retried too many times)
        var queuedMessages = await dbContext.QueuedMessages
            .Where(qm => qm.QueuedAt > DateTime.UtcNow.AddDays(-1) && qm.RetryCount < 5)
            .CountAsync(cancellationToken);
        ApplicationMetrics.MessageQueueDepth.Set(queuedMessages);

        // Update profile queue depth
        var profileQueueDepth = await dbContext.ProfileQueueItems
            .Where(pq => pq.Status == Models.ProfileQueueStatus.Pending || pq.Status == Models.ProfileQueueStatus.Processing)
            .CountAsync(cancellationToken);
        ApplicationMetrics.ProfileQueueDepth.Set(profileQueueDepth);

        _logger.LogDebug("Metrics collected: {ActiveConnections} character connections, {ActiveSessions} user sessions, {MessageQueue} messages queued, {ProfileQueue} profiles queued",
            activeCharacterConnections, activeUserSessions, queuedMessages, profileQueueDepth);
    }
}

