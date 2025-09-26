using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for interacting with F-List character-data.php API endpoint
/// </summary>
public interface IFListCharacterDataService
{
    /// <summary>
    /// Get character data from F-List API using the character-data.php endpoint
    /// </summary>
    /// <param name="characterName">Name of the character to get data for</param>
    /// <param name="ticket">Authentication ticket from active WebSocket connection</param>
    /// <param name="account">F-Chat account username</param>
    /// <returns>Character data response</returns>
    Task<CharacterDataResponse> GetCharacterDataAsync(string characterName, string ticket, string account);

    /// <summary>
    /// Get character data with human-readable names using mapping service
    /// </summary>
    /// <param name="characterName">Name of the character to get data for</param>
    /// <param name="ticket">Authentication ticket from active WebSocket connection</param>
    /// <param name="account">F-Chat account username</param>
    /// <returns>Character data response with human-readable names</returns>
    Task<CharacterDataResponse> GetCharacterDataWithMappingAsync(string characterName, string ticket, string account);

    /// <summary>
    /// Convert character data response to ProfileData format
    /// </summary>
    /// <param name="characterData">Character data response</param>
    /// <param name="mapping">Mapping data for human-readable names</param>
    /// <returns>ProfileData object</returns>
    ProfileData ConvertToProfileData(CharacterDataResponse characterData, MappingResponse? mapping = null);
}
