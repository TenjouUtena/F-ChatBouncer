using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for managing profile request queue
/// </summary>
public interface IProfileQueueService
{
    /// <summary>
    /// Add a profile request to the queue
    /// </summary>
    /// <param name="userId">User ID</param>
    /// <param name="characterName">Character name</param>
    /// <param name="requestType">Type of request</param>
    /// <param name="priority">Priority level</param>
    /// <returns>True if added to queue, false if duplicate exists</returns>
    Task<bool> EnqueueProfileRequestAsync(string userId, string characterName, ProfileRequestType requestType = ProfileRequestType.StaleRefresh, ProfileRequestPriority priority = ProfileRequestPriority.Normal);
    
    /// <summary>
    /// Check if a profile request already exists in the queue
    /// </summary>
    /// <param name="userId">User ID</param>
    /// <param name="characterName">Character name</param>
    /// <returns>True if request exists in queue</returns>
    Task<bool> IsProfileRequestInQueueAsync(string userId, string characterName);
    
    /// <summary>
    /// Get the next profile request to process
    /// </summary>
    /// <returns>Next queue item or null if queue is empty</returns>
    Task<ProfileQueueItem?> DequeueProfileRequestAsync();
    
    /// <summary>
    /// Mark a profile request as completed
    /// </summary>
    /// <param name="queueItem">Queue item to mark as completed</param>
    Task CompleteProfileRequestAsync(ProfileQueueItem queueItem);
    
    /// <summary>
    /// Mark a profile request as failed and potentially retry
    /// </summary>
    /// <param name="queueItem">Queue item that failed</param>
    /// <param name="errorMessage">Error message</param>
    Task FailProfileRequestAsync(ProfileQueueItem queueItem, string errorMessage);
    
    /// <summary>
    /// Get queue statistics
    /// </summary>
    /// <returns>Queue statistics</returns>
    Task<ProfileQueueStats> GetQueueStatsAsync();
    
    /// <summary>
    /// Clear all completed and failed items from the queue
    /// </summary>
    Task CleanupQueueAsync();
    
    /// <summary>
    /// Cancel a specific profile request
    /// </summary>
    /// <param name="userId">User ID</param>
    /// <param name="characterName">Character name</param>
    /// <returns>True if cancelled</returns>
    Task<bool> CancelProfileRequestAsync(string userId, string characterName);
}

/// <summary>
/// Statistics about the profile queue
/// </summary>
public class ProfileQueueStats
{
    public int TotalItems { get; set; }
    public int PendingItems { get; set; }
    public int ProcessingItems { get; set; }
    public int CompletedItems { get; set; }
    public int FailedItems { get; set; }
    public int CancelledItems { get; set; }
    public DateTime? OldestPendingItem { get; set; }
    public DateTime? LastProcessedItem { get; set; }
    public TimeSpan AverageProcessingTime { get; set; }
}

