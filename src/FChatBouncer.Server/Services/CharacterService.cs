using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for managing unified character data across all connections.
/// This service consolidates character information from multiple sources and provides
/// a single source of truth for character data.
/// </summary>
public class CharacterService : ICharacterService
{
    private readonly BouncerDbContext _context;
    private readonly ILogger<CharacterService> _logger;

    public CharacterService(BouncerDbContext context, ILogger<CharacterService> logger)
    {
        _context = context;
        _logger = logger;
    }

    #region Character Management

    public async Task<Character> GetOrCreateCharacterAsync(string characterName)
    {
        // Use AsTracking() because this character will likely be modified
        var character = await _context.Characters
            .AsTracking()
            .FirstOrDefaultAsync(c => c.Name == characterName);

        if (character != null)
        {
            return character;
        }

        // ON CONFLICT DO NOTHING makes concurrent creation of the same name safe;
        // whichever insert wins, the row exists afterwards.
        var now = DateTime.UtcNow;
        await _context.Database.ExecuteSqlRawAsync(@"
            INSERT INTO ""Characters"" (""Name"", ""Status"", ""Gender"", ""FirstSeen"", ""LastSeen"", ""IsOnline"")
            VALUES (@name, 'offline', 'None', @now, @now, false)
            ON CONFLICT (""Name"") DO NOTHING",
            new NpgsqlParameter("@name", characterName),
            new NpgsqlParameter("@now", now));

        return await _context.Characters
            .AsTracking()
            .FirstAsync(c => c.Name == characterName);
    }

    public async Task<Character?> GetCharacterAsync(string characterName)
    {
        return await _context.Characters
            .FirstOrDefaultAsync(c => c.Name == characterName);
    }

    public async Task<Character?> GetCharacterByIdAsync(int characterId)
    {
        return await _context.Characters
            .FirstOrDefaultAsync(c => c.Id == characterId);
    }

    public async Task UpdateCharacterStatusAsync(string characterName, string status, string? statusMessage = null, bool isOnline = true)
    {
        _logger.LogDebug("Updating character status: {CharacterName} -> {Status} ({StatusMessage}) [Online: {IsOnline}]", 
            characterName, status, statusMessage, isOnline);

        var character = await GetOrCreateCharacterAsync(characterName);
        character.UpdateStatus(status, statusMessage, isOnline);

        await _context.SaveChangesAsync();
    }

    public async Task UpdateCharacterGenderAsync(string characterName, string gender)
    {
        if (string.IsNullOrEmpty(gender) || gender == "None")
        {
            _logger.LogDebug("Skipping gender update for {CharacterName}: invalid gender value '{Gender}'", characterName, gender);
            return;
        }

        _logger.LogDebug("Updating character gender: {CharacterName} -> {Gender}", characterName, gender);

        var character = await GetOrCreateCharacterAsync(characterName);
        character.Gender = gender;
        await _context.SaveChangesAsync();
    }

    public async Task<List<Character>> SearchCharactersAsync(string searchTerm, int limit = 50)
    {
        return await _context.Characters
            .Where(c => c.Name.Contains(searchTerm))
            .OrderBy(c => c.Name)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<List<Character>> GetOnlineCharactersAsync()
    {
        return await _context.Characters
            .Where(c => c.IsOnline)
            .OrderBy(c => c.Name)
            .ToListAsync();
    }

    public async Task<List<Character>> GetCharactersByStatusAsync(string status)
    {
        return await _context.Characters
            .Where(c => c.Status == status)
            .OrderBy(c => c.Name)
            .ToListAsync();
    }

    #endregion

    #region Character Connections

    public async Task<CharacterConnection> CreateOrUpdateCharacterConnectionAsync(string userId, string characterName, string fchatUsername)
    {
        _logger.LogDebug("Creating or updating character connection: {UserId} -> {CharacterName}", userId, characterName);

        // First ensure the character exists
        var character = await GetOrCreateCharacterAsync(characterName);

        // Check if connection already exists
        var connection = await _context.CharacterConnections
            .AsTracking()
            .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.CharacterId == character.Id);

        if (connection == null)
        {
            _logger.LogInformation("Creating new character connection: {UserId} -> {CharacterName}", userId, characterName);
            connection = new CharacterConnection
            {
                UserId = userId,
                CharacterId = character.Id,
                FChatUsername = fchatUsername,
                CreatedAt = DateTime.UtcNow,
                LastActivityAt = DateTime.UtcNow
            };

            _context.CharacterConnections.Add(connection);
            _logger.LogInformation("Added CharacterConnection entity to context with Id {ConnectionId} (will be generated on save)", connection.Id);
        }
        else
        {
            _logger.LogDebug("Updating existing character connection: {UserId} -> {CharacterName}. Current state: IsActive={IsActive}, IsConnected={IsConnected}",
                userId, characterName, connection.IsActive, connection.IsConnected);
            connection.FChatUsername = fchatUsername;
            connection.LastActivityAt = DateTime.UtcNow;
        }

        try
        {
            var affectedRows = await _context.SaveChangesAsync();
            _logger.LogInformation("Character connection upsert saved for {UserId}/{CharacterName}. Rows affected: {AffectedRows}. New state -> Id={ConnectionId}, IsActive={IsActive}, IsConnected={IsConnected}",
                userId, characterName, affectedRows, connection.Id, connection.IsActive, connection.IsConnected);
            return connection;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} connection was updated by another thread, skipping duplicate connection creation", characterName);
            // Return the existing connection
            var existingConnection = await _context.CharacterConnections
                .AsTracking()
                .Include(cc => cc.Character)
                .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.CharacterId == character.Id);
            _logger.LogInformation("Returning existing character connection after duplicate insert attempt. State -> Id={ConnectionId}, IsActive={IsActive}, IsConnected={IsConnected}",
                existingConnection?.Id, existingConnection?.IsActive, existingConnection?.IsConnected);
            return existingConnection;
        }
    }

    public async Task<List<CharacterConnection>> GetUserCharacterConnectionsAsync(string userId)
    {
        return await _context.CharacterConnections
            .AsNoTracking()
            .Include(cc => cc.Character)
            .Where(cc => cc.UserId == userId)
            .OrderBy(cc => cc.Character.Name)
            .ToListAsync();
    }

    public async Task<CharacterConnection?> GetCharacterConnectionAsync(string userId, string characterName)
    {
        return await _context.CharacterConnections
            .AsTracking()
            .Include(cc => cc.Character)
            .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.Character.Name == characterName);
    }

    public async Task SetActiveCharacterAsync(string userId, string characterName)
    {
        _logger.LogInformation("Setting active character for user {UserId}: {CharacterName}", userId, characterName);

        // Get all character connections for the user
        var connections = await _context.CharacterConnections
            .AsTracking()
            .Include(cc => cc.Character)
            .Where(cc => cc.UserId == userId)
            .ToListAsync();

        _logger.LogDebug("Found {ConnectionCount} character connections for user {UserId}: {ConnectionSummaries}",
            connections.Count,
            userId,
            string.Join(", ", connections.Select(c => $"{c.Character?.Name ?? "<unknown>"}(Active={c.IsActive},Connected={c.IsConnected})")));

        // Set all connections as inactive first
        foreach (var connection in connections)
        {
            connection.IsActive = false;
        }

        // Set the specified character as active
        var targetConnection = connections.FirstOrDefault(cc => cc.Character.Name == characterName);
        if (targetConnection != null)
        {
            targetConnection.IsActive = true;
            targetConnection.LastActivityAt = DateTime.UtcNow;
            _logger.LogInformation("Successfully set character {CharacterName} as active for user {UserId}", characterName, userId);
        }
        else
        {
            _logger.LogWarning("Character {CharacterName} not found for user {UserId}. Available characters: {AvailableCharacters}",
                characterName, userId, string.Join(", ", connections.Select(c => c.Character.Name)));

            // If the requested character is not found, try to use the first available character
            if (connections.Count > 0)
            {
                var fallbackConnection = connections.First();
                fallbackConnection.IsActive = true;
                fallbackConnection.LastActivityAt = DateTime.UtcNow;
                _logger.LogInformation("Using fallback character {FallbackCharacter} as active for user {UserId}",
                    fallbackConnection.Character.Name, userId);
            }
        }

        try
        {
            var affected = await _context.SaveChangesAsync();
            _logger.LogInformation("SetActiveCharacterAsync saved changes for user {UserId}. Rows affected: {Affected}. Active connections now: {ActiveList}",
                userId,
                affected,
                string.Join(", ", connections.Where(c => c.IsActive).Select(c => c.Character.Name)));
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was updated by another thread during active character setting", characterName);
        }
    }

    public async Task<Character?> GetActiveCharacterAsync(string userId)
    {
        _logger.LogDebug("Getting active character for user {UserId}", userId);
        
        // Get all connections for this user for debugging
        var allConnections = await _context.CharacterConnections
            .Include(cc => cc.Character)
            .Where(cc => cc.UserId == userId)
            .ToListAsync();
            
        _logger.LogInformation("User {UserId} has {ConnectionCount} total connections. Active connections: {ActiveConnections}", 
            userId, allConnections.Count, string.Join(", ", allConnections.Where(c => c.IsActive).Select(c => c.Character?.Name ?? "null")));
        
        var activeConnection = await _context.CharacterConnections
            .Include(cc => cc.Character)
            .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.IsActive);

        if (activeConnection != null)
        {
            _logger.LogDebug("Found active character {CharacterName} for user {UserId}", activeConnection.Character?.Name, userId);
        }
        else
        {
            _logger.LogWarning("No active character found for user {UserId}", userId);
        }

        return activeConnection?.Character;
    }

    public async Task UpdateCharacterConnectionStatusAsync(string userId, string characterName, bool isConnected)
    {
        var connection = await GetCharacterConnectionAsync(userId, characterName);
        if (connection != null)
        {
            connection.IsConnected = isConnected;
            connection.LastActivityAt = DateTime.UtcNow;
            if (isConnected)
            {
                connection.ConnectedAt = DateTime.UtcNow;
            }

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
            {
                // Handle unique constraint violation - character was created/updated by another thread
                _logger.LogWarning("Character {CharacterName} connection status was updated by another thread", characterName);
            }
        }
    }

    public async Task RemoveCharacterConnectionAsync(string userId, string characterName)
    {
        var connection = await GetCharacterConnectionAsync(userId, characterName);
        if (connection != null)
        {
            _context.CharacterConnections.Remove(connection);
            try
            {
                await _context.SaveChangesAsync();
                _logger.LogInformation("Removed character connection: {UserId} -> {CharacterName}", userId, characterName);
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
            {
                // Handle unique constraint violation - character was created/updated by another thread
                _logger.LogWarning("Character {CharacterName} connection removal was updated by another thread", characterName);
            }
        }
    }

    #endregion

    #region Channel Management

    public async Task AddCharacterToChannelAsync(string userId, string characterName, string channelId)
    {
        _logger.LogDebug("Adding character to channel: {CharacterName} -> {ChannelId}", characterName, channelId);

        // Skip PRI channels (private messages) - these are not actual channels that can be joined
        if (channelId.StartsWith("PRI-", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogDebug("Skipping PRI channel '{ChannelId}' for character {CharacterName} - private messages are not stored as channel memberships", channelId, characterName);
            return;
        }

        // Validate channel name
        if (string.IsNullOrWhiteSpace(channelId) || channelId.Length > 100)
        {
            _logger.LogWarning("Invalid channel name '{ChannelId}' for character {CharacterName} - skipping", channelId, characterName);
            return;
        }

        var connection = await GetCharacterConnectionAsync(userId, characterName);
        if (connection == null)
        {
            _logger.LogWarning("Character connection not found: {UserId} -> {CharacterName}", userId, characterName);
            return;
        }

        // Check if already in channel
        var existingChannel = await _context.CharacterChannels
            .FirstOrDefaultAsync(cc => cc.CharacterConnectionId == connection.Id && cc.ChannelId == channelId);

        if (existingChannel == null)
        {
            var characterChannel = new CharacterChannel
            {
                CharacterConnectionId = connection.Id,
                ChannelId = channelId,
                JoinedAt = DateTime.UtcNow,
                LastActivityAt = DateTime.UtcNow
            };

            _context.CharacterChannels.Add(characterChannel);
            try
            {
                await _context.SaveChangesAsync();
                _logger.LogDebug("Added character {CharacterName} to channel {ChannelId}", characterName, channelId);
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
            {
                // Handle unique constraint violation - character was created/updated by another thread
                _logger.LogWarning("Character {CharacterName} channel membership was updated by another thread", characterName);
            }
        }
    }

    public async Task RemoveCharacterFromChannelAsync(string userId, string characterName, string channelId)
    {
        _logger.LogDebug("Removing character from channel: {CharacterName} -> {ChannelId}", characterName, channelId);

        var connection = await GetCharacterConnectionAsync(userId, characterName);
        if (connection == null)
        {
            _logger.LogWarning("Character connection not found: {UserId} -> {CharacterName}", userId, characterName);
            return;
        }

        var characterChannel = await _context.CharacterChannels
            .FirstOrDefaultAsync(cc => cc.CharacterConnectionId == connection.Id && cc.ChannelId == channelId);

        if (characterChannel != null)
        {
            _context.CharacterChannels.Remove(characterChannel);
            try
            {
                await _context.SaveChangesAsync();
                _logger.LogDebug("Removed character {CharacterName} from channel {ChannelId}", characterName, channelId);
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
            {
                // Handle unique constraint violation - character was created/updated by another thread
                _logger.LogWarning("Character {CharacterName} channel removal was updated by another thread", characterName);
            }
        }
    }

    public async Task<List<string>> GetCharacterChannelsAsync(string userId, string characterName)
    {
        var connection = await GetCharacterConnectionAsync(userId, characterName);
        if (connection == null)
        {
            return new List<string>();
        }

        return await _context.CharacterChannels
            .Where(cc => cc.CharacterConnectionId == connection.Id)
            .Select(cc => cc.ChannelId)
            .ToListAsync();
    }

    public async Task<List<Character>> GetChannelCharactersAsync(string channelId)
    {
        return await _context.Characters
            .Where(c => c.Channels.Any(ch => ch.ChannelId == channelId))
            .OrderBy(c => c.Name)
            .ToListAsync();
    }

    public async Task<List<CharacterChannel>> GetCharacterChannelMembershipsAsync(string userId, string characterName)
    {
        var connection = await GetCharacterConnectionAsync(userId, characterName);
        if (connection == null)
        {
            return new List<CharacterChannel>();
        }

        return await _context.CharacterChannels
            .Where(cc => cc.CharacterConnectionId == connection.Id)
            .OrderBy(cc => cc.ChannelId)
            .ToListAsync();
    }

    #endregion

    #region Character Discovery

    public async Task UpdateCharacterPresenceAsync(string characterName, string status, string? statusMessage, string? gender, DateTime lastSeen)
    {
        var character = await GetOrCreateCharacterAsync(characterName);

        // Characters reported by LIS/NLN/ICH are online by definition
        character.UpdateStatus(status, statusMessage, true);

        if (!string.IsNullOrEmpty(gender) && gender != "None")
        {
            character.Gender = gender;
        }

        character.LastSeen = lastSeen;
        await _context.SaveChangesAsync();
    }

    #endregion

    #region Bulk Operations

    public async Task<List<Character>> GetCharactersAsync(IEnumerable<string> characterNames)
    {
        var names = characterNames.ToList();
        return await _context.Characters
            .Where(c => names.Contains(c.Name))
            .ToListAsync();
    }

    #endregion
}
