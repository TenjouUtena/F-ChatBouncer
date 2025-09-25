using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service interface for managing unified character data across all connections.
/// This service consolidates character information from multiple sources and provides
/// a single source of truth for character data.
/// </summary>
public interface ICharacterService
{
    #region Character Management

    /// <summary>
    /// Get or create a character by name. Characters are shared across all connections.
    /// </summary>
    Task<Character> GetOrCreateCharacterAsync(string characterName);

    /// <summary>
    /// Get a character by name
    /// </summary>
    Task<Character?> GetCharacterAsync(string characterName);

    /// <summary>
    /// Get a character by ID
    /// </summary>
    Task<Character?> GetCharacterByIdAsync(int characterId);

    /// <summary>
    /// Update character status information
    /// </summary>
    Task UpdateCharacterStatusAsync(string characterName, string status, string? statusMessage = null, bool isOnline = true);

    /// <summary>
    /// Update character gender information
    /// </summary>
    Task UpdateCharacterGenderAsync(string characterName, string gender);

    /// <summary>
    /// Update character profile information
    /// </summary>
    Task UpdateCharacterProfileAsync(string characterName, ProfileData profileData);

    /// <summary>
    /// Update character profile from raw data
    /// </summary>
    Task UpdateCharacterProfileAsync(string characterName, string profileData, string? rawProData = null);

    /// <summary>
    /// Get character profile data
    /// </summary>
    Task<ProfileData?> GetCharacterProfileAsync(string characterName);

    /// <summary>
    /// Search for characters by name (partial match)
    /// </summary>
    Task<List<Character>> SearchCharactersAsync(string searchTerm, int limit = 50);

    /// <summary>
    /// Get all characters that are currently online
    /// </summary>
    Task<List<Character>> GetOnlineCharactersAsync();

    /// <summary>
    /// Get characters by status
    /// </summary>
    Task<List<Character>> GetCharactersByStatusAsync(string status);

    #endregion

    #region Character Connections

    /// <summary>
    /// Create or update a character connection for a user
    /// </summary>
    Task<CharacterConnection> CreateOrUpdateCharacterConnectionAsync(string userId, string characterName, string fchatUsername, string fchatPassword);

    /// <summary>
    /// Get all character connections for a user
    /// </summary>
    Task<List<CharacterConnection>> GetUserCharacterConnectionsAsync(string userId);

    /// <summary>
    /// Get a specific character connection for a user
    /// </summary>
    Task<CharacterConnection?> GetCharacterConnectionAsync(string userId, string characterName);

    /// <summary>
    /// Set the active character for a user
    /// </summary>
    Task SetActiveCharacterAsync(string userId, string characterName);

    /// <summary>
    /// Get the active character for a user
    /// </summary>
    Task<Character?> GetActiveCharacterAsync(string userId);

    /// <summary>
    /// Update character connection status
    /// </summary>
    Task UpdateCharacterConnectionStatusAsync(string userId, string characterName, bool isConnected);

    /// <summary>
    /// Remove a character connection
    /// </summary>
    Task RemoveCharacterConnectionAsync(string userId, string characterName);

    #endregion

    #region Channel Management

    /// <summary>
    /// Add a character to a channel
    /// </summary>
    Task AddCharacterToChannelAsync(string userId, string characterName, string channelId);

    /// <summary>
    /// Remove a character from a channel
    /// </summary>
    Task RemoveCharacterFromChannelAsync(string userId, string characterName, string channelId);

    /// <summary>
    /// Get all channels a character is in
    /// </summary>
    Task<List<string>> GetCharacterChannelsAsync(string userId, string characterName);

    /// <summary>
    /// Get all characters in a specific channel
    /// </summary>
    Task<List<Character>> GetChannelCharactersAsync(string channelId);

    /// <summary>
    /// Get channel membership details for a character
    /// </summary>
    Task<List<CharacterChannel>> GetCharacterChannelMembershipsAsync(string userId, string characterName);

    #endregion

    #region Character Discovery

    /// <summary>
    /// Discover a character from F-Chat data (status, profile, etc.)
    /// </summary>
    Task<Character> DiscoverCharacterAsync(string characterName, string status = "online", string? statusMessage = null, string gender = "None");

    /// <summary>
    /// Update character information from F-Chat character data
    /// </summary>
    Task UpdateCharacterFromFChatDataAsync(string characterName, FChatCharacter fchatCharacter);

    /// <summary>
    /// Update character information from channel character data
    /// </summary>
    Task UpdateCharacterFromChannelDataAsync(string characterName, ChannelCharacter channelCharacter);

    #endregion

    #region Bulk Operations

    /// <summary>
    /// Get multiple characters by name
    /// </summary>
    Task<List<Character>> GetCharactersAsync(IEnumerable<string> characterNames);

    /// <summary>
    /// Update multiple character statuses
    /// </summary>
    Task UpdateCharacterStatusesAsync(Dictionary<string, (string status, string? statusMessage, bool isOnline)> characterUpdates);

    /// <summary>
    /// Clean up orphaned character data
    /// </summary>
    Task CleanupOrphanedCharactersAsync();

    #endregion

    #region Diagnostic Methods

    /// <summary>
    /// Get total count of characters in the database
    /// </summary>
    Task<int> GetTotalCharacterCountAsync();

    /// <summary>
    /// Get characters that have profile data
    /// </summary>
    Task<List<Character>> GetCharactersWithProfilesAsync();

    /// <summary>
    /// Get characters updated within the last N hours
    /// </summary>
    Task<List<Character>> GetRecentlyUpdatedCharactersAsync(int hours);

    /// <summary>
    /// Get all character connections for a specific character
    /// </summary>
    Task<List<CharacterConnection>> GetCharacterConnectionsAsync(string characterName);

    /// <summary>
    /// Get all channels for a specific character
    /// </summary>
    Task<List<string>> GetCharacterChannelsAsync(string characterName);

    #endregion
}
