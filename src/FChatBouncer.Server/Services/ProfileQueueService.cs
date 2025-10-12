using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for managing profile request queue with database persistence
/// </summary>
public class ProfileQueueService : IProfileQueueService, IDisposable
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ProfileQueueService> _logger;
    private readonly ConcurrentDictionary<string, DateTime> _recentRequests = new();
    private readonly SemaphoreSlim _queueSemaphore = new(1, 1);
    private readonly CancellationTokenSource _cancellationTokenSource = new();

    public ProfileQueueService(IServiceProvider serviceProvider, ILogger<ProfileQueueService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        
        // Clean up old entries periodically
        _ = Task.Run(() => CleanupOldEntries(_cancellationTokenSource.Token));
    }

    public async Task<bool> EnqueueProfileRequestAsync(string userId, string characterName, ProfileRequestType requestType = ProfileRequestType.StaleRefresh, ProfileRequestPriority priority = ProfileRequestPriority.Normal)
    {
        var requestKey = $"{userId}:{characterName}";
        
        try
        {
            await _queueSemaphore.WaitAsync();
            
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            
            // Check if request already exists in queue (pending or processing)
            var existingRequest = await context.ProfileQueueItems
                .FirstOrDefaultAsync(q => q.UserId == userId && 
                                         q.CharacterName == characterName && 
                                         (q.Status == ProfileQueueStatus.Pending || q.Status == ProfileQueueStatus.Processing));
            
            if (existingRequest != null)
            {
                _logger.LogDebug("Profile request already exists in queue for {CharacterName} (User: {UserId})", characterName, userId);
                return false;
            }
            
            // Check recent requests to prevent immediate duplicates
            if (_recentRequests.TryGetValue(requestKey, out var lastRequest))
            {
                var timeSinceLastRequest = DateTime.UtcNow - lastRequest;
                if (timeSinceLastRequest < TimeSpan.FromMinutes(1)) // Prevent duplicates within 1 minute
                {
                    _logger.LogDebug("Profile request too recent for {CharacterName} (User: {UserId}), last request {TimeAgo} ago", 
                        characterName, userId, timeSinceLastRequest);
                    return false;
                }
            }
            
            // Create new queue item
            var queueItem = new ProfileQueueItem
            {
                UserId = userId,
                CharacterName = characterName,
                RequestType = requestType,
                Priority = priority,
                Status = ProfileQueueStatus.Pending,
                RequestedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            
            context.ProfileQueueItems.Add(queueItem);
            await context.SaveChangesAsync();
            
            // Track recent request
            _recentRequests.AddOrUpdate(requestKey, DateTime.UtcNow, (_, _) => DateTime.UtcNow);
            
            _logger.LogInformation("Enqueued profile request for {CharacterName} (User: {UserId}, Type: {RequestType}, Priority: {Priority})", 
                characterName, userId, requestType, priority);
            
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enqueue profile request for {CharacterName} (User: {UserId})", characterName, userId);
            return false;
        }
        finally
        {
            _queueSemaphore.Release();
        }
    }

    public async Task<bool> IsProfileRequestInQueueAsync(string userId, string characterName)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
        
        return await context.ProfileQueueItems
            .AnyAsync(q => q.UserId == userId && 
                          q.CharacterName == characterName && 
                          (q.Status == ProfileQueueStatus.Pending || q.Status == ProfileQueueStatus.Processing));
    }

    public async Task<ProfileQueueItem?> DequeueProfileRequestAsync()
    {
        try
        {
            await _queueSemaphore.WaitAsync();
            
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            
            // Get the highest priority pending item, ordered by priority and requested time
            var nextItem = await context.ProfileQueueItems
                .Where(q => q.Status == ProfileQueueStatus.Pending)
                .OrderByDescending(q => q.Priority)
                .ThenBy(q => q.RequestedAt)
                .FirstOrDefaultAsync();
            
            if (nextItem == null)
            {
                return null;
            }
            
            // Mark as processing
            nextItem.Status = ProfileQueueStatus.Processing;
            nextItem.UpdatedAt = DateTime.UtcNow;
            await context.SaveChangesAsync();
            
            _logger.LogDebug("Dequeued profile request for {CharacterName} (User: {UserId}, Priority: {Priority})", 
                nextItem.CharacterName, nextItem.UserId, nextItem.Priority);
            
            return nextItem;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to dequeue profile request");
            return null;
        }
        finally
        {
            _queueSemaphore.Release();
        }
    }

    public async Task CompleteProfileRequestAsync(ProfileQueueItem queueItem)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            
            // Re-attach the entity to the new context
            context.Attach(queueItem);
            queueItem.Status = ProfileQueueStatus.Completed;
            queueItem.ProcessedAt = DateTime.UtcNow;
            queueItem.UpdatedAt = DateTime.UtcNow;
            
            await context.SaveChangesAsync();
            
            _logger.LogInformation("Completed profile request for {CharacterName} (User: {UserId})", 
                queueItem.CharacterName, queueItem.UserId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to complete profile request for {CharacterName} (User: {UserId})", 
                queueItem.CharacterName, queueItem.UserId);
        }
    }

    public async Task FailProfileRequestAsync(ProfileQueueItem queueItem, string errorMessage)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            
            // Re-attach the entity to the new context
            context.Attach(queueItem);
            queueItem.RetryCount++;
            queueItem.ErrorMessage = errorMessage;
            queueItem.UpdatedAt = DateTime.UtcNow;
            
            if (queueItem.RetryCount >= queueItem.MaxRetries)
            {
                queueItem.Status = ProfileQueueStatus.Failed;
                _logger.LogWarning("Profile request failed permanently for {CharacterName} (User: {UserId}) after {RetryCount} retries: {ErrorMessage}", 
                    queueItem.CharacterName, queueItem.UserId, queueItem.RetryCount, errorMessage);
            }
            else
            {
                queueItem.Status = ProfileQueueStatus.Pending;
                _logger.LogWarning("Profile request failed for {CharacterName} (User: {UserId}), retry {RetryCount}/{MaxRetries}: {ErrorMessage}", 
                    queueItem.CharacterName, queueItem.UserId, queueItem.RetryCount, queueItem.MaxRetries, errorMessage);
            }
            
            await context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update failed profile request for {CharacterName} (User: {UserId})", 
                queueItem.CharacterName, queueItem.UserId);
        }
    }

    public async Task<ProfileQueueStats> GetQueueStatsAsync()
    {
        var stats = new ProfileQueueStats();
        
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            
            var allItems = await context.ProfileQueueItems.ToListAsync();
            
            stats.TotalItems = allItems.Count;
            stats.PendingItems = allItems.Count(q => q.Status == ProfileQueueStatus.Pending);
            stats.ProcessingItems = allItems.Count(q => q.Status == ProfileQueueStatus.Processing);
            stats.CompletedItems = allItems.Count(q => q.Status == ProfileQueueStatus.Completed);
            stats.FailedItems = allItems.Count(q => q.Status == ProfileQueueStatus.Failed);
            stats.CancelledItems = allItems.Count(q => q.Status == ProfileQueueStatus.Cancelled);
            
            var oldestPending = allItems
                .Where(q => q.Status == ProfileQueueStatus.Pending)
                .OrderBy(q => q.RequestedAt)
                .FirstOrDefault();
            stats.OldestPendingItem = oldestPending?.RequestedAt;
            
            var lastProcessed = allItems
                .Where(q => q.ProcessedAt.HasValue)
                .OrderByDescending(q => q.ProcessedAt)
                .FirstOrDefault();
            stats.LastProcessedItem = lastProcessed?.ProcessedAt;
            
            // Calculate average processing time
            var completedItems = allItems
                .Where(q => q.Status == ProfileQueueStatus.Completed && q.ProcessedAt.HasValue)
                .ToList();
            
            if (completedItems.Any())
            {
                var totalProcessingTime = completedItems.Sum(q => (q.ProcessedAt!.Value - q.RequestedAt).TotalMilliseconds);
                stats.AverageProcessingTime = TimeSpan.FromMilliseconds(totalProcessingTime / completedItems.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get queue statistics");
        }
        
        return stats;
    }

    public async Task CleanupQueueAsync()
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            
            var cutoffDate = DateTime.UtcNow.AddDays(-7); // Keep items for 7 days
            var itemsToRemove = await context.ProfileQueueItems
                .Where(q => (q.Status == ProfileQueueStatus.Completed || q.Status == ProfileQueueStatus.Failed || q.Status == ProfileQueueStatus.Cancelled) &&
                           q.UpdatedAt < cutoffDate)
                .ToListAsync();
            
            if (itemsToRemove.Any())
            {
                context.ProfileQueueItems.RemoveRange(itemsToRemove);
                await context.SaveChangesAsync();
                
                _logger.LogInformation("Cleaned up {Count} old queue items", itemsToRemove.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cleanup queue");
        }
    }

    public async Task<bool> CancelProfileRequestAsync(string userId, string characterName)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            
            var queueItem = await context.ProfileQueueItems
                .FirstOrDefaultAsync(q => q.UserId == userId && 
                                         q.CharacterName == characterName && 
                                         q.Status == ProfileQueueStatus.Pending);
            
            if (queueItem != null)
            {
                queueItem.Status = ProfileQueueStatus.Cancelled;
                queueItem.UpdatedAt = DateTime.UtcNow;
                await context.SaveChangesAsync();
                
                _logger.LogInformation("Cancelled profile request for {CharacterName} (User: {UserId})", characterName, userId);
                return true;
            }
            
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cancel profile request for {CharacterName} (User: {UserId})", characterName, userId);
            return false;
        }
    }

    private async Task CleanupOldEntries(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromHours(1), cancellationToken); // Clean up every hour
                await CleanupQueueAsync();
                
                // Clean up recent requests dictionary
                var cutoff = DateTime.UtcNow.AddHours(-1);
                var keysToRemove = _recentRequests
                    .Where(kvp => kvp.Value < cutoff)
                    .Select(kvp => kvp.Key)
                    .ToList();
                
                foreach (var key in keysToRemove)
                {
                    _recentRequests.TryRemove(key, out _);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected when cancellation is requested
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during queue cleanup");
            }
        }
    }

    public void Dispose()
    {
        _cancellationTokenSource?.Cancel();
        _cancellationTokenSource?.Dispose();
        _queueSemaphore?.Dispose();
    }
}
