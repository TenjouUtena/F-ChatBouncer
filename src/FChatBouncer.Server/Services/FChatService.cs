using FChatBouncer.Server.Models;
using FChatBouncer.Server.Hubs;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using FChatBouncer.Server.Data;
using System.Net.WebSockets;
using Npgsql;

namespace FChatBouncer.Server.Services;

public class FChatService : IFChatService
{
    private readonly ILogger<FChatService> _logger;
    private readonly IServiceProvider _serviceProvider;
    private readonly IHubContext<BouncerHub> _hubContext;
    
    // Multi-character connection management: userId -> characterName -> FChatWebSocketClient
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, FChatWebSocketClient>> _connections = new();
    
    // Channel caching: cacheKey -> (channels, cachedAt)
    private readonly ConcurrentDictionary<string, (List<FChatChannel> Channels, DateTime CachedAt)> _channelCache = new();
    private readonly SemaphoreSlim _channelCacheSemaphore = new(1, 1);
    private const int CHANNEL_CACHE_TTL_SECONDS = 300; // 5 minutes

    public FChatService(
        ILogger<FChatService> logger,
        IServiceProvider serviceProvider,
        IHubContext<BouncerHub> hubContext)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
        _hubContext = hubContext;
        
        // Start timer to process pending character updates every 5 seconds
        _characterUpdateTimer = new Timer(async _ => await ProcessPendingCharacterUpdates(), null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
    }

    #region Legacy Single-Character Methods (Backward Compatibility)

    public async Task ConnectUserAsync(string userId, string fchatUsername, string fchatPassword)
    {
        // For backward compatibility, connect as "default" character
        await ConnectCharacterAsync(userId, "default", fchatUsername, fchatPassword);
    }

    public async Task DisconnectUserAsync(string userId)
    {
        await DisconnectAllCharactersAsync(userId);
    }

    public async Task SendMessageAsync(string userId, string channel, string message)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            throw new InvalidOperationException("No active character for user");
        
        await SendMessageAsync(userId, activeCharacter, channel, message);
    }

    public async Task JoinChannelAsync(string userId, string channel)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            throw new InvalidOperationException("No active character for user");
        
        await JoinChannelAsync(userId, activeCharacter, channel);
    }

    public async Task LeaveChannelAsync(string userId, string channel)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            throw new InvalidOperationException("No active character for user");
        
        await LeaveChannelAsync(userId, activeCharacter, channel);
    }

    public Task<bool> IsUserConnectedAsync(string userId)
    {
        // Check actual WebSocket connections, not database field
        if (_connections.TryGetValue(userId, out var userConnections))
        {
            return Task.FromResult(userConnections.Values.Any(client => client.IsConnected));
        }
        return Task.FromResult(false);
    }

    public async Task CleanupInvalidCharactersAsync(string userId)
    {
        await ExecuteWithDbContext(async dbContext =>
        {
            // Remove any "default" character connections that don't have actual WebSocket connections
            var defaultConnections = await dbContext.CharacterConnections
                .Include(cc => cc.Character)
                .Where(cc => cc.UserId == userId && cc.Character.Name == "default")
                .ToListAsync();

            if (defaultConnections.Any())
            {
                _logger.LogInformation("Removing {Count} invalid 'default' character connections for user {UserId}", 
                    defaultConnections.Count, userId);
                
                dbContext.CharacterConnections.RemoveRange(defaultConnections);
                await dbContext.SaveChangesAsync();
            }
        });
    }

    public async Task RefreshUserConnectionAsync(string userId)
    {
        _logger.LogInformation("Attempting to refresh F-Chat connection for user {UserId}", userId);
        
        try
        {
            // Get user settings to retrieve credentials
            using var scope = _serviceProvider.CreateScope();
            var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
            var settings = await userService.GetUserSettingsAsync(userId);
            
            if (settings?.FChatCredentialsEncrypted == null)
            {
                _logger.LogWarning("No F-Chat credentials found for user {UserId}, cannot refresh connection", userId);
                return;
            }

            // Decode credentials
            var credentialsBytes = Convert.FromBase64String(settings.FChatCredentialsEncrypted);
            var credentials = System.Text.Encoding.UTF8.GetString(credentialsBytes);
            var parts = credentials.Split(':');

            if (parts.Length != 2)
            {
                _logger.LogError("Invalid credentials format for user {UserId}", userId);
                return;
            }

            // Disconnect all existing connections for this user
            await DisconnectAllCharactersAsync(userId);

            // Create a temporary WebSocket client to get available characters
            using var scope2 = _serviceProvider.CreateScope();
            var loggerFactory = scope2.ServiceProvider.GetRequiredService<ILoggerFactory>();
            var tempLogger = loggerFactory.CreateLogger<FChatWebSocketClient>();
            using var tempClient = new FChatWebSocketClient(tempLogger);
            var connected = await tempClient.ConnectAsync(parts[0], parts[1]);
            
            if (!connected)
            {
                _logger.LogError("Failed to connect to F-Chat to retrieve characters for user {UserId}", userId);
                return;
            }

            // Get available characters
            var availableCharacters = await tempClient.GetCharactersAsync();
            if (availableCharacters.Count == 0)
            {
                _logger.LogWarning("No characters found for F-Chat account {Username} of user {UserId}", parts[0], userId);
                return;
            }

            _logger.LogInformation("Found {CharacterCount} characters for user {UserId}: {CharacterNames}", 
                availableCharacters.Count, userId, string.Join(", ", availableCharacters.Select(c => c.Name)));

            // Connect to the first available character
            var firstCharacter = availableCharacters.First();
            await ConnectCharacterAsync(userId, firstCharacter.Name, parts[0], parts[1]);
            
            _logger.LogInformation("Successfully refreshed F-Chat connection for user {UserId} with character {CharacterName}", 
                userId, firstCharacter.Name);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh F-Chat connection for user {UserId}", userId);
        }
    }

    public async Task<List<FChatCharacter>> GetCharactersAsync(string userId)
    {
        // First try to get characters from active character
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter != null)
        {
            var characters = await GetCharactersAsync(userId, activeCharacter);
            if (characters.Count > 0)
            {
                return characters;
            }
            _logger.LogWarning("Active character {ActiveCharacter} of user {UserId} returned empty character list", activeCharacter, userId);
        }
        
        // If no active character or active character returned empty list, try to get characters from any connected character
        if (_connections.TryGetValue(userId, out var userConnections))
        {
            foreach (var kvp in userConnections)
            {
                var characterName = kvp.Key;
                var client = kvp.Value;
                if (client.IsConnected)
                {
                    try
                    {
                        var characters = await client.GetCharactersAsync();
                        if (characters.Count > 0)
                        {
                            _logger.LogInformation("Successfully retrieved {Count} characters from character {CharacterName} of user {UserId}", 
                                characters.Count, characterName, userId);
                            return characters;
                        }
                        else
                        {
                            _logger.LogWarning("Character {CharacterName} of user {UserId} returned empty character list", characterName, userId);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to get characters from character {CharacterName} of user {UserId}", characterName, userId);
                        // Continue to next character
                    }
                }
                else
                {
                    _logger.LogDebug("Character {CharacterName} of user {UserId} is not connected, skipping", characterName, userId);
                }
            }
        }
        
        // If no connected characters or all returned empty lists, check database for character connections
        _logger.LogInformation("No characters found from active connections for user {UserId}. Checking database for character connections...", userId);
        
        var dbCharacterConnections = await ExecuteWithDbContext(async dbContext =>
        {
            return await dbContext.CharacterConnections
                .Include(cc => cc.Character)
                .Where(cc => cc.UserId == userId)
                .ToListAsync();
        });

        if (dbCharacterConnections.Count > 0)
        {
            _logger.LogInformation("Found {Count} character connections in database for user {UserId}: {Characters}", 
                dbCharacterConnections.Count, userId, string.Join(", ", dbCharacterConnections.Select(cc => cc.Character.Name)));
            
            // Convert database character connections to FChatCharacter objects
            var characters = dbCharacterConnections.Select(cc => new FChatCharacter
            {
                Name = cc.Character.Name,
                Status = cc.Character.Status,
                StatusMessage = cc.Character.StatusMessage,
                Gender = cc.Character.Gender,
                LastSeen = cc.Character.LastSeen
            }).ToList();

            _logger.LogInformation("Returning {Count} characters from database for user {UserId}", characters.Count, userId);
            return characters;
        }

        // If no database connections either, try to refresh connection
        _logger.LogWarning("No character connections found in database for user {UserId}. Attempting to refresh connection...", userId);
        await RefreshUserConnectionAsync(userId);
        
        // Try one more time after refresh
        if (_connections.TryGetValue(userId, out var refreshedConnections))
        {
            foreach (var kvp in refreshedConnections)
            {
                var characterName = kvp.Key;
                var client = kvp.Value;
                if (client.IsConnected)
                {
                    try
                    {
                        var characters = await client.GetCharactersAsync();
                        if (characters.Count > 0)
                        {
                            _logger.LogInformation("Successfully retrieved {Count} characters after refresh from character {CharacterName} of user {UserId}", 
                                characters.Count, characterName, userId);
                            return characters;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to get characters after refresh from character {CharacterName} of user {UserId}", characterName, userId);
                    }
                }
            }
        }
        
        // If still no characters, return empty list
        _logger.LogError("No characters found for user {UserId} even after refresh attempt", userId);
        return new List<FChatCharacter>();
    }

    public async Task SelectCharacterAsync(string userId, string characterName)
    {
        await SetActiveCharacterAsync(userId, characterName);
    }

    public async Task SwitchCharacterAsync(string userId, string characterName)
    {
        await SetActiveCharacterAsync(userId, characterName);
    }

    public async Task<FChatCharacter?> GetSelectedCharacterAsync(string userId)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            return null;
        
        var characters = await GetCharactersAsync(userId, activeCharacter);
        return characters.FirstOrDefault();
    }

    public async Task<List<FChatChannel>> GetChannelListAsync(string userId)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            return new List<FChatChannel>();
        
        return await GetChannelListAsync(userId, activeCharacter);
    }

    public async Task<List<string>> GetJoinedChannelsAsync(string userId)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            return new List<string>();
        
        return await GetJoinedChannelsAsync(userId, activeCharacter);
    }

    public async Task<List<FChatChannel>> GetJoinedChannelDetailsAsync(string userId)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            return new List<FChatChannel>();
        
        return await GetJoinedChannelDetailsAsync(userId, activeCharacter);
    }

    public async Task SendPRIMessageAsync(string userId, string recipient, string content)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            throw new InvalidOperationException("No active character for user");
        
        await SendPRIMessageAsync(userId, activeCharacter, recipient, content);
    }

    public async Task ProcessQueuedMessagesAsync(string userId)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            return;
        
        await ProcessQueuedMessagesAsync(userId, activeCharacter);
    }

    public async Task RequestProfileAsync(string userId, string characterName)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
            throw new InvalidOperationException("No active character for user");
        
        await RequestProfileAsync(userId, characterName, activeCharacter);
    }

    public async Task<List<ChannelCharacter>> GetChannelCharactersAsync(string userId, string characterName, string channelId)
    {
        _logger.LogInformation("Getting character list for channel {ChannelId} from character {CharacterName} of user {UserId}", channelId, characterName, userId);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            return await client.GetChannelCharactersAsync(channelId);
        }

        return new List<ChannelCharacter>();
    }

    public async Task<bool> RequestChannelOperatorListAsync(string userId, string characterName, string channelId)
    {
        _logger.LogInformation("Requesting operator list for channel {ChannelId} from character {CharacterName} of user {UserId}", channelId, characterName, userId);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            return await client.RequestChannelOperatorListAsync(channelId);
        }

        return false;
    }

    #endregion

    #region New Multi-Character Methods


    public async Task ConnectCharacterAsync(string userId, string characterName, string fchatUsername, string fchatPassword)
    {
        _logger.LogInformation("=== ConnectCharacterAsync START ===");
        _logger.LogInformation("Connecting character {CharacterName} for user {UserId} to F-Chat", characterName, userId);
        _logger.LogInformation("F-Chat username: {Username}", fchatUsername);
        
        var startTime = DateTime.UtcNow;

        // Get or create user's character connections dictionary
        var userConnections = _connections.GetOrAdd(userId, _ => new ConcurrentDictionary<string, FChatWebSocketClient>());
        _logger.LogInformation("User {UserId} has {ConnectionCount} existing character connections: {Connections}", 
            userId, userConnections.Count, string.Join(", ", userConnections.Keys));

        // Check if character already has an active connection
        if (userConnections.TryGetValue(characterName, out var existingClient))
        {
            _logger.LogInformation("Found existing client for character {CharacterName}, checking connection status", characterName);
            if (existingClient.IsConnected)
            {
                _logger.LogInformation("Character {CharacterName} for user {UserId} already has an active F-Chat connection", characterName, userId);
                _logger.LogInformation("=== ConnectCharacterAsync END (ALREADY CONNECTED) ===");
                return;
            }
            else
            {
                _logger.LogInformation("Character {CharacterName} for user {UserId} has inactive F-Chat connection, cleaning up", characterName, userId);
                existingClient.Dispose();
                userConnections.TryRemove(characterName, out _);
                _logger.LogInformation("Cleaned up inactive connection for character {CharacterName}", characterName);
            }
        }
        else
        {
            _logger.LogInformation("No existing connection found for character {CharacterName}", characterName);
        }

        try
        {
            _logger.LogInformation("Creating new F-Chat WebSocket client for character {CharacterName} of user {UserId}", characterName, userId);

            // Create a new F-Chat WebSocket client
            var logger = _serviceProvider.GetRequiredService<ILogger<FChatWebSocketClient>>();
            var client = new FChatWebSocketClient(logger);

            // Set up event handlers with character context
            client.MessageReceived += async (message) =>
            {
                // Process messages for ALL connected characters to ensure no messages are lost
                // The frontend will handle filtering based on the currently selected character
                await OnMessageReceived(userId, characterName, message);
            };

            client.ConnectionStatusChanged += async (status) =>
            {
                await OnConnectionStatusChanged(userId, characterName, status);
            };

            client.ProfileReceived += async (profileCharacterName, profileData) =>
            {
                await OnProfileReceived(userId, characterName, profileCharacterName, profileData);
            };

            client.CharacterJoinedChannel += async (channelId, character) =>
            {
                await OnCharacterJoinedChannel(userId, characterName, channelId, character);
            };

            client.CharacterLeftChannel += async (channelId, characterName) =>
            {
                await OnCharacterLeftChannel(userId, characterName, channelId, characterName);
            };

            client.StatusUpdated += async (statusCharacterName, status, statusMessage) =>
            {
                await OnStatusUpdated(userId, characterName, statusCharacterName, status, statusMessage);
            };

            client.UserOnline += async (characterName, status, gender) =>
            {
                await OnUserOnline(userId, characterName, status, gender);
            };

            client.UserOffline += async (characterName) =>
            {
                await OnUserOffline(userId, characterName);
            };

            client.TypingNotificationReceived += async (receivingCharacterName, fromCharacter, status) =>
            {
                await OnTypingNotificationReceived(userId, receivingCharacterName, fromCharacter, status);
            };

            client.FriendsListReceived += async (friends) =>
            {
                await OnFriendsListReceived(userId, characterName, friends);
            };

            client.OnlineCharactersListReceived += async (onlineCharacters) =>
            {
                await OnOnlineCharactersListReceived(userId, characterName, onlineCharacters);
            };

            client.SearchResultsReceived += async (searchResults) =>
            {
                await OnSearchResultsReceived(userId, characterName, searchResults);
            };

            client.CharacterError += async (errorCharacterName, errorMessage) =>
            {
                await OnCharacterError(userId, characterName, errorCharacterName, errorMessage);
            };

            // Connect to F-Chat
            _logger.LogInformation("Starting F-Chat connection process for character {CharacterName}", characterName);
            var connectStartTime = DateTime.UtcNow;
            var connected = await client.ConnectAsync(fchatUsername, fchatPassword);
            var connectEndTime = DateTime.UtcNow;
            var connectDuration = connectEndTime - connectStartTime;
            _logger.LogInformation("F-Chat connection process completed in {Duration}ms with result: {Result}", 
                connectDuration.TotalMilliseconds, connected);
                
            if (connected)
            {
                // Select the specific character
                _logger.LogInformation("Starting character selection process for {CharacterName}", characterName);
                var selectStartTime = DateTime.UtcNow;
                var characterSelected = await client.SelectCharacterAsync(characterName);
                var selectEndTime = DateTime.UtcNow;
                var selectDuration = selectEndTime - selectStartTime;
                _logger.LogInformation("Character selection process completed in {Duration}ms with result: {Result}", 
                    selectDuration.TotalMilliseconds, characterSelected);
                    
                if (!characterSelected)
                {
                    _logger.LogError("Failed to select character {CharacterName} for user {UserId}", characterName, userId);
                    client.Dispose();
                    throw new InvalidOperationException($"Failed to select character {characterName}");
                }
                
                _logger.LogInformation("Successfully selected character {CharacterName} for user {UserId}", characterName, userId);
                
                userConnections[characterName] = client;
                
                // Debug: Log the connection storage
                _logger.LogInformation("Stored WebSocket connection for character {CharacterName} in _connections dictionary. User now has {Count} connections: {CharacterNames}", 
                    characterName, userConnections.Count, string.Join(", ", userConnections.Keys));
                
                // Update database
                _logger.LogInformation("Updating character connection status in database...");
                await UpdateCharacterConnectionStatus(userId, characterName, fchatUsername, fchatPassword, true);
                _logger.LogInformation("Database update completed");
                
                // Restore character's channel memberships from database
                _logger.LogInformation("Restoring character channel memberships...");
                await RestoreCharacterChannelMemberships(userId, characterName, client);
                _logger.LogInformation("Channel memberships restored");
                
                // Send CharacterRestored event to frontend
                _logger.LogInformation("Sending CharacterRestored event to frontend...");
                await _hubContext.Clients.Group($"user-{userId}").SendAsync("CharacterRestored", new
                {
                    CharacterName = characterName,
                    Timestamp = DateTime.UtcNow
                });
                _logger.LogInformation("CharacterRestored event sent");
                
                // If this is the first character connection for the user, set it as active
                if (userConnections.Count == 1)
                {
                    _logger.LogInformation("First character connection for user {UserId}, setting {CharacterName} as active", userId, characterName);
                    await SetActiveCharacterAsync(userId, characterName);
                }
                
                var totalTime = DateTime.UtcNow - startTime;
                _logger.LogInformation("Successfully created and stored new F-Chat connection for character {CharacterName} of user {UserId} in {TotalDuration}ms", 
                    characterName, userId, totalTime.TotalMilliseconds);
                _logger.LogInformation("=== ConnectCharacterAsync END (SUCCESS) ===");
            }
            else
            {
                _logger.LogError("Failed to connect character {CharacterName} of user {UserId} to F-Chat", characterName, userId);
                client.Dispose();
                
                var totalTime = DateTime.UtcNow - startTime;
                _logger.LogInformation("ConnectCharacterAsync failed in {TotalDuration}ms", totalTime.TotalMilliseconds);
                _logger.LogInformation("=== ConnectCharacterAsync END (FAILED) ===");
                throw new InvalidOperationException($"Failed to connect character {characterName} to F-Chat");
            }
        }
        catch (WebSocketException ex) when (ex.Message.Contains("504"))
        {
            _logger.LogError(ex, "F-List server overloaded (504 Gateway Timeout) while connecting character {CharacterName} of user {UserId}", characterName, userId);
            throw new InvalidOperationException("F-List server is currently overloaded. Please try switching characters again in a few minutes.", ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error connecting character {CharacterName} of user {UserId} to F-Chat", characterName, userId);
            throw;
        }
    }

    public async Task DisconnectCharacterAsync(string userId, string characterName)
    {
        _logger.LogInformation("Disconnecting character {CharacterName} for user {UserId} from F-Chat", characterName, userId);

        if (_connections.TryGetValue(userId, out var userConnections))
        {
            if (userConnections.TryRemove(characterName, out var client))
        {
            client.Dispose();
            } else {
                _logger.LogInformation("Didn't find a client for character {CharacterName} of user {UserId}", characterName, userId);
            }                
                // Remove character connection from database completely
            await ExecuteWithCharacterService(cs => cs.RemoveCharacterConnectionAsync(userId, characterName));

        }

        await Task.CompletedTask;
    }

    public async Task DisconnectAllCharactersAsync(string userId)
    {
        _logger.LogInformation("Disconnecting all characters for user {UserId} from F-Chat", userId);

        if (_connections.TryRemove(userId, out var userConnections))
        {
            foreach (var kvp in userConnections)
            {
                kvp.Value.Dispose();
                await UpdateCharacterConnectionStatus(userId, kvp.Key, null, null, false);
            }
        }

        await Task.CompletedTask;
    }

    public async Task SendMessageAsync(string userId, string characterName, string channel, string message)
    {
        _logger.LogInformation("Sending message from character {CharacterName} of user {UserId} to channel {Channel}", characterName, userId, channel);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            await client.SendMessageAsync(channel, message);
        }
        else
        {
            throw new InvalidOperationException($"Character {characterName} is not connected");
        }
    }

    public async Task JoinChannelAsync(string userId, string characterName, string channel)
    {
        _logger.LogInformation("Character {CharacterName} of user {UserId} joining channel {Channel}", characterName, userId, channel);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            await client.JoinChannelAsync(channel);
            
            // Update database
            await AddCharacterChannel(userId, characterName, channel);
        }
        else
        {
            throw new InvalidOperationException($"Character {characterName} is not connected");
        }
    }

    public async Task LeaveChannelAsync(string userId, string characterName, string channel)
    {
        _logger.LogInformation("Character {CharacterName} of user {UserId} leaving channel {Channel}", characterName, userId, channel);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            await client.LeaveChannelAsync(channel);
            
            // Update database
            await RemoveCharacterChannel(userId, characterName, channel);
        }
        else
        {
            throw new InvalidOperationException($"Character {characterName} is not connected");
        }
    }

    public Task<bool> IsCharacterConnectedAsync(string userId, string characterName)
    {
        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            return Task.FromResult(client.IsConnected);
        }
        return Task.FromResult(false);
    }

    public async Task<List<FChatCharacter>> GetCharactersAsync(string userId, string characterName)
    {
        _logger.LogInformation("Getting characters for character {CharacterName} of user {UserId}", characterName, userId);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            return await client.GetCharactersAsync();
        }

        return new List<FChatCharacter>();
    }

    public async Task<List<FChatChannel>> GetChannelListAsync(string userId, string characterName)
    {
        _logger.LogInformation("Getting joined channels for character {CharacterName} of user {UserId}", characterName, userId);
        
        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            // Get the character's joined channels from the WebSocket client
            var joinedChannels = await client.GetJoinedChannelDetailsAsync();
            _logger.LogInformation("Found {ChannelCount} joined channels for character {CharacterName}: {Channels}", 
                joinedChannels.Count, characterName, string.Join(", ", joinedChannels.Select(c => c.Name)));
            return joinedChannels;
        }

        _logger.LogWarning("No active connection found for character {CharacterName} of user {UserId}", characterName, userId);
        return new List<FChatChannel>();
    }

    public async Task<List<string>> GetJoinedChannelsAsync(string userId, string characterName)
    {
        _logger.LogInformation("Getting joined channels for character {CharacterName} of user {UserId}", characterName, userId);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            return await client.GetJoinedChannelsAsync();
        }

        return new List<string>();
    }

    public async Task<List<FChatChannel>> GetAvailableChannelsAsync(string userId, string characterName)
    {
        _logger.LogInformation("Getting available channels for character {CharacterName} of user {UserId}", characterName, userId);
        
        // Try to get channels from cache first
        var cachedChannels = await GetCachedChannelsAsync();
        if (cachedChannels != null)
        {
            _logger.LogInformation("Returning {ChannelCount} channels from cache for character {CharacterName} of user {UserId}", 
                cachedChannels.Count, characterName, userId);
            return cachedChannels;
        }

        // If no cached channels, try to fetch from F-Chat
        _logger.LogInformation("No cached channels available, attempting to fetch from F-Chat for character {CharacterName} of user {UserId}", characterName, userId);
        
        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            _logger.LogInformation("Found WebSocket client for character {CharacterName}, getting available channels from F-Chat", characterName);
            var channels = await client.GetChannelListAsync();
            
            // Cache the channels for future requests
            if (channels.Count > 0)
            {
                await SetCachedChannelsAsync(channels);
                _logger.LogInformation("Cached {ChannelCount} channels for future requests", channels.Count);
            }
            
            return channels;
        }

        _logger.LogWarning("No active connection found for character {CharacterName} of user {UserId}", characterName, userId);
        return new List<FChatChannel>();
    }

    public async Task<List<FChatChannel>> GetJoinedChannelDetailsAsync(string userId, string characterName)
    {
        _logger.LogInformation("Getting joined channel details for character {CharacterName} of user {UserId}", characterName, userId);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            return await client.GetJoinedChannelDetailsAsync();
        }

        return new List<FChatChannel>();
    }

    public async Task SendPRIMessageAsync(string userId, string characterName, string recipient, string content)
    {
        _logger.LogInformation("Sending PM from character {CharacterName} of user {UserId} to {Recipient}", characterName, userId, recipient);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            await client.SendPRIMessageAsync(recipient, content);
        }
        else
        {
            throw new InvalidOperationException($"Character {characterName} is not connected");
        }
    }

    public async Task SendTypingNotificationAsync(string userId, string characterName, string recipient, string status)
    {
        _logger.LogInformation("Sending typing notification from character {CharacterName} of user {UserId} to {Recipient} with status {Status}", characterName, userId, recipient, status);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            await client.SendTypingNotificationAsync(recipient, status);
        }
        else
        {
            throw new InvalidOperationException($"Character {characterName} is not connected");
        }
    }

    public async Task SendStatusUpdateAsync(string userId, string characterName, string status, string? statusMessage = null)
    {
        _logger.LogInformation("Sending status update from character {CharacterName} of user {UserId}: {Status} - {StatusMessage}", 
            characterName, userId, status, statusMessage);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(characterName, out var client))
        {
            await client.SendStatusUpdateAsync(status, statusMessage);
        }
        else
        {
            throw new InvalidOperationException($"Character {characterName} is not connected");
        }
    }

    public async Task ProcessQueuedMessagesAsync(string userId, string characterName)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var messageService = scope.ServiceProvider.GetRequiredService<IMessageService>();

            var queuedMessages = await messageService.GetQueuedMessagesAsync(userId);

            if (queuedMessages.Count > 0)
            {
                _logger.LogInformation("Processing {Count} queued messages for character {CharacterName} of user {UserId}", queuedMessages.Count, characterName, userId);

                foreach (var queuedMessage in queuedMessages)
                {
                    try
                    {
                        // Send the queued message
                        if (queuedMessage.ChannelName.StartsWith("PRI-"))
                        {
                            await SendPRIMessageAsync(userId, characterName, queuedMessage.ChannelName[4..], queuedMessage.Content);
                        }
                        else
                        {
                            await SendMessageAsync(userId, characterName, queuedMessage.ChannelName, queuedMessage.Content);
                        }

                        // Store in message history
                        await messageService.SaveMessageAsync(
                            userId,
                            queuedMessage.ChannelName,
                            queuedMessage.SenderCharacter,
                            queuedMessage.Content,
                            queuedMessage.MessageType,
                            characterName
                        );

                        // Broadcast to connected clients
                        await _hubContext.Clients.Group($"user-{userId}").SendAsync("ReceiveMessage", new
                        {
                            Channel = queuedMessage.ChannelName,
                            Sender = queuedMessage.SenderCharacter,
                            Content = queuedMessage.Content,
                            Timestamp = DateTime.UtcNow,
                            MessageType = queuedMessage.MessageType.ToString(),
                            characterName = characterName, // Character that received this message
                            isActiveCharacter = await IsActiveCharacterAsync(userId, characterName) // Helper to indicate if this is the active character
                        });

                        // Remove from queue
                        await messageService.ProcessQueuedMessageAsync(queuedMessage.Id);

                        _logger.LogDebug("Successfully sent queued message {Id} for character {CharacterName} of user {UserId}", queuedMessage.Id, characterName, userId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to process queued message {Id} for character {CharacterName} of user {UserId}", queuedMessage.Id, characterName, userId);
                    }
                }

                // Notify client that queued messages were processed
                await _hubContext.Clients.Group($"user-{userId}").SendAsync("QueuedMessagesProcessed", new
                {
                    ProcessedCount = queuedMessages.Count,
                    Message = $"Sent {queuedMessages.Count} queued message(s)"
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing queued messages for character {CharacterName} of user {UserId}", characterName, userId);
        }
    }

    public async Task RequestProfileAsync(string userId, string characterName, string requestingCharacter)
    {
        _logger.LogInformation("Requesting profile for character {CharacterName} from character {RequestingCharacter} of user {UserId}", characterName, requestingCharacter, userId);

        if (_connections.TryGetValue(userId, out var userConnections) &&
            userConnections.TryGetValue(requestingCharacter, out var client))
        {
            await client.RequestProfileAsync(characterName);
        }
        else
        {
            throw new InvalidOperationException($"Character {requestingCharacter} is not connected");
        }
    }

    public async Task<List<CharacterConnection>> GetUserCharacterConnectionsAsync(string userId)
    {
        return await ExecuteWithDbContext(async dbContext =>
        {
            return await dbContext.CharacterConnections
                .Include(cc => cc.Character)
                .Where(cc => cc.UserId == userId)
                .ToListAsync();
        });
    }

    public async Task<CharacterConnection?> GetCharacterConnectionAsync(string userId, string characterName)
    {
        return await ExecuteWithDbContext(async dbContext =>
        {
            return await dbContext.CharacterConnections
                .Include(cc => cc.Character)
                .FirstOrDefaultAsync(cc => cc.UserId == userId && cc.Character.Name == characterName);
        });
    }

    public async Task SetActiveCharacterAsync(string userId, string characterName)
    {
        _logger.LogInformation("=== SetActiveCharacterAsync START ===");
        _logger.LogInformation("Setting active character for user {UserId} to: {CharacterName}", userId, characterName);
        
        var startTime = DateTime.UtcNow;
        
        await ExecuteWithCharacterService(cs => cs.SetActiveCharacterAsync(userId, characterName));
        
        var endTime = DateTime.UtcNow;
        var duration = endTime - startTime;
        _logger.LogInformation("SetActiveCharacterAsync completed in {Duration}ms", duration.TotalMilliseconds);
        _logger.LogInformation("=== SetActiveCharacterAsync END ===");
    }

    public async Task<string?> GetActiveCharacterAsync(string userId)
    {
        var activeCharacter = await ExecuteWithCharacterService(cs => cs.GetActiveCharacterAsync(userId));
        return activeCharacter?.Name;
    }

    #endregion

    #region Private Helper Methods

    private async Task<T> ExecuteWithDbContext<T>(Func<BouncerDbContext, Task<T>> operation)
    {
        using var scope = _serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
        return await operation(dbContext);
    }

    private async Task ExecuteWithDbContext(Func<BouncerDbContext, Task> operation)
    {
        using var scope = _serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
        await operation(dbContext);
    }

    private async Task<T> ExecuteWithCharacterService<T>(Func<ICharacterService, Task<T>> operation)
    {
        using var scope = _serviceProvider.CreateScope();
        var characterService = scope.ServiceProvider.GetRequiredService<ICharacterService>();
        return await operation(characterService);
    }

    private async Task ExecuteWithCharacterService(Func<ICharacterService, Task> operation)
    {
        using var scope = _serviceProvider.CreateScope();
        var characterService = scope.ServiceProvider.GetRequiredService<ICharacterService>();
        await operation(characterService);
    }

    // Batch operations to reduce database calls
    private readonly SemaphoreSlim _characterUpdateSemaphore = new(1, 1);
    private readonly Dictionary<string, CharacterUpdateInfo> _pendingCharacterUpdates = new();
    private readonly Timer _characterUpdateTimer;

    private class CharacterUpdateInfo
    {
        public string Status { get; set; } = string.Empty;
        public string? StatusMessage { get; set; }
        public bool IsOnline { get; set; }
        public DateTime LastUpdate { get; set; } = DateTime.UtcNow;
    }

    private async Task BatchUpdateCharacterStatus(string characterName, string status, string? statusMessage = null, bool isOnline = true)
    {
        await _characterUpdateSemaphore.WaitAsync();
        try
        {
            _pendingCharacterUpdates[characterName] = new CharacterUpdateInfo
            {
                Status = status,
                StatusMessage = statusMessage,
                IsOnline = isOnline,
                LastUpdate = DateTime.UtcNow
            };

            // Process updates every 5 seconds or when we have 10 pending updates
            if (_pendingCharacterUpdates.Count >= 10)
            {
                await ProcessPendingCharacterUpdates();
            }
        }
        finally
        {
            _characterUpdateSemaphore.Release();
        }
    }

    private async Task ProcessPendingCharacterUpdates()
    {
        if (_pendingCharacterUpdates.Count == 0) return;

        var updates = _pendingCharacterUpdates.ToList();
        _pendingCharacterUpdates.Clear();

        _logger.LogDebug("Processing {Count} pending character updates", updates.Count);

        using var scope = _serviceProvider.CreateScope();
        var characterService = scope.ServiceProvider.GetRequiredService<ICharacterService>();

        // Group updates by character name to avoid duplicate updates for the same character
        var groupedUpdates = updates
            .GroupBy(u => u.Key)
            .Select(g => new { CharacterName = g.Key, LatestUpdate = g.OrderByDescending(u => u.Value.LastUpdate).First().Value })
            .ToList();

        _logger.LogDebug("Grouped into {Count} unique character updates", groupedUpdates.Count);

        foreach (var update in groupedUpdates)
        {
            try
            {
                await characterService.UpdateCharacterStatusAsync(update.CharacterName, update.LatestUpdate.Status, update.LatestUpdate.StatusMessage, update.LatestUpdate.IsOnline);
                _logger.LogDebug("Successfully processed batched update for character {CharacterName}", update.CharacterName);
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505")
            {
                // Handle unique constraint violation - character was created/updated by another thread
                _logger.LogDebug("Character {CharacterName} was updated by another thread during batch processing, skipping duplicate update", update.CharacterName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to update character {CharacterName} status during batch processing", update.CharacterName);
            }
        }
    }

    private async Task UpdateCharacterConnectionStatus(string userId, string characterName, string? fchatUsername, string? fchatPassword, bool isConnected)
    {
        if (fchatUsername != null && fchatPassword != null)
        {
            // Create or update the character connection
            await ExecuteWithCharacterService(cs => cs.CreateOrUpdateCharacterConnectionAsync(userId, characterName, fchatUsername, fchatPassword));
        }
        
        // Update connection status
        await ExecuteWithCharacterService(cs => cs.UpdateCharacterConnectionStatusAsync(userId, characterName, isConnected));
    }

    private async Task RestoreCharacterChannelMemberships(string userId, string characterName, FChatWebSocketClient client)
    {
        _logger.LogInformation("Restoring channel memberships for character {CharacterName} of user {UserId}", characterName, userId);
        
        var storedChannels = await ExecuteWithCharacterService(cs => cs.GetCharacterChannelsAsync(userId, characterName));

        if (storedChannels.Count > 0)
        {
            _logger.LogInformation("Found {ChannelCount} stored channel memberships for character {CharacterName}: {Channels}", 
                storedChannels.Count, characterName, string.Join(", ", storedChannels));

            // Rejoin each stored channel (excluding PRI channels which are private messages, not actual channels)
            var channelsToRemove = new List<string>();
            foreach (var channelId in storedChannels)
            {
                try
                {
                    // Skip PRI channels (private messages) - these are not actual channels that can be joined
                    if (channelId.StartsWith("PRI-", StringComparison.OrdinalIgnoreCase))
                    {
                        _logger.LogDebug("Skipping PRI channel '{ChannelId}' for character {CharacterName} - private messages don't need to be rejoined", channelId, characterName);
                        continue;
                    }

                    // Validate channel name before attempting to join
                    if (string.IsNullOrWhiteSpace(channelId) || channelId.Length > 100)
                    {
                        _logger.LogWarning("Invalid channel name '{ChannelId}' for character {CharacterName} - skipping", channelId, characterName);
                        channelsToRemove.Add(channelId);
                        continue;
                    }

                    _logger.LogInformation("Rejoining channel {ChannelId} for character {CharacterName}", channelId, characterName);
                    await client.JoinChannelAsync(channelId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to rejoin channel {ChannelId} for character {CharacterName} - removing from database", channelId, characterName);
                    channelsToRemove.Add(channelId);
                }
            }

            // Remove failed/invalid channels from database
            foreach (var channelId in channelsToRemove)
            {
                await ExecuteWithCharacterService(cs => cs.RemoveCharacterFromChannelAsync(userId, characterName, channelId));
            }
            
            _logger.LogInformation("Successfully restored {ChannelCount} channel memberships for character {CharacterName}", 
                storedChannels.Count, characterName);
        }
        else
        {
            _logger.LogInformation("No stored channel memberships found for character {CharacterName}", characterName);
        }
    }

    private async Task AddCharacterChannel(string userId, string characterName, string channelId)
    {
        await ExecuteWithCharacterService(cs => cs.AddCharacterToChannelAsync(userId, characterName, channelId));
    }

    private async Task RemoveCharacterChannel(string userId, string characterName, string channelId)
    {
        await ExecuteWithCharacterService(cs => cs.RemoveCharacterFromChannelAsync(userId, characterName, channelId));
    }

    /// <summary>
    /// Cleans up invalid channel entries from the database
    /// </summary>
    public async Task CleanupInvalidChannelsAsync()
    {
        _logger.LogInformation("Starting cleanup of invalid channel entries");
        
        await ExecuteWithDbContext(async dbContext =>
        {
            // Find channels with invalid names (empty, whitespace, too long, or PRI channels)
            var invalidChannels = await dbContext.CharacterChannels
                .Where(cc => cc.ChannelId == null || 
                            cc.ChannelId == "" || 
                            cc.ChannelId.Length > 100 ||
                            EF.Functions.Like(cc.ChannelId, "PRI-%"))
                .ToListAsync();

            if (invalidChannels.Count > 0)
            {
                _logger.LogInformation("Found {Count} invalid channel entries to remove", invalidChannels.Count);
                
                foreach (var channel in invalidChannels)
                {
                    var reason = string.IsNullOrWhiteSpace(channel.ChannelId) ? "empty/whitespace" :
                                channel.ChannelId.Length > 100 ? "too long" :
                                channel.ChannelId.StartsWith("PRI-", StringComparison.OrdinalIgnoreCase) ? "PRI channel" :
                                "unknown";
                    
                    _logger.LogWarning("Removing invalid channel entry ({Reason}): ConnectionId={ConnectionId}, ChannelId='{ChannelId}'", 
                        reason, channel.CharacterConnectionId, channel.ChannelId);
                }
                
                dbContext.CharacterChannels.RemoveRange(invalidChannels);
                await dbContext.SaveChangesAsync();
                
                _logger.LogInformation("Successfully removed {Count} invalid channel entries", invalidChannels.Count);
            }
            else
            {
                _logger.LogInformation("No invalid channel entries found");
            }
        });
    }

    private async Task<List<FChatChannel>?> GetCachedChannelsAsync()
    {
        await _channelCacheSemaphore.WaitAsync();
        try
        {
            const string cacheKey = "global_channels";
            
            if (_channelCache.TryGetValue(cacheKey, out var cachedData))
            {
                var age = DateTime.UtcNow - cachedData.CachedAt;
                if (age.TotalSeconds < CHANNEL_CACHE_TTL_SECONDS)
                {
                    _logger.LogInformation("Returning {ChannelCount} cached channels (age: {AgeSeconds}s)", cachedData.Channels.Count, age.TotalSeconds);
                    return cachedData.Channels;
                }
                else
                {
                    _logger.LogInformation("Cached channels expired (age: {AgeSeconds}s), removing from cache", age.TotalSeconds);
                    _channelCache.TryRemove(cacheKey, out _);
                }
            }
            else
            {
                _logger.LogDebug("No cached channels found");
            }
            
            return null;
        }
        finally
        {
            _channelCacheSemaphore.Release();
        }
    }

    private async Task SetCachedChannelsAsync(List<FChatChannel> channels)
    {
        await _channelCacheSemaphore.WaitAsync();
        try
        {
            const string cacheKey = "global_channels";
            _channelCache[cacheKey] = (channels, DateTime.UtcNow);
            _logger.LogInformation("Cached {ChannelCount} channels with TTL of {TTLSeconds}s", channels.Count, CHANNEL_CACHE_TTL_SECONDS);
        }
        finally
        {
            _channelCacheSemaphore.Release();
        }
    }

    /// <summary>
    /// Clears the channel cache, forcing the next request to fetch fresh data from F-Chat
    /// </summary>
    public async Task ClearChannelCacheAsync()
    {
        await _channelCacheSemaphore.WaitAsync();
        try
        {
            const string cacheKey = "global_channels";
            if (_channelCache.TryRemove(cacheKey, out _))
            {
                _logger.LogInformation("Channel cache cleared");
            }
            else
            {
                _logger.LogDebug("Channel cache was already empty");
            }
        }
        finally
        {
            _channelCacheSemaphore.Release();
        }
    }

    /// <summary>
    /// Gets friends and bookmarks data for a user
    /// </summary>
    public async Task<(List<Friend> Friends, List<string> Bookmarks, List<Friend> BookmarksWithStatus)> GetFriendsAndBookmarksAsync(string userId)
    {
        try
        {
            // Get the active character for this user
            var activeCharacter = await GetActiveCharacterAsync(userId);
            if (string.IsNullOrEmpty(activeCharacter))
            {
                _logger.LogWarning("No active character found for user {UserId} when getting friends", userId);
                return (new List<Friend>(), new List<string>(), new List<Friend>());
            }

            // Get the character connection
            var connection = await GetCharacterConnectionAsync(userId, activeCharacter);
            if (connection == null)
            {
                _logger.LogWarning("No character connection found for character {CharacterName} of user {UserId}", activeCharacter, userId);
                return (new List<Friend>(), new List<string>(), new List<Friend>());
            }

            // Check if the WebSocket client is connected
            if (!_connections.TryGetValue(userId, out var userConnections) || 
                !userConnections.TryGetValue(activeCharacter, out var client) || 
                !client.IsConnected)
            {
                _logger.LogWarning("No active WebSocket connection found for character {CharacterName} of user {UserId}", activeCharacter, userId);
                return (new List<Friend>(), new List<string>(), new List<Friend>());
            }

            // Get friends with online status from FRL response, fallback to basic list if not available
            var friends = client.GetFriendsWithStatus();
            var bookmarksList = client.GetBookmarksList();
            var bookmarksWithStatus = client.GetBookmarksWithStatus();
            
            // If no friends with status available, create basic friend objects
            if (friends.Count == 0)
            {
                var friendsList = client.GetFriendsList();
                var friendGenders = client.GetFriendGenders();
                
                friends = friendsList.Select(friendName => new Friend
                {
                    Name = friendName,
                    Status = "offline", // Default status, will be updated by real-time events
                    IsOnline = false,
                    LastSeen = DateTime.UtcNow,
                    Gender = friendGenders.TryGetValue(friendName, out var gender) ? gender : null
                }).ToList();
            }

            _logger.LogInformation("Retrieved {FriendCount} friends and {BookmarkCount} bookmarks for character {CharacterName} of user {UserId}", 
                friends.Count, bookmarksList.Count, activeCharacter, userId);
            
            return (friends, bookmarksList, bookmarksWithStatus);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get friends and bookmarks for user {UserId}", userId);
            return (new List<Friend>(), new List<string>(), new List<Friend>());
        }
    }

    public async Task SearchCharactersAsync(string userId, string characterName, Dictionary<string, object> searchCriteria)
    {
        try
        {
            _logger.LogInformation("Searching characters for user {UserId}, character {CharacterName} with criteria: {Criteria}", 
                userId, characterName, searchCriteria);

            // Get the character connection
            var connection = await GetCharacterConnectionAsync(userId, characterName);
            if (connection == null)
            {
                _logger.LogWarning("No character connection found for character {CharacterName} of user {UserId}", characterName, userId);
                throw new InvalidOperationException($"Character {characterName} is not connected");
            }

            // Check if the WebSocket client is connected
            if (!_connections.TryGetValue(userId, out var userConnections) || 
                !userConnections.TryGetValue(characterName, out var client) || 
                !client.IsConnected)
            {
                _logger.LogWarning("No active WebSocket connection found for character {CharacterName} of user {UserId}", characterName, userId);
                throw new InvalidOperationException($"Character {characterName} is not connected");
            }

            // Send the search command
            await client.SearchCharactersAsync(searchCriteria);
            _logger.LogInformation("Search command sent successfully for character {CharacterName} of user {UserId}", characterName, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to search characters for user {UserId}, character {CharacterName}", userId, characterName);
            throw;
        }
    }

    /// <summary>
    /// Helper method to check if a character is the currently active character for a user
    /// </summary>
    private async Task<bool> IsActiveCharacterAsync(string userId, string characterName)
    {
        var activeCharacter = await GetActiveCharacterAsync(userId);
        return activeCharacter == characterName;
    }

    #endregion

    #region Event Handlers

    private async Task OnMessageReceived(string userId, string characterName, FChatMessage message)
    {
        try
        {
            _logger.LogDebug("Processing {MessageType} message from {Sender} in channel {Channel} for character {CharacterName} of user {UserId}",
                message.MessageType, message.Character, message.Channel, characterName, userId);

            // Special logging for dice roll messages
            if (message.MessageType == "Roll")
            {
                _logger.LogInformation("🎲 Dice roll detected from {Character}: {Message}", message.Character, message.Message);
            }


            // Convert F-Chat message to our message format and broadcast to SignalR clients
            var messageDto = new MessageDto(
                message.Channel,
                message.Character,
                message.Message,
                message.Timestamp,
                message.MessageType
            );

            // Broadcast message with character context - frontend will filter based on active character
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("ReceiveMessage", new
            {
                Channel = messageDto.Channel,
                Sender = messageDto.Sender,
                Content = messageDto.Content,
                Timestamp = messageDto.Timestamp,
                MessageType = messageDto.MessageType,
                characterName = characterName, // Character that received this message
                isActiveCharacter = await IsActiveCharacterAsync(userId, characterName) // Helper to indicate if this is the active character
            });

            // Save message to database for persistence
            using var scope = _serviceProvider.CreateScope();
            var messageService = scope.ServiceProvider.GetRequiredService<IMessageService>();

            // Convert string message type to enum
            var messageType = message.MessageType switch
            {
                "Roll" => Models.MessageType.Roll,
                "Action" => Models.MessageType.Action,
                "System" => Models.MessageType.System,
                "Private" => Models.MessageType.Private,
                "Announcement" => Models.MessageType.Announcement,
                _ => Models.MessageType.Chat
            };

            await messageService.SaveMessageAsync(
                userId,
                message.Channel,
                message.Character,
                message.Message,
                messageType,
                characterName
            );

            _logger.LogDebug("Saved incoming message from {Character} in channel {Channel} for character {CharacterName} of user {UserId}",
                message.Character, message.Channel, characterName, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling message received for character {CharacterName} of user {UserId}", characterName, userId);
        }
    }

    private async Task OnConnectionStatusChanged(string userId, string characterName, string status)
    {
        try
        {
            var statusDto = new ConnectionStatusDto(
                status == "Connected",
                status,
                DateTime.UtcNow
            );

            await _hubContext.Clients.Group($"user-{userId}").SendAsync("NotifyConnectionStatus", new
            {
                IsConnected = statusDto.IsConnected,
                Status = statusDto.Status,
                LastActivity = statusDto.LastActivity,
                CharacterName = characterName // Add character context
            });

            // Update database status
            await UpdateCharacterConnectionStatus(userId, characterName, null, null, status == "Connected");

            // If connection is restored, process any queued messages
            if (status == "Connected")
            {
                await ProcessQueuedMessagesAsync(userId, characterName);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling connection status change for character {CharacterName} of user {UserId}", characterName, userId);
        }
    }

    private async Task OnProfileReceived(string userId, string characterName, string profileCharacterName, string profileData)
    {
        try
        {
            _logger.LogInformation("Profile received for character {ProfileCharacterName} by character {CharacterName} (User: {UserId})", 
                profileCharacterName, characterName, userId);

            // Save profile data using ProfileService
            using var scope = _serviceProvider.CreateScope();
            var profileService = scope.ServiceProvider.GetRequiredService<IProfileService>();

            try
            {
                // Try to parse the profile data as structured ProfileData
                var structuredProfile = JsonSerializer.Deserialize<ProfileData>(profileData);
                if (structuredProfile != null)
                {
                    _logger.LogInformation("Saving structured profile for {ProfileCharacterName}: {Summary}",
                        profileCharacterName, structuredProfile.GetSummary());

                    // Save the structured profile data
                    await profileService.SaveStructuredProfileAsync(userId, structuredProfile);

                    // Notify the client that structured profile was received
                    await _hubContext.Clients.Group($"user-{userId}").SendAsync("ProfileReceived", new
                    {
                        CharacterName = profileCharacterName,
                        ProfileData = structuredProfile, // Send the structured object
                        Message = $"Profile data received for {profileCharacterName} ({structuredProfile.GetSummary()})",
                        RequestingCharacter = characterName // Add character context
                    });
                }
                else
                {
                    _logger.LogWarning("Failed to parse structured profile data for {ProfileCharacterName}, falling back to raw storage", profileCharacterName);
                    throw new JsonException("ProfileData deserialization returned null");
                }
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Profile data for {ProfileCharacterName} is not in structured format, saving as raw data", profileCharacterName);

                // Fall back to saving raw profile data
                await profileService.SaveProfileAsync(userId, profileCharacterName, profileData, profileData);

                // Notify the client that raw profile was received
                await _hubContext.Clients.Group($"user-{userId}").SendAsync("ProfileReceived", new
                {
                    CharacterName = profileCharacterName,
                    ProfileData = profileData,
                    Message = $"Profile data received for {profileCharacterName} (raw format)",
                    RequestingCharacter = characterName // Add character context
                });
            }

            _logger.LogInformation("Profile data saved and broadcasted for {ProfileCharacterName} by character {CharacterName} (User: {UserId})", 
                profileCharacterName, characterName, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling profile received for character {ProfileCharacterName} by character {CharacterName} (User: {UserId})", 
                profileCharacterName, characterName, userId);
        }
    }

    public Task<bool> HasWebSocketConnectionAsync(string userId, string characterName)
    {
        _logger.LogInformation("Checking WebSocket connection for user {UserId}, character {CharacterName}", userId, characterName);
        _logger.LogInformation("_connections dictionary has {Count} users: {UserIds}", _connections.Count, string.Join(", ", _connections.Keys));
        
        if (_connections.TryGetValue(userId, out var userConnections))
        {
            _logger.LogInformation("Found user {UserId} in _connections with {Count} characters: {CharacterNames}", 
                userId, userConnections.Count, string.Join(", ", userConnections.Keys));
            
            if (userConnections.TryGetValue(characterName, out var client))
            {
                var isConnected = client.IsConnected;
                _logger.LogInformation("Found WebSocket client for character {CharacterName}, IsConnected = {IsConnected}", characterName, isConnected);
                return Task.FromResult(isConnected);
            }
            else
            {
                _logger.LogInformation("No WebSocket client found for character {CharacterName}", characterName);
            }
        }
        else
        {
            _logger.LogInformation("User {UserId} not found in _connections dictionary", userId);
        }
        
        _logger.LogInformation("HasWebSocketConnectionAsync returning false for character {CharacterName}", characterName);
        return Task.FromResult(false);
    }

    private async Task OnCharacterJoinedChannel(string userId, string characterName, string channelId, ChannelCharacter character)
    {
        try
        {
            _logger.LogInformation("Character {CharacterName} joined channel {ChannelId} for user {UserId}", 
                character.CharacterName, channelId, userId);

            // Update character information in unified character store
            await ExecuteWithCharacterService(cs => cs.UpdateCharacterFromChannelDataAsync(character.CharacterName, character));

            // Broadcast to SignalR clients
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("CharacterJoinedChannel", new
            {
                ChannelId = channelId,
                CharacterName = character.CharacterName,
                JoinedAt = character.JoinedAt,
                Status = character.Status.ToString(),
                StatusMessage = character.StatusMessage,
                Gender = character.Gender,
                RequestingCharacter = characterName
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling character joined channel for user {UserId}", userId);
        }
    }

    private async Task OnCharacterLeftChannel(string userId, string characterName, string channelId, string leftCharacterName)
    {
        try
        {
            _logger.LogInformation("Character {LeftCharacterName} left channel {ChannelId} for user {UserId}", 
                leftCharacterName, channelId, userId);

            // Broadcast to SignalR clients
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("CharacterLeftChannel", new
            {
                ChannelId = channelId,
                CharacterName = leftCharacterName,
                LeftAt = DateTime.UtcNow,
                RequestingCharacter = characterName
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling character left channel for user {UserId}", userId);
        }
    }

    private async Task OnStatusUpdated(string userId, string characterName, string statusCharacterName, string status, string statusMessage)
    {
        try
        {
            _logger.LogInformation("Status update received for {StatusCharacterName}: {Status} - {StatusMessage} (via character {CharacterName} of user {UserId})", 
                statusCharacterName, status, statusMessage, characterName, userId);

            // Update character status in unified character store (batched)
            await BatchUpdateCharacterStatus(statusCharacterName, status, statusMessage, true);

            // Broadcast status update to SignalR clients
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("StatusUpdated", new
            {
                CharacterName = statusCharacterName,
                Status = status,
                StatusMessage = statusMessage,
                Timestamp = DateTime.UtcNow,
                ViaCharacter = characterName // Character that received this status update
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling status update for character {StatusCharacterName} via {CharacterName} of user {UserId}", 
                statusCharacterName, characterName, userId);
        }
    }

    private async Task OnUserOnline(string userId, string characterName, string status, string gender)
    {
        try
        {
            _logger.LogInformation("User came online: {CharacterName} (Status: {Status}, Gender: {Gender}) (via user {UserId})", 
                characterName, status, gender, userId);

            // Update character status in unified character store (batched)
            await BatchUpdateCharacterStatus(characterName, status, null, true);

            // Update gender if provided
            if (!string.IsNullOrEmpty(gender) && gender != "None")
            {
                await ExecuteWithCharacterService(cs => cs.UpdateCharacterGenderAsync(characterName, gender));
            }

            // Broadcast user online status to SignalR clients
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("UserOnline", new
            {
                CharacterName = characterName,
                Status = status,
                Gender = gender,
                Timestamp = DateTime.UtcNow,
                IsOnline = true
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling user online for character {CharacterName} via user {UserId}", 
                characterName, userId);
        }
    }

    private async Task OnUserOffline(string userId, string characterName)
    {
        try
        {
            _logger.LogInformation("User went offline: {CharacterName} (via user {UserId})", characterName, userId);

            // Update character status in unified character store (batched)
            await BatchUpdateCharacterStatus(characterName, "offline", null, false);

            // Broadcast user offline status to SignalR clients
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("UserOffline", new
            {
                CharacterName = characterName,
                Timestamp = DateTime.UtcNow,
                IsOnline = false
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling user offline for character {CharacterName} via user {UserId}", 
                characterName, userId);
        }
    }

    private async Task OnTypingNotificationReceived(string userId, string receivingCharacterName, string fromCharacter, string status)
    {
        try
        {
            _logger.LogInformation("Typing notification: {FromCharacter} -> {ReceivingCharacter} (status: {Status}) via user {UserId}", 
                fromCharacter, receivingCharacterName, status, userId);

            // Broadcast typing notification to SignalR clients (no database storage - transitory data)
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("ReceiveTypingNotification", new
            {
                FromCharacter = fromCharacter,
                ReceivingCharacter = receivingCharacterName,
                Status = status,
                Timestamp = DateTime.UtcNow,
                characterName = receivingCharacterName // Character that received this typing notification
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling typing notification from {FromCharacter} to {ReceivingCharacter} via user {UserId}", 
                fromCharacter, receivingCharacterName, userId);
        }
    }

    private async Task OnFriendsListReceived(string userId, string characterName, List<Friend> friends)
    {
        try
        {
            _logger.LogInformation("Received friends list with {FriendCount} friends for character {CharacterName} of user {UserId}", 
                friends.Count, characterName, userId);

            // Store friends with online status in the WebSocket client
            if (_connections.TryGetValue(userId, out var userConnections) && 
                userConnections.TryGetValue(characterName, out var client))
            {
                // Update the friends list in the client with online status
                client.UpdateFriendsListWithStatus(friends);
            }

            // Broadcast updated friends list to SignalR clients
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("FriendsListUpdated", new
            {
                Friends = friends.Select(f => new
                {
                    Name = f.Name,
                    Status = f.Status,
                    StatusMessage = f.StatusMessage,
                    IsOnline = f.IsOnline,
                    LastSeen = f.LastSeen,
                    Gender = f.Gender
                }).ToArray(),
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling friends list received for character {CharacterName} of user {UserId}", 
                characterName, userId);
        }
    }

    private async Task OnOnlineCharactersListReceived(string userId, string characterName, List<FChatCharacter> onlineCharacters)
    {
        try
        {
            _logger.LogInformation("=== FChatService.OnOnlineCharactersListReceived ===");
            _logger.LogInformation("Received online characters list with {CharacterCount} characters for character {CharacterName} of user {UserId}", 
                onlineCharacters.Count, characterName, userId);

            // Log all characters being processed
            foreach (var fchatCharacter in onlineCharacters)
            {
                _logger.LogInformation("Processing character: {Name} (Status: {Status}, Gender: {Gender})", 
                    fchatCharacter.Name, fchatCharacter.Status, fchatCharacter.Gender);
            }

            // Update character information in unified character store
            foreach (var fchatCharacter in onlineCharacters)
            {
                _logger.LogInformation("Updating character in database: {Name}", fchatCharacter.Name);
                await ExecuteWithCharacterService(cs => cs.UpdateCharacterFromFChatDataAsync(fchatCharacter.Name, fchatCharacter));
            }

            // Update friends list with online status from LIS data
            if (_connections.TryGetValue(userId, out var userConnections) && 
                userConnections.TryGetValue(characterName, out var client))
            {
                _logger.LogInformation("Updating friends list with {CharacterCount} online characters", onlineCharacters.Count);
                
                // Update friends list with online status from LIS (this will cache the data)
                client.UpdateFriendsListWithOnlineStatus(onlineCharacters);
                
                // Also update from cache for efficiency
                client.UpdateFriendsListFromCache();
                
                _logger.LogInformation("Friends list update completed");
            }
            else
            {
                _logger.LogWarning("Could not find client connection for user {UserId} character {CharacterName}", userId, characterName);
            }

            // Broadcast updated online characters to SignalR clients
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("OnlineCharactersUpdated", new
            {
                Characters = onlineCharacters.Select(c => new
                {
                    Name = c.Name,
                    Status = c.Status,
                    StatusMessage = c.StatusMessage,
                    Gender = c.Gender,
                    LastSeen = c.LastSeen
                }).ToArray(),
                Timestamp = DateTime.UtcNow
            });

            // Also broadcast updated channel characters if client has any joined channels
            if (_connections.TryGetValue(userId, out var userConnections2) && 
                userConnections2.TryGetValue(characterName, out var client2))
            {
                var joinedChannels = await client2.GetJoinedChannelsAsync();
                foreach (var channelId in joinedChannels)
                {
                    var channelCharacters = await client2.GetChannelCharactersAsync(channelId);
                    if (channelCharacters.Any())
                    {
                        await _hubContext.Clients.Group($"user-{userId}").SendAsync("ChannelCharactersUpdated", new
                        {
                            ChannelId = channelId,
                            Characters = channelCharacters.Select(cc => new
                            {
                                CharacterName = cc.CharacterName,
                                Status = cc.Status.ToString().ToLower(),
                                StatusMessage = cc.StatusMessage,
                                Gender = cc.Gender,
                                LastSeenAt = cc.LastSeenAt,
                                JoinedAt = cc.JoinedAt
                            }).ToArray(),
                            Timestamp = DateTime.UtcNow
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling online characters list received for character {CharacterName} of user {UserId}", 
                characterName, userId);
        }
    }

    private async Task OnCharacterError(string userId, string characterName, string? errorCharacterName, string errorMessage)
    {
        try
        {
            _logger.LogWarning("Character error received for user {UserId}, character {CharacterName}: {ErrorMessage} (Error Character: {ErrorCharacterName})", 
                userId, characterName, errorMessage, errorCharacterName ?? "unknown");

            // Determine the type of error and provide appropriate user feedback
            var errorType = DetermineCharacterErrorType(errorMessage);
            var userFriendlyMessage = GetUserFriendlyErrorMessage(errorType, errorCharacterName, errorMessage);

            // Broadcast the error to the frontend
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("CharacterError", new
            {
                ErrorType = errorType,
                CharacterName = errorCharacterName,
                Message = userFriendlyMessage,
                OriginalError = errorMessage,
                Timestamp = DateTime.UtcNow
            });

            _logger.LogInformation("Character error notification sent to user {UserId} for character {CharacterName}", userId, characterName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling character error for character {CharacterName} of user {UserId}", 
                characterName, userId);
        }
    }

    private string DetermineCharacterErrorType(string errorMessage)
    {
        if (errorMessage.Contains("character requested was not found") || 
            errorMessage.Contains("character not found") ||
            errorMessage.Contains("user not found"))
        {
            return "CharacterNotFound";
        }
        else if (errorMessage.Contains("not online") || 
                 errorMessage.Contains("offline"))
        {
            return "CharacterOffline";
        }
        else if (errorMessage.Contains("doesn't exist"))
        {
            return "CharacterDoesNotExist";
        }
        else
        {
            return "UnknownCharacterError";
        }
    }

    private string GetUserFriendlyErrorMessage(string errorType, string? characterName, string originalError)
    {
        return errorType switch
        {
            "CharacterNotFound" => $"Character '{characterName ?? "Unknown"}' was not found. They may be offline or the name may be misspelled.",
            "CharacterOffline" => $"Character '{characterName ?? "Unknown"}' is currently offline.",
            "CharacterDoesNotExist" => $"Character '{characterName ?? "Unknown"}' does not exist.",
            "UnknownCharacterError" => $"An error occurred: {originalError}",
            _ => $"Character error: {originalError}"
        };
    }

    #endregion

    #region IDisposable

    public void Dispose()
    {
        _characterUpdateTimer?.Dispose();
        _characterUpdateSemaphore?.Dispose();
        _channelCacheSemaphore?.Dispose();
        
        // Dispose all WebSocket connections
        foreach (var userConnections in _connections.Values)
        {
            foreach (var client in userConnections.Values)
            {
                client.Dispose();
            }
        }
        _connections.Clear();
    }

    private async Task OnSearchResultsReceived(string userId, string characterName, List<SearchResult> searchResults)
    {
        try
        {
            _logger.LogInformation("=== FChatService.OnSearchResultsReceived ===");
            _logger.LogInformation("Received search results with {ResultCount} characters for character {CharacterName} of user {UserId}", 
                searchResults.Count, characterName, userId);

            // Log all search results being processed
            foreach (var result in searchResults)
            {
                _logger.LogInformation("Looking up character details for: {CharacterName}", result.CharacterName);
            }

            // Look up character details for each search result
            var enrichedResults = new List<SearchResult>();
            
            foreach (var result in searchResults)
            {
                // Try to get character details from our database/cache
                var characterDetails = GetCharacterDetailsAsync(result.CharacterName);
                if (characterDetails != null)
                {
                    enrichedResults.Add(new SearchResult
                    {
                        CharacterName = result.CharacterName,
                        Status = characterDetails.Status,
                        StatusMessage = characterDetails.StatusMessage,
                        Gender = characterDetails.Gender,
                        IsOnline = characterDetails.IsOnline,
                        LastSeen = characterDetails.LastSeen
                    });
                }
                else
                {
                    // If we don't have details, add the basic result
                    enrichedResults.Add(result);
                }
            }

            // Broadcast search results to SignalR clients
            await _hubContext.Clients.Group($"user-{userId}").SendAsync("SearchResultsReceived", new
            {
                Results = enrichedResults.Select(r => new
                {
                    CharacterName = r.CharacterName,
                    Status = r.Status,
                    StatusMessage = r.StatusMessage,
                    Gender = r.Gender,
                    IsOnline = r.IsOnline,
                    LastSeen = r.LastSeen
                }).ToArray(),
                Timestamp = DateTime.UtcNow
            });

            _logger.LogInformation("Search results broadcast completed for character {CharacterName} of user {UserId}", characterName, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling search results received for character {CharacterName} of user {UserId}", 
                characterName, userId);
        }
    }

    private SearchResult? GetCharacterDetailsAsync(string characterName)
    {
        try
        {
            // This would typically look up character details from your database
            // For now, we'll return null to indicate we don't have cached details
            // In a real implementation, you'd query your character database here
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting character details for {CharacterName}", characterName);
            return null;
        }
    }

    #endregion
}