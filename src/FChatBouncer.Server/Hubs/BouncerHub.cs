using FChatBouncer.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace FChatBouncer.Server.Hubs;

[Authorize]
public class BouncerHub : Hub
{
    private readonly IUserService _userService;
    private readonly IMessageService _messageService;
    private readonly IFChatService _fChatService;
    private readonly IProfileService _profileService;
    private readonly TicketManager _ticketManager;
    private readonly ILogger<BouncerHub> _logger;
    
    // Store pending credential requests
    private static readonly Dictionary<string, CredentialRequest> _pendingCredentialRequests = new();

    public BouncerHub(
        IUserService userService,
        IMessageService messageService,
        IFChatService fChatService,
        IProfileService profileService,
        TicketManager ticketManager,
        ILogger<BouncerHub> logger)
    {
        _userService = userService;
        _messageService = messageService;
        _fChatService = fChatService;
        _profileService = profileService;
        _ticketManager = ticketManager;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier;
        _logger.LogInformation($"SignalR connection attempt - UserId: {userId}, ConnectionId: {Context.ConnectionId}");
        
        if (userId != null)
        {
            _logger.LogInformation("User {UserId} connected to bouncer hub", userId);

            // Add to user group for targeted messaging
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user-{userId}");

            // Clean up any invalid character connections first
            await _fChatService.CleanupInvalidCharactersAsync(userId);

            // Check if user is already connected to F-Chat (bouncer pattern)
            var isAlreadyConnected = await _fChatService.IsUserConnectedAsync(userId);
            _logger.LogInformation("User {UserId} connection check: Already connected to F-Chat = {IsConnected}", userId, isAlreadyConnected);

            if (isAlreadyConnected)
            {
                _logger.LogInformation("User {UserId} reconnecting to existing F-Chat connection (bouncer mode), will reuse WebSocket connection", userId);

                // Get current state from existing connection
                var selectedCharacter = await _fChatService.GetSelectedCharacterAsync(userId);
                var joinedChannelDetails = await _fChatService.GetJoinedChannelDetailsAsync(userId);

                if (selectedCharacter != null)
                {
                    // Send recent messages for all joined channels
                    await SendRecentMessages(userId);

                    // Notify bouncer reconnection with full state
                    await Clients.Caller.SendAsync("BouncerReconnected", new
                    {
                        Character = new
                        {
                            selectedCharacter.Name,
                            selectedCharacter.Status,
                            selectedCharacter.StatusMessage,
                            selectedCharacter.Gender
                        },
                        JoinedChannels = joinedChannelDetails.Select(c => new
                        {
                            c.Id,
                            c.Name,
                            c.Title,
                            c.UserCount,
                            Mode = c.Mode.ToString()
                        }).ToArray(),
                        Message = "Reconnected to existing F-Chat session"
                    });
                }
                else
                {
                    // F-Chat connected but no character selected yet
                    await Clients.Caller.SendAsync("BouncerReconnected", new
                    {
                        Character = (object?)null,
                        JoinedChannels = Array.Empty<string>(),
                        Message = "Reconnected to F-Chat, please select character"
                    });
                }
            }
            else
            {
                _logger.LogInformation("User {UserId} connecting for first time, waiting for character selection", userId);

                // Fresh connection - don't initialize F-Chat automatically
                // Let the user select a character first, then create the connection
                
                // Notify user to select a character
                await Clients.Caller.SendAsync("BouncerReconnected", new
                {
                    Character = (object?)null,
                    JoinedChannels = new List<object>(),
                    Message = "Connected to Bouncer, please select a character"
                });
            }

            // Notify connection status
            await Clients.Caller.SendAsync("NotifyConnectionStatus", new ConnectionStatusDto(
                true,
                "Connected to Bouncer",
                DateTime.UtcNow
            ));
        }
        else
        {
            _logger.LogWarning("SignalR connection rejected - no valid user identifier found");
            throw new UnauthorizedAccessException("Authentication required for SignalR connection");
        }

        await base.OnConnectedAsync();
    }

    private async Task InitializeFChatConnection(string userId)
    {
        try
        {
            var settings = await _userService.GetUserSettingsAsync(userId);
            if (settings?.FChatCredentialsEncrypted != null)
            {
                // Decode F-Chat credentials (this is a simplified version - should use proper encryption)
                var credentialsBytes = Convert.FromBase64String(settings.FChatCredentialsEncrypted);
                var credentials = System.Text.Encoding.UTF8.GetString(credentialsBytes);
                var parts = credentials.Split(':');

                if (parts.Length == 2)
                {
                    await _fChatService.ConnectUserAsync(userId, parts[0], parts[1]);
                    _logger.LogInformation("F-Chat connection initiated for user {UserId}", userId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize F-Chat connection for user {UserId}", userId);
            await Clients.Caller.SendAsync("NotifyConnectionStatus", new ConnectionStatusDto(
                false,
                "Failed to connect to F-Chat",
                DateTime.UtcNow
            ));
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier;
        if (userId != null)
        {
            _logger.LogInformation("User {UserId} disconnected from bouncer hub", userId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user-{userId}");

            // Note: Don't disconnect from F-Chat here - keep connection alive for bouncing
            // F-Chat connections should persist even when client disconnects
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task GetCharacters()
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting character list", userId);

        try
        {
            var characters = await _fChatService.GetCharactersAsync(userId);

            // If no characters found, try to refresh the connection and try again
            if (characters.Count == 0)
            {
                _logger.LogInformation("No characters found for user {UserId}, attempting to refresh connection", userId);
                
                // Try to refresh the user's F-Chat connection
                await _fChatService.RefreshUserConnectionAsync(userId);
                
                // Try getting characters again after refresh
                characters = await _fChatService.GetCharactersAsync(userId);
            }

            if (characters.Count == 0)
            {
                _logger.LogInformation("No characters found for user {UserId} even after refresh, returning empty list", userId);
                await Clients.Caller.SendAsync("ReceiveCharacters", new List<object>());
                return;
            }

            _logger.LogInformation("Returning {Count} characters for user {UserId}", characters.Count, userId);
            await Clients.Caller.SendAsync("ReceiveCharacters", characters.Select(c => new
            {
                c.Name,
                c.Status,
                c.StatusMessage,
                c.Gender
            }).ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get characters for user {UserId}", userId);
            await Clients.Caller.SendAsync("CharacterError", "Failed to get character list");
        }
    }

    public async Task SelectCharacter(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} selecting character {CharacterName}", userId, characterName);

        try
        {
            // Check if user is already connected to F-Chat with a healthy connection
            var isConnected = await _fChatService.IsUserConnectedAsync(userId);
            _logger.LogInformation("User {UserId} connection check: IsUserConnectedAsync = {IsConnected}", userId, isConnected);
            
            if (isConnected)
            {
                _logger.LogInformation("User {UserId} has existing F-Chat connection, checking if character can be reused", userId);

                // Get the currently selected character on the existing connection
                var currentCharacter = await _fChatService.GetSelectedCharacterAsync(userId);

                if (currentCharacter?.Name == characterName)
                {
                    _logger.LogInformation("User {UserId} already connected as character {CharacterName}, reusing existing connection", userId, characterName);
                    // Character matches, we can reuse the connection as-is
                }
                else
                {
                    _logger.LogInformation("User {UserId} connected as {CurrentCharacter} but needs {NewCharacter}, creating new connection",
                        userId, currentCharacter?.Name ?? "unknown", characterName);

                    // Different character needed, must disconnect and create new connection
                    await _fChatService.DisconnectUserAsync(userId);

                    // Create new character connection using ConnectCharacterAsync
                    // Request credentials from client for character connection
                    _logger.LogInformation("Requesting credentials for character connection: {CharacterName}", characterName);
                    await RequestFChatCredentials(characterName);
                }
            }
            else
            {
                // No existing connection, create new character connection
                _logger.LogInformation("No existing F-Chat connection, creating new character connection for {CharacterName}", characterName);
                
                // Get user credentials
                var settings = await _userService.GetUserSettingsAsync(userId);
                if (settings?.FChatCredentialsEncrypted != null)
                {
                    // Decode F-Chat credentials
                    var credentialsBytes = Convert.FromBase64String(settings.FChatCredentialsEncrypted);
                    var credentials = System.Text.Encoding.UTF8.GetString(credentialsBytes);
                    var parts = credentials.Split(':');

                    if (parts.Length == 2)
                    {
                        // Create character connection for the selected character
                        _logger.LogInformation("About to call ConnectCharacterAsync for {CharacterName} with username {Username}", characterName, parts[0]);
                        await _fChatService.ConnectCharacterAsync(userId, characterName, parts[0], parts[1]);
                        _logger.LogInformation("Successfully created character connection for {CharacterName}", characterName);
                    }
                    else
                    {
                        throw new InvalidOperationException("Invalid credentials format");
                    }
                }
                else
                {
                    throw new InvalidOperationException("No F-Chat credentials found");
                }
            }

            // Send recent messages now that character is selected
            await SendRecentMessages(userId);

            // Notify successful character selection
            await Clients.Caller.SendAsync("CharacterSelected", new { CharacterName = characterName });

            // Update connection status
            await Clients.Caller.SendAsync("NotifyConnectionStatus", new ConnectionStatusDto(
                true,
                $"Connected as {characterName}",
                DateTime.UtcNow
            ));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to select character {CharacterName} for user {UserId}", characterName, userId);
            await Clients.Caller.SendAsync("CharacterError", "Failed to select character");
        }
    }

    public async Task SetSelectedCharacter(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} setting selected character {CharacterName} (restoration)", userId, characterName);

        try
        {
            // Check if the character exists in the user's available characters
            var availableCharacters = await _fChatService.GetCharactersAsync(userId);
            var character = availableCharacters.FirstOrDefault(c => c.Name == characterName);

            if (character == null)
            {
                _logger.LogWarning("Character {CharacterName} not found for user {UserId}", characterName, userId);
                await Clients.Caller.SendAsync("CharacterError", $"Character '{characterName}' not found");
                return;
            }

            // Check if user is already connected to F-Chat with a healthy connection
            if (await _fChatService.IsUserConnectedAsync(userId))
            {
                _logger.LogInformation("User {UserId} has existing F-Chat connection, checking if character can be reused", userId);

                // Get the currently selected character on the existing connection
                var currentCharacter = await _fChatService.GetSelectedCharacterAsync(userId);

                if (currentCharacter?.Name == characterName)
                {
                    _logger.LogInformation("User {UserId} already connected as character {CharacterName}, reusing existing connection", userId, characterName);
                    // Character matches, we can reuse the connection as-is
                }
                else
                {
                    _logger.LogInformation("User {UserId} connected as {CurrentCharacter} but needs {NewCharacter}, creating new connection",
                        userId, currentCharacter?.Name ?? "unknown", characterName);

                    // Different character needed, must disconnect and create new connection
                    await _fChatService.DisconnectUserAsync(userId);

                    // Create new character connection using ConnectCharacterAsync
                    // Request credentials from client for character connection
                    _logger.LogInformation("Requesting credentials for character connection: {CharacterName}", characterName);
                    await RequestFChatCredentials(characterName);
                }
            }
            else
            {
                // No existing connection, use full character selection
                await _fChatService.SelectCharacterAsync(userId, characterName);
            }

            // Send recent messages
            await SendRecentMessages(userId);

            // Notify successful character restoration
            await Clients.Caller.SendAsync("CharacterRestored", new { CharacterName = characterName });

            // Update connection status
            await Clients.Caller.SendAsync("NotifyConnectionStatus", new ConnectionStatusDto(
                true,
                $"Restored connection as {characterName}",
                DateTime.UtcNow
            ));

            _logger.LogInformation("Successfully restored character {CharacterName} for user {UserId}", characterName, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set selected character {CharacterName} for user {UserId}", characterName, userId);
            await Clients.Caller.SendAsync("CharacterError", $"Failed to restore character: {ex.Message}");
        }
    }

    public async Task GetChannelList()
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting channel list", userId);

        // Check if user has an active character
        _logger.LogInformation("Checking for active character for user {UserId}", userId);
        var activeCharacter = await _fChatService.GetActiveCharacterAsync(userId);
        _logger.LogInformation("Active character for user {UserId}: {ActiveCharacter}", userId, activeCharacter ?? "null");
        
        if (activeCharacter == null)
        {
            _logger.LogWarning("No active character found for user {UserId}, sending error", userId);
            await Clients.Caller.SendAsync("ChannelListError", "Please select a character first");
            return;
        }

        _logger.LogInformation("User {UserId} requesting channel list for active character {ActiveCharacter}", userId, activeCharacter);

        try
        {
            var channels = await _fChatService.GetAvailableChannelsAsync(userId, activeCharacter);
            var channelDtos = channels.Select(c => new ChannelDto
            {
                Id = c.Id,
                Name = c.Name,
                Title = c.Title,
                UserCount = c.UserCount,
                Mode = c.Mode.ToString()
            }).ToArray();

            await Clients.Caller.SendAsync("ReceiveChannelList", channelDtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get channel list for user {UserId}", userId);
            await Clients.Caller.SendAsync("ChannelListError", $"Failed to get channels: {ex.Message}");
        }
    }

    public async Task SubscribeToChannels(string[] channels)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        // Check if user has selected a character
        var selectedCharacter = await _fChatService.GetSelectedCharacterAsync(userId);
        if (selectedCharacter == null)
        {
            await Clients.Caller.SendAsync("SubscriptionError", "Please select a character first");
            return;
        }

        _logger.LogInformation("User {UserId} subscribing to channels: {Channels}", userId, string.Join(", ", channels));

        try
        {
            // Join F-Chat channels
            foreach (var channel in channels)
            {
                await _fChatService.JoinChannelAsync(userId, channel);

                // Update database to track subscription
                // TODO: Implement channel subscription tracking in database
            }

            // Notify client of successful subscription
            await Clients.Caller.SendAsync("ChannelsSubscribed", channels);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to subscribe user {UserId} to channels", userId);
            await Clients.Caller.SendAsync("SubscriptionError", "Failed to subscribe to channels");
        }
    }

    public async Task SendMessage(string channel, string content)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        // Check if user has selected a character
        var selectedCharacter = await _fChatService.GetSelectedCharacterAsync(userId);
        if (selectedCharacter == null)
        {
            await Clients.Caller.SendAsync("MessageError", "Please select a character first");
            return;
        }

        _logger.LogInformation("User {UserId} sending message to channel {Channel} as {Character}", userId, channel, selectedCharacter.Name);

        // Check if F-Chat connection is available
        var isConnected = await _fChatService.IsUserConnectedAsync(userId);

        if (!isConnected)
        {
            // Queue message for later delivery
            _logger.LogInformation("F-Chat not connected for user {UserId}, queuing message", userId);

            await _messageService.QueueMessageAsync(
                userId,
                channel,
                selectedCharacter.Name,
                content,
                Models.MessageType.Chat
            );

            // Notify client that message was queued
            await Clients.Caller.SendAsync("MessageQueued", new
            {
                Channel = channel,
                Content = content,
                QueuedAt = DateTime.UtcNow,
                Message = "Message queued - will be sent when F-Chat connection is restored"
            });

            return;
        }

        try
        {
            if (channel[..4] == "PRI-")
            {
                await _fChatService.SendPRIMessageAsync(userId, channel[4..], content);
            }
            else
            {
                // Send message to F-Chat server
                await _fChatService.SendMessageAsync(userId, channel, content);
            }

            // Store message in database using character name as sender
                await _messageService.SaveMessageAsync(
                    userId,
                    channel,
                    selectedCharacter.Name,
                    content,
                    Models.MessageType.Chat,
                    selectedCharacter.Name
                );

            // Broadcast to other connected clients of this user
            await Clients.Group($"user-{userId}").SendAsync("ReceiveMessage", new
            {
                Channel = channel,
                Sender = selectedCharacter.Name,
                Content = content,
                Timestamp = DateTime.UtcNow,
                MessageType = "Chat",
                characterName = selectedCharacter.Name, // Character that sent this message
                isActiveCharacter = true // This is the active character sending the message
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send message from user {UserId} to channel {Channel}", userId, channel);

            // If sending failed, queue the message for retry
            await _messageService.QueueMessageAsync(
                userId,
                channel,
                selectedCharacter.Name,
                content,
                Models.MessageType.Chat
            );

            await Clients.Caller.SendAsync("MessageError", "Failed to send message - queued for retry when connection is restored");
        }
    }

    public async Task RequestHistory(string channel, DateTime since, int limit = 100)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting history for channel {Channel} since {Since} limit {Limit}", userId, channel, since, limit);

        try
        {
            var messages = await _messageService.GetMessagesAsync(userId, channel, since, limit);
            //var messageCount = await _messageService.GetMessagesCountAsync(userId, channel, since);
            var messageCount = messages.Count;
            var hasMore = messageCount > limit;

            _logger.LogInformation("Found {MessageCount} messages for user {UserId} channel {Channel}, returning {ReturnedCount}", 
                messageCount, userId, channel, messages.Count);

            await Clients.Caller.SendAsync("ReceiveHistory", new HistoryDto(
                channel,
                messages.ToArray(),
                hasMore
            ));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get history for user {UserId} channel {Channel}", userId, channel);
            await Clients.Caller.SendAsync("HistoryError", "Failed to retrieve message history");
        }
    }

    public async Task ClearAllHistory()
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting to clear all message history", userId);

        try
        {
            var deletedCount = await _messageService.PurgeMessagesAsync(userId);
            _logger.LogInformation("Cleared {DeletedCount} messages for user {UserId}", deletedCount, userId);

            await Clients.Caller.SendAsync("HistoryCleared", new { DeletedCount = deletedCount });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear history for user {UserId}", userId);
            await Clients.Caller.SendAsync("HistoryError", "Failed to clear message history");
        }
    }

    private async Task SendRecentMessages(string userId)
    {
        try
        {
            var since = DateTime.UtcNow.AddDays(-1);
            var recentMessages = await _messageService.GetRecentMessagesAsync(userId, since);

            if (recentMessages.Count > 0)
            {
                await Clients.Caller.SendAsync("ReceiveRecentMessages", recentMessages.ToArray());
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send recent messages for user {UserId}", userId);
        }
    }

    // Method to be called by F-Chat service when receiving messages from F-Chat
    public async Task BroadcastMessageToUser(string userId, MessageDto message)
    {
        await Clients.Group($"user-{userId}").SendAsync("ReceiveMessage", message);
    }

    // Method to broadcast connection status changes
    public async Task BroadcastConnectionStatus(string userId, ConnectionStatusDto status)
    {
        await Clients.Group($"user-{userId}").SendAsync("NotifyConnectionStatus", status);
    }

    public async Task RequestProfile(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting profile for character {CharacterName}", userId, characterName);

        try
        {
            await _profileService.RequestProfileAsync(userId, characterName);

            // Notify client that profile request was sent
            await Clients.Caller.SendAsync("ProfileRequested", new
            {
                CharacterName = characterName,
                Message = $"Profile request sent for {characterName}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to request profile for character {CharacterName} (User: {UserId})", characterName, userId);
            await Clients.Caller.SendAsync("ProfileError", $"Failed to request profile for {characterName}");
        }
    }

    public async Task GetBasicInfo(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting basic info for character {CharacterName}", userId, characterName);

        try
        {
            // Get cached profile data without triggering new requests
            var profileData = await _profileService.GetCachedProfileAsync(userId, characterName, allowStale: true);

            if (profileData == null)
            {
                _logger.LogInformation("No cached profile data found for character {CharacterName} (User: {UserId})", characterName, userId);
                await Clients.Caller.SendAsync("ReceiveBasicInfo", new
                {
                    CharacterName = characterName,
                    Gender = (string?)null,
                    Species = (string?)null,
                    Status = (string?)null,
                    CustomStatus = (string?)null,
                    LastSeen = (DateTime?)null,
                    HasData = false,
                    Message = "No cached data available for this character"
                });
                return;
            }

            // Extract basic info from cached profile data
            var basicInfo = new
            {
                CharacterName = characterName,
                Gender = profileData.Gender ?? profileData.Info.GetValueOrDefault("Gender"),
                Species = profileData.Info.GetValueOrDefault("Species"),
                Status = profileData.Info.GetValueOrDefault("Status"),
                CustomStatus = profileData.Info.GetValueOrDefault("Custom Status"),
                LastSeen = profileData.Timestamp,
                HasData = true,
                Message = "Basic info retrieved from cached data"
            };

            _logger.LogInformation("Retrieved basic info for character {CharacterName} (User: {UserId}): Gender={Gender}, Species={Species}, Status={Status}", 
                characterName, userId, basicInfo.Gender, basicInfo.Species, basicInfo.Status);

            await Clients.Caller.SendAsync("ReceiveBasicInfo", basicInfo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get basic info for character {CharacterName} (User: {UserId})", characterName, userId);
            await Clients.Caller.SendAsync("BasicInfoError", $"Failed to get basic info for {characterName}");
        }
    }

    #region Multi-Character Management Methods

    public async Task ConnectCharacter(string characterName, string fchatUsername, string fchatPassword)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} connecting character {CharacterName}", userId, characterName);

        try
        {
            await _fChatService.ConnectCharacterAsync(userId, characterName, fchatUsername, fchatPassword);

            // Notify successful character connection
            await Clients.Caller.SendAsync("CharacterConnected", new
            {
                CharacterName = characterName,
                Message = $"Character {characterName} connected successfully"
            });

            // Send recent messages for this character
            await SendRecentMessages(userId, characterName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect character {CharacterName} for user {UserId}", characterName, userId);
            await Clients.Caller.SendAsync("CharacterError", $"Failed to connect character {characterName}");
        }
    }

    public async Task SetActiveCharacter(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} setting active character to {CharacterName}", userId, characterName);

        try
        {
            _logger.LogInformation("Calling SetActiveCharacterAsync for user {UserId}, character {CharacterName}", userId, characterName);
            await _fChatService.SetActiveCharacterAsync(userId, characterName);
            _logger.LogInformation("SetActiveCharacterAsync completed successfully for user {UserId}, character {CharacterName}", userId, characterName);

            // Check if this character already exists in the database (to avoid creating duplicates)
            var existingConnection = await _fChatService.GetCharacterConnectionAsync(userId, characterName);
            var hasWebSocketConnection = await _fChatService.HasWebSocketConnectionAsync(userId, characterName);
            _logger.LogInformation("HasWebSocketConnectionAsync returned {HasConnection} for character {CharacterName}", hasWebSocketConnection, characterName);
            
            // Only create a new WebSocket connection if the character doesn't exist in the database at all
            if (existingConnection == null && !hasWebSocketConnection)
            {
                _logger.LogInformation("No WebSocket connection found for character {CharacterName}, creating one", characterName);
                
                // Get user credentials and create WebSocket connection
                var settings = await _userService.GetUserSettingsAsync(userId);
                if (settings?.FChatCredentialsEncrypted != null)
                {
                    var credentialsBytes = Convert.FromBase64String(settings.FChatCredentialsEncrypted);
                    var credentials = System.Text.Encoding.UTF8.GetString(credentialsBytes);
                    var parts = credentials.Split(':');

                    if (parts.Length == 2)
                    {
                        _logger.LogInformation("About to call ConnectCharacterAsync for {CharacterName} with username {Username}", characterName, parts[0]);
                        await _fChatService.ConnectCharacterAsync(userId, characterName, parts[0], parts[1]);
                        _logger.LogInformation("Successfully created WebSocket connection for {CharacterName}", characterName);
                    }
                    else
                    {
                        throw new InvalidOperationException("Invalid credentials format");
                    }
                }
                else
                {
                    throw new InvalidOperationException("No F-Chat credentials found");
                }
            }
            else if (existingConnection != null && !hasWebSocketConnection)
            {
                _logger.LogInformation("Character {CharacterName} exists in database but WebSocket connection is missing, reconnecting", characterName);
                
                // Get user credentials and recreate WebSocket connection
                // Request credentials from client for reconnection
                _logger.LogInformation("Requesting credentials for character reconnection: {CharacterName}", characterName);
                await RequestFChatCredentials(characterName);
            }
            else
            {
                _logger.LogInformation("Character {CharacterName} already has active WebSocket connection", characterName);
            }

            // Notify successful character activation (using the same event as SwitchActiveCharacter for consistency)
            await Clients.Caller.SendAsync("ActiveCharacterSwitched", new
            {
                CharacterName = characterName,
                Message = $"Active character set to {characterName}"
            });

            // Send recent messages for this character
            await SendRecentMessages(userId, characterName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set active character {CharacterName} for user {UserId}", characterName, userId);
            await Clients.Caller.SendAsync("CharacterError", $"Failed to set active character {characterName}");
        }
    }

    public async Task DisconnectCharacter(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} disconnecting character {CharacterName}", userId, characterName);

        try
        {
            await _fChatService.DisconnectCharacterAsync(userId, characterName);

            // Notify successful character disconnection
            await Clients.Caller.SendAsync("CharacterDisconnected", new
            {
                CharacterName = characterName,
                Message = $"Character {characterName} disconnected"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to disconnect character {CharacterName} for user {UserId}", characterName, userId);
            await Clients.Caller.SendAsync("CharacterError", $"Failed to disconnect character {characterName}");
        }
    }

    public async Task SwitchActiveCharacter(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("=== BACKEND: SwitchActiveCharacter method called ===");
        _logger.LogInformation("User {UserId} switching active character to {CharacterName}", userId, characterName);

        try
        {
            _logger.LogInformation("Calling SetActiveCharacterAsync...");
            await _fChatService.SetActiveCharacterAsync(userId, characterName);
            _logger.LogInformation("SetActiveCharacterAsync completed");

            // Check if this character already exists in the database and has a WebSocket connection
            var existingConnection = await _fChatService.GetCharacterConnectionAsync(userId, characterName);
            var hasWebSocketConnection = await _fChatService.HasWebSocketConnectionAsync(userId, characterName);
            _logger.LogInformation("HasWebSocketConnectionAsync returned {HasConnection} for character {CharacterName}", hasWebSocketConnection, characterName);
            
            // Create or reconnect WebSocket connection if needed
            if (existingConnection == null && !hasWebSocketConnection)
            {
                _logger.LogInformation("No WebSocket connection found for character {CharacterName}, creating one", characterName);
                
                // Get user credentials and create WebSocket connection
                var settings = await _userService.GetUserSettingsAsync(userId);
                if (settings?.FChatCredentialsEncrypted != null)
                {
                    var credentialsBytes = Convert.FromBase64String(settings.FChatCredentialsEncrypted);
                    var credentials = System.Text.Encoding.UTF8.GetString(credentialsBytes);
                    var parts = credentials.Split(':');

                    if (parts.Length == 2)
                    {
                        _logger.LogInformation("About to call ConnectCharacterAsync for {CharacterName} with username {Username}", characterName, parts[0]);
                        await _fChatService.ConnectCharacterAsync(userId, characterName, parts[0], parts[1]);
                        _logger.LogInformation("Successfully created WebSocket connection for {CharacterName}", characterName);
                    }
                    else
                    {
                        throw new InvalidOperationException("Invalid credentials format");
                    }
                }
                else
                {
                    throw new InvalidOperationException("No F-Chat credentials found");
                }
            }
            else if (existingConnection != null && !hasWebSocketConnection)
            {
                _logger.LogInformation("Character {CharacterName} exists in database but WebSocket connection is missing, reconnecting", characterName);
                
                // Get user credentials and recreate WebSocket connection
                // Request credentials from client for reconnection
                _logger.LogInformation("Requesting credentials for character reconnection: {CharacterName}", characterName);
                await RequestFChatCredentials(characterName);
            }
            else
            {
                _logger.LogInformation("Character {CharacterName} already has active WebSocket connection", characterName);
            }

            // Send recent messages for the newly active character
            _logger.LogInformation("Sending recent messages...");
            await SendRecentMessages(userId, characterName);
            _logger.LogInformation("Recent messages sent");

            // Notify successful character switch
            _logger.LogInformation("Sending ActiveCharacterSwitched event...");
            _logger.LogInformation("Current connection ID: {ConnectionId}", Context.ConnectionId);
            _logger.LogInformation("Current user ID: {UserId}", userId);
            await Clients.Caller.SendAsync("ActiveCharacterSwitched", new
            {
                CharacterName = characterName,
                Message = $"Switched to character {characterName}"
            });
            _logger.LogInformation("ActiveCharacterSwitched event sent successfully");
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("overloaded"))
        {
            _logger.LogError(ex, "F-List server overloaded while switching to character {CharacterName} for user {UserId}", characterName, userId);
            await Clients.Caller.SendAsync("CharacterError", new
            {
                ErrorType = "ServerOverloaded",
                CharacterName = characterName,
                Message = "F-List server is currently overloaded. Please try switching characters again in a few minutes.",
                OriginalError = ex.Message,
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to switch active character to {CharacterName} for user {UserId}", characterName, userId);
            await Clients.Caller.SendAsync("CharacterError", new
            {
                ErrorType = "SwitchFailed",
                CharacterName = characterName,
                Message = $"Failed to switch to character {characterName}",
                OriginalError = ex.Message,
                Timestamp = DateTime.UtcNow
            });
        }
    }

    public async Task GetActiveCharacters()
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting active characters", userId);

        try
        {
            var characterConnections = await _fChatService.GetUserCharacterConnectionsAsync(userId);
            var activeCharacter = await _fChatService.GetActiveCharacterAsync(userId);

            await Clients.Caller.SendAsync("ReceiveActiveCharacters", new
            {
                Characters = characterConnections.Select(cc => new
                {
                    characterName = cc.Character.Name,
                    cc.IsConnected,
                    cc.IsActive,
                    cc.ConnectedAt,
                    cc.LastActivityAt
                }).ToArray(),
                ActiveCharacter = activeCharacter
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get active characters for user {UserId}", userId);
            await Clients.Caller.SendAsync("CharacterError", "Failed to get active characters");
        }
    }

    public async Task GetCharactersForCharacter(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting character list for character {CharacterName}", userId, characterName);

        try
        {
            var characters = await _fChatService.GetCharactersAsync(userId, characterName);

            await Clients.Caller.SendAsync("ReceiveCharacters", characters.Select(c => new
            {
                c.Name,
                c.Status,
                c.StatusMessage,
                c.Gender,
                RequestingCharacter = characterName
            }).ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get characters for character {CharacterName} of user {UserId}", characterName, userId);
            await Clients.Caller.SendAsync("CharacterError", "Failed to get character list");
        }
    }

    public async Task JoinChannelForCharacter(string characterName, string channel)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("Character {CharacterName} of user {UserId} joining channel {Channel}", characterName, userId, channel);

        try
        {
            await _fChatService.JoinChannelAsync(userId, characterName, channel);

            // Notify successful channel join
            await Clients.Caller.SendAsync("ChannelJoined", new
            {
                Channel = channel,
                CharacterName = characterName,
                Message = $"Character {characterName} joined channel {channel}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to join channel {Channel} for character {CharacterName} of user {UserId}", channel, characterName, userId);
            await Clients.Caller.SendAsync("ChannelError", $"Failed to join channel {channel}");
        }
    }

    public async Task LeaveChannelForCharacter(string characterName, string channel)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("Character {CharacterName} of user {UserId} leaving channel {Channel}", characterName, userId, channel);

        try
        {
            await _fChatService.LeaveChannelAsync(userId, characterName, channel);

            // Notify successful channel leave
            await Clients.Caller.SendAsync("ChannelLeft", new
            {
                Channel = channel,
                CharacterName = characterName,
                Message = $"Character {characterName} left channel {channel}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to leave channel {Channel} for character {CharacterName} of user {UserId}", channel, characterName, userId);
            await Clients.Caller.SendAsync("ChannelError", $"Failed to leave channel {channel}");
        }
    }

    public async Task SendMessageFromCharacter(string characterName, string channel, string content)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("Character {CharacterName} of user {UserId} sending message to channel {Channel}", characterName, userId, channel);

        // Check if F-Chat connection is available for this character
        var isConnected = await _fChatService.IsCharacterConnectedAsync(userId, characterName);

        if (!isConnected)
        {
            // Queue message for later delivery
            _logger.LogInformation("F-Chat not connected for character {CharacterName} of user {UserId}, queuing message", characterName, userId);

            await _messageService.QueueMessageAsync(
                userId,
                channel,
                characterName,
                content,
                Models.MessageType.Chat
            );

            // Notify client that message was queued
            await Clients.Caller.SendAsync("MessageQueued", new
            {
                Channel = channel,
                Content = content,
                QueuedAt = DateTime.UtcNow,
                Message = "Message queued - will be sent when F-Chat connection is restored"
            });

            return;
        }

        try
        {
            if (channel[..4] == "PRI-")
            {
                await _fChatService.SendPRIMessageAsync(userId, characterName, channel[4..], content);
            }
            else
            {
                // Send message to F-Chat server
                await _fChatService.SendMessageAsync(userId, characterName, channel, content);
            }

            // Store message in database using character name as sender
            await _messageService.SaveMessageAsync(
                userId,
                channel,
                characterName,
                content,
                Models.MessageType.Chat,
                characterName
            );

            // Broadcast to other connected clients of this user
            await Clients.Group($"user-{userId}").SendAsync("ReceiveMessage", new
            {
                Channel = channel,
                Sender = characterName,
                Content = content,
                Timestamp = DateTime.UtcNow,
                MessageType = "Chat",
                characterName = characterName, // Character that sent this message
                isActiveCharacter = true // This is the active character sending the message
            });

            // Notify successful message send
            await Clients.Caller.SendAsync("MessageSent", new
            {
                Channel = channel,
                CharacterName = characterName,
                Content = content,
                Message = "Message sent successfully"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send message from character {CharacterName} to channel {Channel} for user {UserId}", characterName, channel, userId);

            // If sending failed, queue the message for retry
            await _messageService.QueueMessageAsync(
                userId,
                channel,
                characterName,
                content,
                Models.MessageType.Chat
            );

            await Clients.Caller.SendAsync("MessageError", "Failed to send message - queued for retry when connection is restored");
        }
    }

    public async Task SendTypingNotification(string characterName, string status)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} sending typing notification to {CharacterName} with status {Status}", userId, characterName, status);

        try
        {
            // Get the active character for this user
            var activeCharacter = await _fChatService.GetActiveCharacterAsync(userId);
            if (string.IsNullOrEmpty(activeCharacter))
            {
                _logger.LogWarning("No active character found for user {UserId} when sending typing notification", userId);
                return;
            }

            // Send typing notification to F-Chat server
            await _fChatService.SendTypingNotificationAsync(userId, activeCharacter, characterName, status);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send typing notification to {CharacterName} with status {Status} for user {UserId}", characterName, status, userId);
        }
    }

    public async Task RequestProfileFromCharacter(string characterName, string requestingCharacter)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("Character {RequestingCharacter} of user {UserId} requesting profile for character {CharacterName}", requestingCharacter, userId, characterName);

        try
        {
            await _fChatService.RequestProfileAsync(userId, characterName, requestingCharacter);

            // Notify client that profile request was sent
            await Clients.Caller.SendAsync("ProfileRequested", new
            {
                CharacterName = characterName,
                RequestingCharacter = requestingCharacter,
                Message = $"Profile request sent for {characterName} from {requestingCharacter}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to request profile for character {CharacterName} from character {RequestingCharacter} (User: {UserId})", characterName, requestingCharacter, userId);
            await Clients.Caller.SendAsync("ProfileError", $"Failed to request profile for {characterName}");
        }
    }

    public async Task GetChannelCharacters(string channelId, string? characterName = null)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        // Use provided character name or get active character
        var activeCharacter = characterName ?? await _fChatService.GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
        {
            await Clients.Caller.SendAsync("ChannelCharacterError", "No character selected");
            return;
        }

        _logger.LogInformation("User {UserId} requesting character list for channel {ChannelId} from character {CharacterName}", userId, channelId, activeCharacter);

        try
        {
            var characters = await _fChatService.GetChannelCharactersAsync(userId, activeCharacter, channelId);

            await Clients.Caller.SendAsync("ReceiveChannelCharacters", new
            {
                ChannelId = channelId,
                Characters = characters.Select(c => new
                {
                    CharacterName = c.CharacterName,
                    JoinedAt = c.JoinedAt,
                    LastSeenAt = c.LastSeenAt,
                    Status = c.Status.ToString()
                }).ToArray(),
                RequestingCharacter = activeCharacter
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get characters for channel {ChannelId} from character {CharacterName} of user {UserId}", channelId, activeCharacter, userId);
            await Clients.Caller.SendAsync("ChannelCharacterError", "Failed to get channel characters");
        }
    }

    public async Task RefreshChannelCharacters(string channelId, string? characterName = null)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        // Use provided character name or get active character
        var activeCharacter = characterName ?? await _fChatService.GetActiveCharacterAsync(userId);
        if (activeCharacter == null)
        {
            await Clients.Caller.SendAsync("ChannelCharacterError", "No character selected");
            return;
        }

        _logger.LogInformation("User {UserId} requesting character list refresh for channel {ChannelId} from character {CharacterName}", userId, channelId, activeCharacter);

        try
        {
            var success = await _fChatService.RequestChannelOperatorListAsync(userId, activeCharacter, channelId);

            if (success)
            {
                await Clients.Caller.SendAsync("ChannelCharactersRefreshed", new
                {
                    ChannelId = channelId,
                    Message = "Character list refresh requested successfully",
                    RequestingCharacter = activeCharacter
                });
            }
            else
            {
                await Clients.Caller.SendAsync("ChannelCharacterError", "Failed to refresh character list");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh characters for channel {ChannelId} from character {CharacterName} of user {UserId}", channelId, activeCharacter, userId);
            await Clients.Caller.SendAsync("ChannelCharacterError", "Failed to refresh channel characters");
        }
    }

    #endregion

    #region Private Helper Methods

    private async Task SendRecentMessages(string userId, string? characterName = null)
    {
        try
        {
            var activeCharacter = characterName ?? await _fChatService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null) return;

            var joinedChannels = await _fChatService.GetJoinedChannelsAsync(userId, activeCharacter);
            var since = DateTime.UtcNow.AddHours(-24); // Last 24 hours

            foreach (var channel in joinedChannels)
            {
                try
                {
                    var messages = await _messageService.GetMessagesAsync(userId, channel, since, 50);
                    if (messages.Count > 0)
                    {
                        await Clients.Caller.SendAsync("ReceiveHistory", new HistoryDto(
                            channel,
                            messages.ToArray(),
                            false
                        ));
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to get recent messages for channel {Channel} for character {CharacterName} of user {UserId}", channel, activeCharacter, userId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send recent messages for user {UserId}", userId);
        }
    }

    #endregion

    #region Secure Credential Management

    /// <summary>
    /// Requests FChat credentials from the client for a specific character
    /// </summary>
    public async Task RequestFChatCredentials(string characterName)
    {
        var userId = Context.UserIdentifier;
        if (userId == null)
        {
            _logger.LogWarning("RequestFChatCredentials called without authenticated user");
            return;
        }

        _logger.LogInformation("Requesting FChat credentials for user {UserId}, character {CharacterName}", userId, characterName);

        var requestId = Guid.NewGuid().ToString();
        var request = new CredentialRequest
        {
            RequestId = requestId,
            UserId = userId,
            CharacterName = characterName,
            RequestedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddMinutes(5) // 5 minute timeout
        };

        _pendingCredentialRequests[requestId] = request;

        try
        {
            await Clients.Caller.SendAsync("RequestFChatCredentials", new
            {
                RequestId = requestId,
                CharacterName = characterName,
                Message = "Please provide your FChat credentials to connect",
                ExpiresAt = request.ExpiresAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send credential request {RequestId} to user {UserId}", requestId, userId);
            _pendingCredentialRequests.Remove(requestId);
            throw;
        }
    }

    /// <summary>
    /// Receives encrypted FChat credentials from the client
    /// </summary>
    public async Task ProvideFChatCredentials(string requestId, string encryptedCredentials)
    {
        var userId = Context.UserIdentifier;
        if (userId == null)
        {
            _logger.LogWarning("ProvideFChatCredentials called without authenticated user");
            return;
        }

        // Validate input parameters
        if (string.IsNullOrEmpty(requestId))
        {
            _logger.LogError("ProvideFChatCredentials called with null or empty requestId");
            await Clients.Caller.SendAsync("FChatConnectionFailed", "Invalid request ID");
            return;
        }

        if (string.IsNullOrEmpty(encryptedCredentials))
        {
            _logger.LogError("ProvideFChatCredentials called with null or empty credentials");
            await Clients.Caller.SendAsync("FChatConnectionFailed", "Invalid credentials");
            return;
        }

        _logger.LogInformation("Received FChat credentials for request {RequestId}, user {UserId}", requestId, userId);

        // Validate request
        if (!_pendingCredentialRequests.TryGetValue(requestId, out var request))
        {
            _logger.LogWarning("Invalid or expired credential request {RequestId} from user {UserId}", requestId, userId);
            await Clients.Caller.SendAsync("CredentialRequestExpired");
            return;
        }

        if (request.UserId != userId || request.ExpiresAt < DateTime.UtcNow)
        {
            _pendingCredentialRequests.Remove(requestId);
            _logger.LogWarning("Credential request {RequestId} expired or invalid for user {UserId}", requestId, userId);
            await Clients.Caller.SendAsync("CredentialRequestExpired");
            return;
        }

        try
        {
            // Decrypt credentials
            var credentials = DecryptCredentials(encryptedCredentials);
            if (credentials == null)
            {
                _logger.LogError("Failed to decrypt credentials for request {RequestId}", requestId);
                await Clients.Caller.SendAsync("FChatConnectionFailed", "Failed to decrypt credentials");
                return;
            }

            _logger.LogInformation("Successfully decrypted credentials for user {UserId}, character {CharacterName}", 
                userId, request.CharacterName);

            // Use credentials to connect to FChat
            try
            {
                await _fChatService.ConnectCharacterAsync(userId, request.CharacterName, credentials.Username, credentials.Password);
                
                await Clients.Caller.SendAsync("FChatConnectionEstablished", request.CharacterName);
                _logger.LogInformation("FChat connection established for user {UserId}, character {CharacterName}", 
                    userId, request.CharacterName);
            }
            catch (Exception connectEx)
            {
                await Clients.Caller.SendAsync("FChatConnectionFailed", "Failed to connect to FChat");
                _logger.LogWarning(connectEx, "FChat connection failed for user {UserId}, character {CharacterName}", 
                    userId, request.CharacterName);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process FChat credentials for user {UserId}, request {RequestId}", userId, requestId);
            await Clients.Caller.SendAsync("FChatConnectionFailed", "Invalid credentials");
        }
        finally
        {
            _pendingCredentialRequests.Remove(requestId);
        }
    }

    /// <summary>
    /// Decrypts credentials sent from the client
    /// </summary>
    private FChatCredentials? DecryptCredentials(string encryptedCredentials)
    {
        try
        {
            // For now, we'll use a simple base64 decode since we're implementing the secure flow
            // In production, this should use proper encryption with the server's private key
            var credentialBytes = Convert.FromBase64String(encryptedCredentials);
            var credentialJson = Encoding.UTF8.GetString(credentialBytes);
            var credentials = JsonSerializer.Deserialize<FChatCredentials>(credentialJson);
            
            return credentials;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decrypt FChat credentials");
            return null;
        }
    }

    /// <summary>
    /// Cleans up expired credential requests
    /// </summary>
    public static void CleanupExpiredRequests()
    {
        var expiredRequests = _pendingCredentialRequests
            .Where(kvp => kvp.Value.ExpiresAt < DateTime.UtcNow)
            .Select(kvp => kvp.Key)
            .ToList();

        foreach (var requestId in expiredRequests)
        {
            _pendingCredentialRequests.Remove(requestId);
        }

        if (expiredRequests.Count > 0)
        {
            // Note: Can't use _logger here since this is a static method
            // Console logging removed
        }
    }

    #endregion
}

// DTOs for SignalR communication
public record MessageDto(
    string Channel,
    string Sender,
    string Content,
    DateTime Timestamp,
    string MessageType
);

public record HistoryDto(
    string Channel,
    MessageDto[] Messages,
    bool HasMore
);

public record ConnectionStatusDto(
    bool IsConnected,
    string Status,
    DateTime LastActivity
);

public class ChannelDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Title { get; set; }
    public int UserCount { get; set; }
    public string Mode { get; set; } = string.Empty;
}

public class FChatCredentials
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}