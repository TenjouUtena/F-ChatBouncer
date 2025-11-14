using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Background service that processes profile requests from the queue with 30-second delays
/// </summary>
public class ProfileQueueProcessor : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ProfileQueueProcessor> _logger;
    private readonly TimeSpan _processingDelay = TimeSpan.FromSeconds(30); // 30-second delay between requests

    public ProfileQueueProcessor(
        IServiceProvider serviceProvider,
        ILogger<ProfileQueueProcessor> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ProfileQueueProcessor started");
        
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var queueService = scope.ServiceProvider.GetRequiredService<IProfileQueueService>();
                var profileService = scope.ServiceProvider.GetRequiredService<IProfileService>();
                
                // Get next item from queue
                var queueItem = await queueService.DequeueProfileRequestAsync();
                
                if (queueItem != null)
                {
                    _logger.LogInformation("Processing profile request for {CharacterName} (User: {UserId}, Type: {RequestType}, Priority: {Priority})", 
                        queueItem.CharacterName, queueItem.UserId, queueItem.RequestType, queueItem.Priority);
                    
                    try
                    {
                        // Process the profile request using the new method
                        // Note: ProcessProfileRequestAsync will notify the frontend automatically when the profile is saved
                        await profileService.ProcessProfileRequestAsync(queueItem.UserId, queueItem.CharacterName);
                        
                        // Mark as completed
                        await queueService.CompleteProfileRequestAsync(queueItem);
                        
                        _logger.LogInformation("Successfully processed profile request for {CharacterName} (User: {UserId})", 
                            queueItem.CharacterName, queueItem.UserId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to process profile request for {CharacterName} (User: {UserId})", 
                            queueItem.CharacterName, queueItem.UserId);
                        
                        // Mark as failed and potentially retry
                        await queueService.FailProfileRequestAsync(queueItem, ex.Message);
                    }
                    
                    // Wait 30 seconds before processing next item
                    _logger.LogDebug("Waiting {DelaySeconds} seconds before processing next profile request", _processingDelay.TotalSeconds);
                    await Task.Delay(_processingDelay, stoppingToken);
                }
                else
                {
                    // No items in queue, wait a bit before checking again
                    _logger.LogDebug("No profile requests in queue, waiting 10 seconds before checking again");
                    await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected when cancellation is requested
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in ProfileQueueProcessor");
                
                // Wait a bit before retrying to avoid rapid error loops
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        
        _logger.LogInformation("ProfileQueueProcessor stopped");
    }
}
