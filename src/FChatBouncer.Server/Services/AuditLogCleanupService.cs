using Microsoft.Extensions.Options;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Background service for cleaning up old audit logs
/// </summary>
public class AuditLogCleanupService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AuditLogCleanupService> _logger;
    private readonly int _retentionDays;
    private readonly string _cleanupSchedule;
    
    public AuditLogCleanupService(
        IServiceProvider serviceProvider,
        ILogger<AuditLogCleanupService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _retentionDays = configuration.GetValue<int>("AuditLog:RetentionDays", 90);
        _cleanupSchedule = configuration.GetValue<string>("AuditLog:CleanupSchedule") ?? "0 2 * * *"; // 2 AM daily
        
        _logger.LogInformation("AuditLogCleanupService configured with retention of {RetentionDays} days", _retentionDays);
    }
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AuditLogCleanupService started");
        
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Calculate next cleanup time (2 AM)
                var now = DateTime.Now;
                var nextRun = now.Date.AddDays(1).AddHours(2); // Next 2 AM
                
                // If it's past 2 AM today and we haven't run yet, run now
                var today2AM = now.Date.AddHours(2);
                if (now < today2AM)
                {
                    nextRun = today2AM; // Run at 2 AM today
                }
                
                var delay = nextRun - now;
                _logger.LogInformation("Next audit log cleanup scheduled for {NextRun} (in {Delay})",
                    nextRun, delay);
                
                await Task.Delay(delay, stoppingToken);
                
                if (!stoppingToken.IsCancellationRequested)
                {
                    await CleanupOldLogsAsync();
                }
            }
            catch (OperationCanceledException)
            {
                // Expected when stopping
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in audit log cleanup service");
                // Wait 1 hour before retry on error
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
        }
        
        _logger.LogInformation("AuditLogCleanupService stopped");
    }
    
    private async Task CleanupOldLogsAsync()
    {
        try
        {
            _logger.LogInformation("Starting audit log cleanup (retention: {RetentionDays} days)", _retentionDays);
            
            using var scope = _serviceProvider.CreateScope();
            var auditLogService = scope.ServiceProvider.GetRequiredService<IAuditLogService>();
            
            var deletedCount = await auditLogService.DeleteOldLogsAsync(_retentionDays);
            
            if (deletedCount > 0)
            {
                _logger.LogInformation("Audit log cleanup completed. Deleted {DeletedCount} old log entries", deletedCount);
            }
            else
            {
                _logger.LogInformation("Audit log cleanup completed. No old logs to delete");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clean up old audit logs");
        }
    }
}

