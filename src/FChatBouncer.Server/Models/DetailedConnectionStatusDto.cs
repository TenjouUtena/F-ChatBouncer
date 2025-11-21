namespace FChatBouncer.Server.Models;

/// <summary>
/// Detailed connection status information for the frontend
/// </summary>
public class DetailedConnectionStatusDto
{
    /// <summary>
    /// Backend connection status
    /// </summary>
    public BackendConnectionStatus BackendStatus { get; set; }
    
    /// <summary>
    /// Name of the currently active character (if any)
    /// </summary>
    public string? CharacterName { get; set; }
    
    /// <summary>
    /// Last activity timestamp
    /// </summary>
    public DateTime? LastActivity { get; set; }
    
    /// <summary>
    /// Whether the character is actually connected to F-List
    /// </summary>
    public bool IsConnectedToFChat { get; set; }
    
    /// <summary>
    /// Whether user has F-Chat credentials stored
    /// </summary>
    public bool HasCredentials { get; set; }
    
    /// <summary>
    /// Additional status message
    /// </summary>
    public string? StatusMessage { get; set; }
    
    /// <summary>
    /// Timestamp of this status report
    /// </summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

