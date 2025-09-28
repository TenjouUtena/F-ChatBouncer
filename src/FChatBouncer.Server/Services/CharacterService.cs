using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
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
        _logger.LogDebug("Getting or creating character: {CharacterName}", characterName);

        // First try to get existing character
        var character = await _context.Characters
            .FirstOrDefaultAsync(c => c.Name == characterName);

        if (character == null)
        {
            _logger.LogInformation("Creating new character: {CharacterName}", characterName);
            
            // Use PostgreSQL's ON CONFLICT to handle race conditions at the database level
            try
            {
                // Try to insert the character using raw SQL with ON CONFLICT DO NOTHING
                // This is the most robust way to handle race conditions
                var sql = @"
                    INSERT INTO ""Characters"" (""Name"", ""Status"", ""Gender"", ""FirstSeen"", ""LastSeen"", ""LastUpdated"", ""IsOnline"")
                    VALUES (@name, 'offline', 'None', @now, @now, @now, false)
                    ON CONFLICT (""Name"") DO NOTHING";
                
                var now = DateTime.UtcNow;
                var rowsAffected = await _context.Database.ExecuteSqlRawAsync(sql, 
                    new Npgsql.NpgsqlParameter("@name", characterName),
                    new Npgsql.NpgsqlParameter("@now", now));
                
                if (rowsAffected > 0)
                {
                    // Character was successfully inserted
                    _logger.LogInformation("Successfully created character: {CharacterName}", characterName);
                    character = await _context.Characters
                        .FirstOrDefaultAsync(c => c.Name == characterName);
                }
                else
                {
                    // Character was not inserted (likely due to ON CONFLICT DO NOTHING)
                    // This means another thread created it, so fetch the existing one
                    _logger.LogInformation("Character {CharacterName} was created by another thread, fetching existing", characterName);
                    character = await _context.Characters
                        .FirstOrDefaultAsync(c => c.Name == characterName);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Raw SQL insert failed for character {CharacterName}, falling back to standard approach", characterName);
                
                // Fallback to the original approach with retry logic
                var maxRetries = 3;
                var retryCount = 0;
                
                while (retryCount < maxRetries)
                {
                    try
                    {
                        // Double-check if character was created by another thread
                        character = await _context.Characters
                            .FirstOrDefaultAsync(c => c.Name == characterName);
                        
                        if (character != null)
                        {
                            _logger.LogInformation("Character {CharacterName} was created by another thread, returning existing", characterName);
                            break;
                        }

                        character = new Character
                        {
                            Name = characterName,
                            Status = "offline",
                            Gender = "None",
                            FirstSeen = DateTime.UtcNow,
                            LastSeen = DateTime.UtcNow,
                            LastUpdated = DateTime.UtcNow
                        };

                        _context.Characters.Add(character);
                        await _context.SaveChangesAsync();
                        
                        _logger.LogInformation("Successfully created character: {CharacterName}", characterName);
                        break; // Success, exit retry loop
                    }
                    catch (DbUpdateException ex2) when (ex2.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
                    {
                        // Handle unique constraint violation - character was created by another thread
                        _logger.LogInformation("Character {CharacterName} was created by another thread (attempt {RetryCount}), retrieving existing character", characterName, retryCount + 1);
                        
                        // Clear the context and try to get the character again
                        if (character != null)
                        {
                            _context.Entry(character).State = EntityState.Detached;
                        }
                        
                        // Try to get the existing character
                        character = await _context.Characters
                            .FirstOrDefaultAsync(c => c.Name == characterName);
                        
                        if (character != null)
                        {
                            _logger.LogInformation("Successfully retrieved existing character: {CharacterName}", characterName);
                            break; // Found existing character, exit retry loop
                        }
                        
                        retryCount++;
                        if (retryCount >= maxRetries)
                        {
                            _logger.LogError("Failed to create or retrieve character {CharacterName} after {MaxRetries} attempts", characterName, maxRetries);
                            throw new InvalidOperationException($"Character {characterName} could not be created or retrieved after {maxRetries} attempts");
                        }
                        
                        // Exponential backoff delay before retry
                        await Task.Delay(50 * (int)Math.Pow(2, retryCount));
                    }
                }
            }
        }

        return character!;
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

        try
        {
            await _context.SaveChangesAsync();
            _logger.LogDebug("Successfully updated character {CharacterName}: Status={Status}, Online={IsOnline}", 
                characterName, character.Status, character.IsOnline);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was updated by another thread, skipping duplicate update", characterName);
        }
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
        character.LastUpdated = DateTime.UtcNow;

        try
        {
            await _context.SaveChangesAsync();
            _logger.LogDebug("Successfully updated character {CharacterName}: Gender={Gender}", characterName, character.Gender);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was updated by another thread, skipping duplicate gender update", characterName);
        }
    }

    public async Task UpdateCharacterProfileAsync(string characterName, ProfileData profileData)
    {
        _logger.LogDebug("Updating character profile: {CharacterName} with {ImageCount} images", characterName, profileData.Images.Count);

        var character = await GetOrCreateCharacterAsync(characterName);
        character.SetStructuredProfile(profileData);

        // Also store raw profile data if available
        if (!string.IsNullOrEmpty(character.ProfileData))
        {
            character.ProfileData = JsonSerializer.Serialize(profileData);
        }

        try
        {
            await _context.SaveChangesAsync();
            _logger.LogInformation("Successfully updated character profile for {CharacterName} with {ImageCount} images", characterName, profileData.Images.Count);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was updated by another thread, skipping duplicate profile update", characterName);
        }
    }

    public async Task UpdateCharacterProfileAsync(string characterName, string profileData, string? rawProData = null)
    {
        _logger.LogDebug("Updating character profile from raw data: {CharacterName}", characterName);

        var character = await GetOrCreateCharacterAsync(characterName);
        character.ProfileData = profileData;
        character.RawProData = rawProData;
        character.LastUpdated = DateTime.UtcNow;

        // Try to parse as structured data
        try
        {
            var structuredProfile = JsonSerializer.Deserialize<ProfileData>(profileData);
            if (structuredProfile != null)
            {
                character.SetStructuredProfile(structuredProfile);
            }
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse profile data as structured format for character {CharacterName}", characterName);
        }

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was updated by another thread, skipping duplicate profile update", characterName);
        }
    }

    public async Task<ProfileData?> GetCharacterProfileAsync(string characterName)
    {
        var character = await GetCharacterAsync(characterName);
        var profileData = character?.GetStructuredProfile();
        _logger.LogDebug("Retrieved profile for {CharacterName}: {ImageCount} images", characterName, profileData?.Images.Count ?? 0);
        return profileData;
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

    public async Task<CharacterConnection> CreateOrUpdateCharacterConnectionAsync(string userId, string characterName, string fchatUsername, string fchatPassword)
    {
        _logger.LogDebug("Creating or updating character connection: {UserId} -> {CharacterName}", userId, characterName);

        // First ensure the character exists
        var character = await GetOrCreateCharacterAsync(characterName);

        // Check if connection already exists
        var connection = await _context.CharacterConnections
            .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.CharacterId == character.Id);

        if (connection == null)
        {
            _logger.LogInformation("Creating new character connection: {UserId} -> {CharacterName}", userId, characterName);
            connection = new CharacterConnection
            {
                UserId = userId,
                CharacterId = character.Id,
                FChatUsername = fchatUsername,
                FChatPasswordEncrypted = fchatPassword, // TODO: Encrypt password
                CreatedAt = DateTime.UtcNow,
                LastActivityAt = DateTime.UtcNow
            };

            _context.CharacterConnections.Add(connection);
        }
        else
        {
            _logger.LogDebug("Updating existing character connection: {UserId} -> {CharacterName}", userId, characterName);
            connection.FChatUsername = fchatUsername;
            connection.FChatPasswordEncrypted = fchatPassword; // TODO: Encrypt password
            connection.LastActivityAt = DateTime.UtcNow;
        }

        try
        {
            await _context.SaveChangesAsync();
            return connection;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} connection was updated by another thread, skipping duplicate connection creation", characterName);
            // Return the existing connection
            return await _context.CharacterConnections
                .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.CharacterId == character.Id);
        }
    }

    public async Task<List<CharacterConnection>> GetUserCharacterConnectionsAsync(string userId)
    {
        return await _context.CharacterConnections
            .Include(cc => cc.Character)
            .Where(cc => cc.UserId == userId)
            .OrderBy(cc => cc.Character.Name)
            .ToListAsync();
    }

    public async Task<CharacterConnection?> GetCharacterConnectionAsync(string userId, string characterName)
    {
        return await _context.CharacterConnections
            .Include(cc => cc.Character)
            .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.Character.Name == characterName);
    }

    public async Task SetActiveCharacterAsync(string userId, string characterName)
    {
        _logger.LogInformation("Setting active character for user {UserId}: {CharacterName}", userId, characterName);

        // Get all character connections for the user
        var connections = await _context.CharacterConnections
            .Include(cc => cc.Character)
            .Where(cc => cc.UserId == userId)
            .ToListAsync();

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
                _logger.LogInformation("Using fallback character {FallbackCharacter} as active for user {UserId}", 
                    fallbackConnection.Character.Name, userId);
            }
        }

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was updated by another thread during active character setting", characterName);
        }
    }

    public async Task<Character?> GetActiveCharacterAsync(string userId)
    {
        var activeConnection = await _context.CharacterConnections
            .Include(cc => cc.Character)
            .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.IsActive);

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

    public async Task<Character> DiscoverCharacterAsync(string characterName, string status = "online", string? statusMessage = null, string gender = "None")
    {
        _logger.LogDebug("Discovering character: {CharacterName} (Status: {Status}, Gender: {Gender})", characterName, status, gender);

        var character = await GetOrCreateCharacterAsync(characterName);
        character.UpdateStatus(status, statusMessage, true);
        character.Gender = gender;

        try
        {
            await _context.SaveChangesAsync();
            return character;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was discovered by another thread, returning existing character", characterName);
            return await GetOrCreateCharacterAsync(characterName);
        }
    }

    public async Task UpdateCharacterFromFChatDataAsync(string characterName, FChatCharacter fchatCharacter)
    {
        _logger.LogDebug("Updating character from F-Chat data: {CharacterName} (Status: {Status}, Gender: {Gender})", 
            characterName, fchatCharacter.Status, fchatCharacter.Gender);

        try
        {
            var character = await GetOrCreateCharacterAsync(characterName);
            
            // Always update status and ensure character is marked as online
            character.UpdateStatus(fchatCharacter.Status, fchatCharacter.StatusMessage, true);
            
            // Update gender if provided and not empty
            if (!string.IsNullOrEmpty(fchatCharacter.Gender) && fchatCharacter.Gender != "None")
            {
                character.Gender = fchatCharacter.Gender;
                _logger.LogDebug("Updated gender for {CharacterName} to {Gender}", characterName, fchatCharacter.Gender);
            }
            
            character.LastSeen = fchatCharacter.LastSeen;

            await _context.SaveChangesAsync();
            _logger.LogDebug("Successfully updated character {CharacterName}: Status={Status}, Gender={Gender}, Online={IsOnline}", 
                characterName, character.Status, character.Gender, character.IsOnline);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was updated by another thread, skipping duplicate update", characterName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating character {CharacterName} from F-Chat data", characterName);
            throw;
        }
    }

    public async Task UpdateCharacterFromChannelDataAsync(string characterName, ChannelCharacter channelCharacter)
    {
        _logger.LogDebug("Updating character from channel data: {CharacterName} (Status: {Status}, Gender: {Gender})", 
            characterName, channelCharacter.Status, channelCharacter.Gender);

        try
        {
            var character = await GetOrCreateCharacterAsync(characterName);
            
            // Always update status and ensure character is marked as online
            character.UpdateStatus(channelCharacter.Status.ToString().ToLower(), channelCharacter.StatusMessage, true);
            
            // Update gender if provided and not empty
            if (!string.IsNullOrEmpty(channelCharacter.Gender) && channelCharacter.Gender != "None")
            {
                character.Gender = channelCharacter.Gender;
                _logger.LogDebug("Updated gender for {CharacterName} to {Gender}", characterName, channelCharacter.Gender);
            }
            
            character.LastSeen = channelCharacter.LastSeenAt;

            await _context.SaveChangesAsync();
            _logger.LogDebug("Successfully updated character {CharacterName}: Status={Status}, Gender={Gender}, Online={IsOnline}", 
                characterName, character.Status, character.Gender, character.IsOnline);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Character {CharacterName} was updated by another thread, skipping duplicate update", characterName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating character {CharacterName} from channel data", characterName);
            throw;
        }
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

    public async Task UpdateCharacterStatusesAsync(Dictionary<string, (string status, string? statusMessage, bool isOnline)> characterUpdates)
    {
        _logger.LogDebug("Updating {Count} character statuses", characterUpdates.Count);

        var characterNames = characterUpdates.Keys.ToList();
        var characters = await _context.Characters
            .Where(c => characterNames.Contains(c.Name))
            .ToListAsync();

        foreach (var character in characters)
        {
            if (characterUpdates.TryGetValue(character.Name, out var update))
            {
                character.UpdateStatus(update.status, update.statusMessage, update.isOnline);
            }
        }

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
        {
            // Handle unique constraint violation - character was created/updated by another thread
            _logger.LogWarning("Some characters were updated by another thread during bulk status update, skipping duplicate updates");
        }
    }

    public async Task CleanupOrphanedCharactersAsync()
    {
        _logger.LogInformation("Starting cleanup of orphaned characters");

        // Find characters that have no connections
        var orphanedCharacters = await _context.Characters
            .Where(c => !c.Connections.Any())
            .ToListAsync();

        if (orphanedCharacters.Count > 0)
        {
            _logger.LogInformation("Found {Count} orphaned characters to remove", orphanedCharacters.Count);
            _context.Characters.RemoveRange(orphanedCharacters);
            try
            {
                await _context.SaveChangesAsync();
                _logger.LogInformation("Successfully removed {Count} orphaned characters", orphanedCharacters.Count);
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
            {
                // Handle unique constraint violation - character was created/updated by another thread
                _logger.LogWarning("Some orphaned characters were updated by another thread during cleanup");
            }
        }
        else
        {
            _logger.LogInformation("No orphaned characters found");
        }
    }

    #endregion

    #region Diagnostic Methods

    public async Task<int> GetTotalCharacterCountAsync()
    {
        return await _context.Characters.CountAsync();
    }

    public async Task<List<Character>> GetCharactersWithProfilesAsync()
    {
        return await _context.Characters
            .Where(c => !string.IsNullOrEmpty(c.ProfileData))
            .ToListAsync();
    }

    public async Task<List<Character>> GetRecentlyUpdatedCharactersAsync(int hours)
    {
        var cutoffDate = DateTime.UtcNow.AddHours(-hours);
        return await _context.Characters
            .Where(c => c.LastUpdated >= cutoffDate)
            .OrderByDescending(c => c.LastUpdated)
            .ToListAsync();
    }

    public async Task<List<CharacterConnection>> GetCharacterConnectionsAsync(string characterName)
    {
        return await _context.CharacterConnections
            .Include(cc => cc.Character)
            .Where(cc => cc.Character.Name == characterName)
            .ToListAsync();
    }

    public async Task<List<string>> GetCharacterChannelsAsync(string characterName)
    {
        return await _context.CharacterChannels
            .Include(cc => cc.CharacterConnection)
            .ThenInclude(cc => cc.Character)
            .Where(cc => cc.CharacterConnection.Character.Name == characterName)
            .Select(cc => cc.ChannelId)
            .Distinct()
            .ToListAsync();
    }

    #endregion
}
