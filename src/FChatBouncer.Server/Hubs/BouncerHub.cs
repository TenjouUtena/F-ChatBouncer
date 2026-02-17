using FChatBouncer.Server.Services;
using FChatBouncer.Server.MessageQueue;
using FChatBouncer.Server.Models;
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
    private readonly IMessageQueueService _messageQueueService;
    private readonly IFChatService _fChatService;
    private readonly IProfileService _profileService;
    private readonly TicketManager _ticketManager;
    private readonly ILogger<BouncerHub> _logger;
    private readonly IEncryptionService _encryptionService;
    
    // Store pending credential requests
    private static readonly Dictionary<string, CredentialRequest> _pendingCredentialRequests = new();
    private const string AgentIdContextKey = "MessageQueueAgentId";
    private const string AgentIdGeneratedKey = "MessageQueueAgentIdGenerated";

    public BouncerHub(
        IUserService userService,
        IMessageService messageService,
        IMessageQueueService messageQueueService,
        IFChatService fChatService,
        IProfileService profileService,
        TicketManager ticketManager,
        ILogger<BouncerHub> logger,
        IEncryptionService encryptionService)
    {
        _userService = userService;
        _messageService = messageService;
        _messageQueueService = messageQueueService;
        _fChatService = fChatService;
        _profileService = profileService;
        _ticketManager = ticketManager;
        _logger = logger;
        _encryptionService = encryptionService;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier;
        _logger.LogInformation($"SignalR connection attempt - UserId: {userId}, ConnectionId: {Context.ConnectionId}");
        
        if (userId != null)
        {
            var agentId = EnsureAgentId();
            await Clients.Caller.SendAsync("AgentRegistered", new { AgentId = agentId });

            _logger.LogInformation("User {UserId} connected to bouncer hub", userId);

            // Add to user group for targeted messaging
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user-{userId}");

            // Clean up any invalid character connections first
            await _fChatService.CleanupInvalidCharactersAsync(userId);

            // Check if user has an active character (multi-character model)
            var activeCharacter = await _fChatService.GetActiveCharacterAsync(userId);
            bool isAlreadyConnected = false;
            
            if (activeCharacter != null)
            {
                isAlreadyConnected = await _fChatService.IsCharacterConnectedAsync(userId, activeCharacter);
            }
            
            _logger.LogInformation("User {UserId} connection check: Active character = {ActiveCharacter}, Connected = {IsConnected}", 
                userId, activeCharacter ?? "None", isAlreadyConnected);

            if (isAlreadyConnected && activeCharacter != null)
            {
                _logger.LogInformation("User {UserId} reconnecting to existing F-Chat connection for character {ActiveCharacter} (bouncer mode)", 
                    userId, activeCharacter);

                // Get current state from existing connection
                var joinedChannelDetails = await _fChatService.GetJoinedChannelDetailsAsync(userId, activeCharacter);

                // Send recent messages for all joined channels
                await SendRecentMessages(userId);

                // Get character info from database/connections
                var characterConnection = await _fChatService.GetCharacterConnectionAsync(userId, activeCharacter);

                // Notify bouncer reconnection with full state
                await Clients.Caller.SendAsync("BouncerReconnected", new
                {
                    Character = new
                    {
                        Name = activeCharacter,
                        Status = characterConnection?.Character.Status ?? "online",
                        StatusMessage = characterConnection?.Character.StatusMessage,
                        Gender = characterConnection?.Character.Gender ?? "None"
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
                _logger.LogInformation("User {UserId} connecting for first time or no active character, waiting for character selection", userId);

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
            // Use the parameterless overload which will:
            // 1. Try active character connections
            // 2. Fall back to database connections
            // 3. Fall back to F-List API with stored credentials (gets ticket and character list)
            var characters = await _fChatService.GetCharactersAsync(userId);

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

    public Task GetHistory(string channel, DateTime since, int limit = 100)
    {
        return RequestHistory(channel, since, limit);
    }

    public async Task GetRecentMessages(string? characterName = null)
    {
        var userId = Context.UserIdentifier;
        if (userId == null) return;

        _logger.LogInformation("User {UserId} requesting recent messages for {Character}", userId, characterName ?? "all characters");

        if (string.IsNullOrWhiteSpace(characterName))
        {
            await SendRecentMessages(userId);
            return;
        }

        await SendRecentMessages(userId, characterName);
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
                    // Decrypt F-Chat credentials using AES-256-GCM
                    try
                    {
                        (string username, string password) = _encryptionService.DecryptCredentials(settings.FChatCredentialsEncrypted);
                        
                        _logger.LogInformation("About to call ConnectCharacterAsync for {CharacterName} with username {Username}", characterName, username);
                        await _fChatService.ConnectCharacterAsync(userId, characterName, username, password);
                        _logger.LogInformation("Successfully created WebSocket connection for {CharacterName}", characterName);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to decrypt F-Chat credentials for user {UserId}. Credentials may be in old format - user will need to re-enter them.", userId);
                        throw new InvalidOperationException("Failed to decrypt credentials. Please re-enter your F-Chat credentials.");
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
                    // Decrypt F-Chat credentials using AES-256-GCM
                    try
                    {
                        (string username, string password) = _encryptionService.DecryptCredentials(settings.FChatCredentialsEncrypted);
                        
                        _logger.LogInformation("About to call ConnectCharacterAsync for {CharacterName} with username {Username}", characterName, username);
                        await _fChatService.ConnectCharacterAsync(userId, characterName, username, password);
                        _logger.LogInformation("Successfully created WebSocket connection for {CharacterName}", characterName);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to decrypt F-Chat credentials for user {UserId}. Credentials may be in old format - user will need to re-enter them.", userId);
                        throw new InvalidOperationException("Failed to decrypt credentials. Please re-enter your F-Chat credentials.");
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

            // Generate message ID for sent message
            var messageId = Guid.NewGuid().ToString();

            // Store message in database using character name as sender
            await _messageService.SaveMessageAsync(
                userId,
                channel,
                characterName,
                content,
                Models.MessageType.Chat,
                characterName,
                messageId
            );

            // Broadcast to other connected clients of this user
            await Clients.Group($"user-{userId}").SendAsync("ReceiveMessage", new
            {
                Channel = channel,
                Sender = characterName,
                Content = content,
                Timestamp = DateTime.UtcNow,
                id = messageId,
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

    private string EnsureAgentId()
    {
        if (Context.Items.TryGetValue(AgentIdContextKey, out var existing) &&
            existing is string existingId &&
            !string.IsNullOrWhiteSpace(existingId))
        {
            return existingId;
        }

        var httpContext = Context.GetHttpContext();
        var provided = httpContext?.Request.Query["agentId"].FirstOrDefault();
        var userId = Context.UserIdentifier ?? string.Empty;
        var agentId = !string.IsNullOrWhiteSpace(provided)
            ? provided
            : (!string.IsNullOrWhiteSpace(userId) ? $"user-agent-{userId}" : Context.ConnectionId);

        Context.Items[AgentIdContextKey] = agentId;
        Context.Items[AgentIdGeneratedKey] = string.IsNullOrWhiteSpace(provided);

        return agentId;
    }

    private static bool TryConvertToMessageDto(StreamMessage message, string fallbackChannel, out string channel, out MessageDto? dto)
    {
        if (message is null)
        {
            channel = fallbackChannel;
            dto = null;
            return false;
        }

        channel = fallbackChannel;
        if (message is RoomMessage roomMessage && !string.IsNullOrWhiteSpace(roomMessage.RoomId))
        {
            channel = roomMessage.RoomId;
        }
        else if (message.Metadata.TryGetValue("channel", out var channelMeta) && !string.IsNullOrWhiteSpace(channelMeta))
        {
            channel = channelMeta;
        }

        var messageType = ResolveClientMessageType(message);

        // Use FChatMessageId from metadata if available, otherwise use message.Id (Redis stream ID)
        var messageId = message.Metadata.TryGetValue("fchatMessageId", out var fchatId) && !string.IsNullOrWhiteSpace(fchatId)
            ? fchatId
            : message.Id ?? Guid.NewGuid().ToString();

        dto = new MessageDto(
            channel,
            message.SenderId,
            message.Content,
            message.Timestamp,
            messageType,
            ResolveMessageCharacterName(message),
            messageId);
        return true;
    }

    private static string ResolveClientMessageType(StreamMessage message)
    {
        if (message.Metadata.TryGetValue("originalMessageType", out var original) &&
            !string.IsNullOrWhiteSpace(original))
        {
            return original;
        }

        return message.MessageType switch
        {
            StreamMessageTypes.Roll => "Roll",
            StreamMessageTypes.Action => "Action",
            StreamMessageTypes.SystemNotification => "System",
            StreamMessageTypes.Announcement => "Announcement",
            StreamMessageTypes.Direct => "Private",
            _ => "Chat"
        };
    }

    private static string? ResolveMessageCharacterName(StreamMessage message)
    {
        if (message.Metadata.TryGetValue("characterName", out var characterName) &&
            !string.IsNullOrWhiteSpace(characterName))
        {
            return characterName;
        }

        if (message.Metadata.TryGetValue("senderCharacter", out var senderCharacter) &&
            !string.IsNullOrWhiteSpace(senderCharacter))
        {
            return senderCharacter;
        }

        if (message.Metadata.TryGetValue("recipientId", out var recipientId) &&
            !string.IsNullOrWhiteSpace(recipientId))
        {
            return recipientId;
        }

        return null;
    }

    private async Task SendRecentMessages(string userId, string? characterName = null)
    {
        try
        {
            var activeCharacter = characterName ?? await _fChatService.GetActiveCharacterAsync(userId);
            if (activeCharacter == null) return;

            var agentId = EnsureAgentId();

            await DeliverMissedMessages(userId, agentId);

            var joinedChannels = await _fChatService.GetJoinedChannelsAsync(userId, activeCharacter);
            var since = DateTime.UtcNow.AddHours(-24); // Last 24 hours

            foreach (var channel in joinedChannels)
            {
                try
                {
                    var queuedMessages = await _messageQueueService.GetRoomMessagesAsync(userId, agentId, channel, 200);

                    if (queuedMessages.Count > 0)
                    {
                        var messageDtos = queuedMessages
                            .Select(entry =>
                            {
                                return TryConvertToMessageDto(entry.Message, channel, out var resolvedChannel, out var dto) && dto != null
                                    ? (resolvedChannel, dto)
                                    : (resolvedChannel: channel, dto: (MessageDto?)null);
                            })
                            .Where(tuple => tuple.dto != null)
                            .Select(tuple => tuple.dto!)
                            .ToArray();

                        foreach (var entry in queuedMessages)
                        {
                            await _messageQueueService.AcknowledgeMessageAsync(userId, agentId, entry.StreamKey, entry.MessageId);
                        }

                        if (messageDtos.Length > 0)
                        {
                            await Clients.Caller.SendAsync("ReceiveHistory", new HistoryDto(
                                channel,
                                messageDtos,
                                false
                            ));

                            continue;
                        }
                    }

                    var messages = await _messageService.GetChannelMessagesSinceAsync(userId, channel, since, 50);
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

    private async Task DeliverMissedMessages(string userId, string agentId)
    {
        var missedEntries = await _messageQueueService.GetMissedMessagesAsync(userId, agentId, 500);
        if (missedEntries.Count == 0)
        {
            return;
        }

        _logger.LogInformation("Delivering {Count} missed messages for user {UserId}", missedEntries.Count, userId);
        foreach (var entry in missedEntries)
        {
            _logger.LogInformation("Missed message: {From} {Message}", entry.Message.SenderId, entry.Message.Content);
        }

        var grouped = new Dictionary<string, List<MessageDto>>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in missedEntries.OrderBy(e => e.Message.Timestamp))
        {
            var fallbackChannel = ResolveFallbackChannel(entry);

            if (TryConvertToMessageDto(entry.Message, fallbackChannel, out var channel, out var dto) && dto != null)
            {
                if (!grouped.TryGetValue(channel, out var list))
                {
                    list = new List<MessageDto>();
                    grouped[channel] = list;
                }

                list.Add(dto);
            }
        }

        foreach (var group in grouped)
        {
            await Clients.Caller.SendAsync("ReceiveHistory", new HistoryDto(
                group.Key,
                group.Value.ToArray(),
                false
            ));
        }

        foreach (var entry in missedEntries)
        {
            await _messageQueueService.AcknowledgeMessageAsync(userId, agentId, entry.StreamKey, entry.MessageId);
        }
    }

    private static string ResolveFallbackChannel(StreamMessageEntry entry)
    {
        if (!string.IsNullOrEmpty(entry.StreamKey) &&
            StreamKeys.TryParseRoomStream(entry.StreamKey, out _, out var roomId))
        {
            return roomId;
        }

        if (entry.Message.Metadata.TryGetValue("channel", out var channel) && !string.IsNullOrWhiteSpace(channel))
        {
            return channel;
        }

        return entry.Message.StreamKey ?? entry.StreamKey;
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
            // Decode credentials from client (Base64-encoded JSON, not stored credentials)
            var credentials = DecodeClientCredentials(encryptedCredentials);
            if (credentials == null)
            {
                _logger.LogError("Failed to decode credentials for request {RequestId}", requestId);
                await Clients.Caller.SendAsync("FChatConnectionFailed", "Failed to decode credentials");
                return;
            }

            _logger.LogInformation("Successfully decoded credentials for user {UserId}, character {CharacterName}", 
                userId, request.CharacterName);

            // Use credentials to connect to FChat
            try
            {
                await _fChatService.ConnectCharacterAsync(userId, request.CharacterName, credentials.Username, credentials.Password);
                
                // Save credentials to UserSettings using proper AES-256-GCM encryption
                // This ensures credentials are persisted for future connections
                try
                {
                    var settings = await _userService.GetUserSettingsAsync(userId) ?? new UserSettings { UserId = userId };
                    settings.FChatCredentialsEncrypted = _encryptionService.EncryptCredentials(credentials.Username, credentials.Password);
                    await _userService.UpdateUserSettingsAsync(userId, settings);
                }
                catch (Exception saveEx)
                {
                    _logger.LogError(saveEx, "Failed to save credentials to UserSettings for user {UserId}, but connection succeeded", userId);
                }
                
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
    /// Decodes credentials sent from the client during credential request flow.
    /// Note: Client-to-server transmission uses Base64-encoded JSON over HTTPS (acceptable for transport).
    /// This is NOT for decrypting stored credentials - use EncryptionService.DecryptCredentials() for that.
    /// Storage uses AES-256-GCM encryption via EncryptionService.
    /// </summary>
    private FChatCredentials? DecodeClientCredentials(string encryptedCredentials)
    {
        try
        {
            // Base64 decode credentials sent from client over HTTPS
            var credentialBytes = Convert.FromBase64String(encryptedCredentials);
            var credentialJson = Encoding.UTF8.GetString(credentialBytes);
            var credentials = JsonSerializer.Deserialize<FChatCredentials>(credentialJson);
            
            return credentials;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decode FChat credentials from client");
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

    #region Status Methods

    /// <summary>
    /// Gets the detailed connection status for the current user
    /// </summary>
    public async Task<DetailedConnectionStatusDto> GetDetailedConnectionStatus()
    {
        var userId = Context.UserIdentifier;
        if (userId == null)
        {
            return new DetailedConnectionStatusDto
            {
                BackendStatus = BackendConnectionStatus.NeedsCredentials,
                StatusMessage = "Not authenticated",
                HasCredentials = false,
                IsConnectedToFChat = false
            };
        }

        try
        {
            var status = await _fChatService.GetDetailedConnectionStatusAsync(userId);
            _logger.LogInformation("User {UserId} requested detailed status: {Status}", userId, status.BackendStatus);
            return status;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get detailed connection status for user {UserId}", userId);
            return new DetailedConnectionStatusDto
            {
                BackendStatus = BackendConnectionStatus.NotConnected,
                StatusMessage = "Error retrieving status",
                HasCredentials = false,
                IsConnectedToFChat = false
            };
        }
    }

    /// <summary>
    /// Broadcasts a detailed status update to the user
    /// </summary>
    public async Task BroadcastDetailedStatus(string userId, DetailedConnectionStatusDto status)
    {
        await Clients.Group($"user-{userId}").SendAsync("DetailedStatusUpdate", status);
    }

    #endregion
}

// DTOs for SignalR communication
public record MessageDto(
    string Channel,
    string Sender,
    string Content,
    DateTime Timestamp,
    string MessageType,
    string? CharacterName = null,
    string? Id = null
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