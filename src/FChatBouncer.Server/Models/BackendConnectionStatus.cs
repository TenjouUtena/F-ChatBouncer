namespace FChatBouncer.Server.Models;

/// <summary>
/// Represents the connection status of the backend to F-List servers
/// </summary>
public enum BackendConnectionStatus
{
    /// <summary>
    /// Character is connected to F-List servers
    /// </summary>
    Connected,
    
    /// <summary>
    /// Character is not connected to F-List servers
    /// </summary>
    NotConnected,
    
    /// <summary>
    /// User is logged into bouncer but hasn't selected a character yet,
    /// or a character switch is in progress
    /// </summary>
    WaitingForCharacter,
    
    /// <summary>
    /// Missing F-Chat credentials needed to establish connection
    /// </summary>
    NeedsCredentials
}

