using FChatBouncer.Server.Models;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace FChatBouncer.Server.Services;

public class FChatWebSocketClient : IDisposable
{
    private readonly string _serverUrl = "wss://chat.f-list.net/chat2";
    private readonly string _clientName = "FChatBouncer";
    private readonly string _clientVersion = "1.0.0";
    private readonly ILogger<FChatWebSocketClient> _logger;

    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _cancellationTokenSource;
    private bool _isAuthenticated = false;
    private string? _selectedCharacter;
    private List<FChatCharacter> _availableCharacters = [];
    private List<string> _friendsList = [];
    private List<string> _bookmarksList = [];
    private readonly Dictionary<string, string> _friendGenders = new(); // Cache for friend genders
    private Dictionary<string, Friend> _friendsWithStatus = new(); // Friends with online status from FRL
    private Dictionary<string, Friend> _bookmarksWithStatus = new(); // Bookmarks with online status
    private readonly ConcurrentDictionary<string, FChatCharacter> _onlineCharactersCache = new(); // Cache for online characters from LIS
    private List<FChatChannel> _availableChannels = [];
    private List<FChatChannel> _chaChannels = [];
    private List<FChatChannel> _orsChannels = [];
    private readonly HashSet<string> _joinedChannels = new();
    private readonly Dictionary<string, FChatChannel> _joinedChannelDetails = new();
    private readonly Dictionary<string, TaskCompletionSource<object?>> _pendingRequests = new();
    private readonly TicketManager _ticketManager;
    private int _onlineCharacterCount = 0;
    private int _receivedCharacterCount = 0;

    // Channel list request deduplication
    private Task<List<FChatChannel>>? _pendingChannelListRequest = null;
    private readonly object _channelListRequestLock = new object();
    
    // Channel character tracking
    private readonly Dictionary<string, List<ChannelCharacter>> _channelCharacters = new();
    private readonly Dictionary<string, List<string>> _channelOperators = new();

    // Profile building state for PRD command sequence
    private string? _lastRequestedCharacter;
    private readonly Dictionary<string, ProfileData> _buildingProfiles = new();
    private bool _profileBuildInProgress = false;

    public event Action<FChatMessage>? MessageReceived;
    public event Action<string>? ConnectionStatusChanged;
    public event Action<string, string>? ProfileReceived; // characterName, profileData
    public event Action<string, ChannelCharacter>? CharacterJoinedChannel; // channelId, character
    public event Action<string, string>? CharacterLeftChannel; // channelId, characterName
    public event Action<string, string, string>? StatusUpdated; // characterName, status, statusMessage
    public event Action<string, string, string>? UserOnline; // characterName, status, gender
    public event Action<string>? UserOffline; // characterName
    public event Action<string, List<string>, ChannelMode>? InitialChannelDataReceived; // channelId, users, mode
    public event Action<List<Friend>>? FriendsListReceived; // friends list with online status
    public event Action<List<FChatCharacter>>? OnlineCharactersListReceived; // online characters list with status
    public event Action<string?, string>? CharacterError; // characterName, errorMessage
    public event Action<string, string, string>? TypingNotificationReceived; // characterName, fromCharacter, status
    public event Action<List<SearchResult>>? SearchResultsReceived; // search results

    public FChatWebSocketClient(ILogger<FChatWebSocketClient> logger, TicketManager ticketManager)
    {
        _logger = logger;
        _ticketManager = ticketManager;
    }

    public async Task<bool> ConnectAsync(string username, string password)
    {
        try
        {
            _logger.LogInformation("Starting F-Chat connection process for user: {Username}", username);

            // Step 1 & 2: Store credentials first
            SetCredentials(username, password);

            // Step 3: Generate ticket from F-Chat API
            _logger.LogInformation("Generating authentication ticket...");
            var ticket = await GetAuthTicketAsync(username, password);
            if (string.IsNullOrEmpty(ticket))
            {
                _logger.LogError("Failed to generate authentication ticket for user: {Username}", username);
                ConnectionStatusChanged?.Invoke("Failed to authenticate");
                return false;
            }

            _ticket = ticket;
            _logger.LogInformation("Authentication ticket generated successfully");

            // Step 4 & 5: Characters were extracted from the ticket response
            if (_availableCharacters.Count == 0)
            {
                _logger.LogWarning("No characters found for account: {Username}", username);
                ConnectionStatusChanged?.Invoke("No characters found");
                return false;
            }

            _logger.LogInformation("Found {CharacterCount} characters for user: {Username}", _availableCharacters.Count, username);

            // Step 5: Notify that characters are ready for selection
            ConnectionStatusChanged?.Invoke("CharactersLoaded");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to F-Chat for user: {Username}", username);
            ConnectionStatusChanged?.Invoke("Failed to connect");
            return false;
        }
    }


    private string? _username;
    private string? _password;
    private string? _ticket;
    private string? _lastAuthError;

    public void SetCredentials(string username, string password)
    {
        _username = username;
        _password = password;
    }

    public string? GetTicket()
    {
        return _ticket;
    }

    public string? GetUsername()
    {
        return _username;
    }

    /// <summary>
    /// Error message from the last getApiTicket call when F-List returned an "error" field (e.g. "Login Failed...").
    /// Used to detect rejected credentials so stored credentials can be cleared.
    /// </summary>
    public string? GetLastAuthenticationError() => _lastAuthError;

    private async Task<bool> AuthenticateWithCharacterAsync(string characterName, string ticket)
    {
        try
        {
            if (string.IsNullOrEmpty(_username) || string.IsNullOrEmpty(_password))
            {
                throw new InvalidOperationException("Credentials not set");
            }

            // Send authentication with ticket and selected character
            var authMessage = new
            {
                method = "ticket",
                account = _username,
                ticket = ticket,
                character = characterName,
                cname = _clientName,
                cversion = _clientVersion
            };

            var authResponse = await SendCommandWithResponseAsync("IDN", authMessage, "IDN");
            return authResponse != null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Authentication failed");
            return false;
        }
    }

    private async Task<string?> GetAuthTicketAsync(string username, string password)
    {
        _lastAuthError = null;
        try
        {
            _logger.LogDebug("Requesting authentication ticket from F-List API");

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);

            var authData = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("account", username),
                new KeyValuePair<string, string>("password", password)
            });

            _logger.LogDebug("Sending POST request to F-List getApiTicket endpoint");
            var response = await httpClient.PostAsync("https://www.f-list.net/json/getApiTicket.php", authData);
            var content = await response.Content.ReadAsStringAsync();

            _logger.LogDebug("Received response from F-List API. Status: {StatusCode}, Content length: {ContentLength}",
                response.StatusCode, content.Length);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("F-List API returned non-success status: {StatusCode}. Response: {Content}",
                    response.StatusCode, content);
                return null;
            }

            var authResponse = JsonSerializer.Deserialize<JsonElement>(content);
            _logger.LogInformation("F-List API response: {authinfo}", authResponse.ToString());

            if (authResponse.TryGetProperty("error", out var errorElement))
            {
                var errorMessage = errorElement.GetString();
                if (!string.IsNullOrEmpty(errorMessage))
                {
                    _lastAuthError = errorMessage;
                    _logger.LogError("F-List authentication failed for user {Username}: {Error}", username, errorMessage);
                    return null;
                }
            }

            _lastAuthError = null;
            if (authResponse.TryGetProperty("ticket", out var ticketElement))
            {
                var ticket = ticketElement.GetString();
                _logger.LogInformation("Authentication ticket retrieved successfully for user: {Username}", username);

                // Extract characters from the same response (support array of strings or array of objects with "name")
                var characters = new List<FChatCharacter>();
                if (authResponse.TryGetProperty("characters", out var charactersElement))
                {
                    foreach (var charElement in charactersElement.EnumerateArray())
                    {
                        var name = charElement.ValueKind == JsonValueKind.String
                            ? charElement.GetString()
                            : charElement.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
                        if (string.IsNullOrEmpty(name))
                        {
                            _logger.LogWarning("Skipping character element with missing name in ticket response");
                            continue;
                        }
                        characters.Add(new FChatCharacter
                        {
                            Name = name
                        });
                    }

                    _availableCharacters = characters;
                    _logger.LogInformation("Extracted {CharacterCount} characters from ticket response for user: {Username}",
                        characters.Count, username);
                }

                // If ticket response had no characters (or wrong format), fetch from character-list.php
                if (_availableCharacters.Count == 0 && !string.IsNullOrEmpty(ticket))
                {
                    var listCharacters = await FetchCharacterListFromApiAsync(username, ticket);
                    if (listCharacters.Count > 0)
                    {
                        _availableCharacters = listCharacters;
                        _logger.LogInformation("Fetched {CharacterCount} characters from character-list.php for user: {Username}",
                            listCharacters.Count, username);
                    }
                }

                // Extract friends list from the same response
                if (authResponse.TryGetProperty("friends", out var friendsElement))
                {
                    var friends = new List<string>();
                    var characterNames = _availableCharacters.Select(c => c.Name).ToList();
                    foreach (var friendElement in friendsElement.EnumerateArray())
                    {
                        // The friends data structure has dest_name (character) and source_name (friend)
                        // We want to extract the friend names (source_name) for the current character
                        if (friendElement.TryGetProperty("dest_name", out var destNameElement) &&
                            friendElement.TryGetProperty("source_name", out var sourceNameElement))
                        {
                            var destName = destNameElement.GetString();
                            var sourceName = sourceNameElement.GetString();
                            
                            // Only add friends for the current character (dest_name should match one of our characters)
                            if (!string.IsNullOrEmpty(destName) && !string.IsNullOrEmpty(sourceName))
                            {
                                // Check if this friend belongs to any of our characters
                                if (characterNames.Contains(destName))
                                {
                                    friends.Add(sourceName);
                                }
                            }
                        }
                    }

                    _friendsList = friends;
                    _logger.LogInformation("Extracted {FriendCount} friends from ticket response for user: {Username}",
                        friends.Count, username);
                }

                // Extract bookmarks from the same response
                if (authResponse.TryGetProperty("bookmarks", out var bookmarksElement))
                {
                    var bookmarks = new List<string>();
                    foreach (var bookmarkElement in bookmarksElement.EnumerateArray())
                    {
                        if (bookmarkElement.TryGetProperty("name", out var bookmarkNameElement))
                        {
                            var bookmarkName = bookmarkNameElement.GetString();
                            if (!string.IsNullOrEmpty(bookmarkName))
                            {
                                bookmarks.Add(bookmarkName);
                            }
                        }
                    }

                    _bookmarksList = bookmarks;
                    _logger.LogInformation("Extracted {BookmarkCount} bookmarks from ticket response for user: {Username}",
                        bookmarks.Count, username);
                }

                return ticket;
            }

            _logger.LogError("F-List API response missing 'ticket' property. Response: {Content}", content);
            return null;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Network error while requesting authentication ticket for user: {Username}", username);
            return null;
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogError(ex, "Timeout while requesting authentication ticket for user: {Username}", username);
            return null;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse F-List API response for user: {Username}", username);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while getting authentication ticket for user: {Username}", username);
            return null;
        }
    }

    /// <summary>
    /// Fetches character list from F-List character-list.php when ticket response does not include characters.
    /// </summary>
    private async Task<List<FChatCharacter>> FetchCharacterListFromApiAsync(string username, string ticket)
    {
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(15);
            var formData = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("account", username),
                new KeyValuePair<string, string>("ticket", ticket)
            });
            var response = await httpClient.PostAsync("https://www.f-list.net/json/api/character-list.php", formData);
            var content = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("character-list.php returned {StatusCode} for user {Username}", response.StatusCode, username);
                return new List<FChatCharacter>();
            }

            var root = JsonSerializer.Deserialize<JsonElement>(content);
            var characters = new List<FChatCharacter>();
            // Response can be array of strings or object with "characters" array
            if (root.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in root.EnumerateArray())
                {
                    var name = el.GetString();
                    if (!string.IsNullOrEmpty(name))
                        characters.Add(new FChatCharacter { Name = name });
                }
            }
            else if (root.TryGetProperty("characters", out var arr))
            {
                foreach (var el in arr.EnumerateArray())
                {
                    var name = el.ValueKind == JsonValueKind.String ? el.GetString() : el.TryGetProperty("name", out var n) ? n.GetString() : null;
                    if (!string.IsNullOrEmpty(name))
                        characters.Add(new FChatCharacter { Name = name });
                }
            }
            return characters;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch character list from API for user {Username}", username);
            return new List<FChatCharacter>();
        }
    }

    public Task<List<FChatCharacter>> GetCharactersAsync()
    {
        if (string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot get characters: username not set");
            throw new InvalidOperationException("Credentials not set. Call ConnectAsync first.");
        }

        // Return cached characters (they should have been loaded during ConnectAsync)
        if (_availableCharacters.Count > 0)
        {
            _logger.LogDebug("Returning cached character list for user: {Username}", _username);
            return Task.FromResult(_availableCharacters);
        }

        // If no characters are cached, something went wrong during connect
        _logger.LogError("No characters available for user: {Username}. ConnectAsync may have failed.", _username);
        throw new InvalidOperationException("No characters available. Ensure ConnectAsync completed successfully.");
    }

    public List<string> GetFriendsList()
    {
        if (string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot get friends: username not set");
            throw new InvalidOperationException("Credentials not set. Call ConnectAsync first.");
        }

        _logger.LogDebug("Returning friends list for user: {Username}", _username);
        return _friendsList;
    }

    /// <summary>
    /// Updates the friends list with online status information from FRL response
    /// </summary>
    public void UpdateFriendsListWithStatus(List<Friend> friendsWithStatus)
    {
        _logger.LogInformation("Updating friends list with {FriendCount} friends including online status", friendsWithStatus.Count);
        
        // Update the friends list with the new data
        _friendsList = friendsWithStatus.Select(f => f.Name).ToList();
        
        // Store friends with status for later retrieval
        _friendsWithStatus = friendsWithStatus.ToDictionary(f => f.Name, f => f);
    }

    public void UpdateFriendsListWithOnlineStatus(List<FChatCharacter> onlineCharacters)
    {
        // Create a set of online character names for quick lookup
        var onlineCharacterNames = new HashSet<string>(onlineCharacters.Select(c => c.Name), StringComparer.OrdinalIgnoreCase);
        
        var friendsUpdated = 0;
        var friendsMarkedOnline = 0;
        
        // Update existing friends with online status
        foreach (var friendName in _friendsList)
        {
            if (_friendsWithStatus.TryGetValue(friendName, out var friend))
            {
                _logger.LogDebug("Processing friend: {FriendName} (current status: {Status}, isOnline: {IsOnline})", 
                    friendName, friend.Status, friend.IsOnline);
                
                // Check if this friend is in the online characters list
                var isOnline = onlineCharacterNames.Contains(friendName);
                var onlineCharacter = onlineCharacters.FirstOrDefault(c => 
                    string.Equals(c.Name, friendName, StringComparison.OrdinalIgnoreCase));
                
                if (isOnline && onlineCharacter != null)
                {
                    // Update friend with online status and details
                    friend.IsOnline = true;
                    friend.Status = onlineCharacter.Status;
                    friend.StatusMessage = onlineCharacter.StatusMessage;
                    friend.Gender = onlineCharacter.Gender;
                    friend.LastSeen = onlineCharacter.LastSeen;
                    friendsMarkedOnline++;
                }
                else
                {
                    // Check if friend has a non-offline status (they might be online but not in LIS)
                    var currentStatus = friend.Status?.ToLower() ?? "offline";
                    var isActuallyOnline = currentStatus != "offline";
                    
                    // Also check if friend is in any channel (they're definitely online if in a channel)
                    var isInChannel = _channelCharacters.Values
                        .SelectMany(chars => chars)
                        .Any(cc => string.Equals(cc.CharacterName, friendName, StringComparison.OrdinalIgnoreCase));
                    
                    if (isActuallyOnline || isInChannel)
                    {
                        // Keep them as online with their current status
                        friend.IsOnline = true;
                        if (isInChannel && !isActuallyOnline)
                        {
                            // Update status to online if they're in a channel but status was offline
                            friend.Status = "online";
                            _logger.LogDebug("Friend {FriendName} marked as online (found in channel)", friendName);
                        }
                        else
                        {
                            // Keep existing online status
                        }
                    }
                    else
                    {
                        // Mark as offline
                        friend.IsOnline = false;
                        friend.Status = "offline";
                    }
                }
                friendsUpdated++;
            }
        }
        
        // Also update bookmarks with online status
        // Note: Bookmarks are stored as strings, so we need to create Friend objects for them
        var bookmarksUpdated = 0;
        var bookmarksMarkedOnline = 0;
        
        foreach (var bookmarkName in _bookmarksList)
        {
            var isOnline = onlineCharacterNames.Contains(bookmarkName);
            var onlineCharacter = onlineCharacters.FirstOrDefault(c => 
                string.Equals(c.Name, bookmarkName, StringComparison.OrdinalIgnoreCase));
            
            if (isOnline && onlineCharacter != null)
            {
                // Update or create bookmark entry in separate bookmarks dictionary
                if (_bookmarksWithStatus.TryGetValue(bookmarkName, out var bookmarkFriend))
                {
                    bookmarkFriend.IsOnline = true;
                    bookmarkFriend.Status = onlineCharacter.Status;
                    bookmarkFriend.StatusMessage = onlineCharacter.StatusMessage;
                    bookmarkFriend.Gender = onlineCharacter.Gender;
                    bookmarkFriend.LastSeen = onlineCharacter.LastSeen;
                }
                else
                {
                    // Create new bookmark entry
                    _bookmarksWithStatus[bookmarkName] = new Friend
                    {
                        Name = bookmarkName,
                        IsOnline = true,
                        Status = onlineCharacter.Status,
                        StatusMessage = onlineCharacter.StatusMessage,
                        Gender = onlineCharacter.Gender,
                        LastSeen = onlineCharacter.LastSeen
                    };
                }
                bookmarksMarkedOnline++;
            }
            else
            {
                // Check if bookmark has a non-offline status (they might be online but not in LIS)
                if (_bookmarksWithStatus.TryGetValue(bookmarkName, out var bookmarkFriend))
                {
                    var currentStatus = bookmarkFriend.Status?.ToLower() ?? "offline";
                    var isActuallyOnline = currentStatus != "offline";
                    
                    if (isActuallyOnline)
                    {
                        // Keep them as online with their current status
                        bookmarkFriend.IsOnline = true;
                    }
                    else
                    {
                        // Mark as offline
                        bookmarkFriend.IsOnline = false;
                        bookmarkFriend.Status = "offline";
                    }
                }
            }
            bookmarksUpdated++;
        }
        
        // Logging removed to reduce spam - only log if there are significant updates
    }

    /// <summary>
    /// Updates friends list with online status from cached online characters
    /// This is more efficient than processing the full LIS response each time
    /// </summary>
    public void UpdateFriendsListFromCache()
    {
        _logger.LogInformation("=== UpdateFriendsListFromCache START ===");
        if (_onlineCharactersCache.Count == 0)
        {
            _logger.LogDebug("No cached online characters available for friends list update");
            return;
        }

        _logger.LogInformation("Updating friends list with online status from {CharacterCount} cached online characters", _onlineCharactersCache.Count);
        
        // Create a set of online character names for quick lookup
        var onlineCharacterNames = new HashSet<string>(_onlineCharactersCache.Keys, StringComparer.OrdinalIgnoreCase);
        
        var friendsUpdated = 0;
        var friendsMarkedOnline = 0;
        
        // Update existing friends with online status
        foreach (var friendName in _friendsList)
        {
            if (_friendsWithStatus.TryGetValue(friendName, out var friend))
            {
                // Check if this friend is in the online characters cache
                var isOnline = onlineCharacterNames.Contains(friendName);
                var onlineCharacter = _onlineCharactersCache.Values.FirstOrDefault(c => 
                    string.Equals(c.Name, friendName, StringComparison.OrdinalIgnoreCase));
                
                if (isOnline && onlineCharacter != null)
                {
                    // Update friend with online status and details
                    friend.IsOnline = true;
                    friend.Status = onlineCharacter.Status;
                    friend.StatusMessage = onlineCharacter.StatusMessage;
                    friend.Gender = onlineCharacter.Gender;
                    friend.LastSeen = onlineCharacter.LastSeen;
                    friendsMarkedOnline++;
                }
                else
                {
                    // Check if friend has a non-offline status (they might be online but not in LIS)
                    var currentStatus = friend.Status?.ToLower() ?? "offline";
                    var isActuallyOnline = currentStatus != "offline";
                    
                    // Mark as offline
                    friend.IsOnline = false;
                    friend.Status = "offline";
                }
                friendsUpdated++;
            }
        }
        
        // Also update bookmarks with online status
        var bookmarksUpdated = 0;
        var bookmarksMarkedOnline = 0;
        
        foreach (var bookmarkName in _bookmarksList)
        {
            var isOnline = onlineCharacterNames.Contains(bookmarkName);
            var onlineCharacter = _onlineCharactersCache.Values.FirstOrDefault(c => 
                string.Equals(c.Name, bookmarkName, StringComparison.OrdinalIgnoreCase));
            
            if (isOnline && onlineCharacter != null)
            {
                // Update or create bookmark entry in separate bookmarks dictionary
                if (_bookmarksWithStatus.TryGetValue(bookmarkName, out var bookmarkFriend))
                {
                    bookmarkFriend.IsOnline = true;
                    bookmarkFriend.Status = onlineCharacter.Status;
                    bookmarkFriend.StatusMessage = onlineCharacter.StatusMessage;
                    bookmarkFriend.Gender = onlineCharacter.Gender;
                    bookmarkFriend.LastSeen = onlineCharacter.LastSeen;
                }
                else
                {
                    // Create new bookmark entry
                    _bookmarksWithStatus[bookmarkName] = new Friend
                    {
                        Name = bookmarkName,
                        IsOnline = true,
                        Status = onlineCharacter.Status,
                        StatusMessage = onlineCharacter.StatusMessage,
                        Gender = onlineCharacter.Gender,
                        LastSeen = onlineCharacter.LastSeen
                    };
                }
                bookmarksMarkedOnline++;
            }
            else
            {
                // Check if bookmark has a non-offline status (they might be online but not in LIS)
                if (_bookmarksWithStatus.TryGetValue(bookmarkName, out var bookmarkFriend))
                {
                    var currentStatus = bookmarkFriend.Status?.ToLower() ?? "offline";
                    var isActuallyOnline = currentStatus != "offline";
                    
                    if (isActuallyOnline)
                    {
                        // Keep them as online with their current status
                        bookmarkFriend.IsOnline = true;
                    }
                    else
                    {
                        // Mark as offline
                        bookmarkFriend.IsOnline = false;
                        bookmarkFriend.Status = "offline";
                    }
                }
            }
            bookmarksUpdated++;
        }
        
        _logger.LogInformation("=== UpdateFriendsListFromCache COMPLETE ===");
        _logger.LogInformation("Updated {FriendsUpdated} friends ({FriendsOnline} online) and {BookmarksUpdated} bookmarks ({BookmarksOnline} online) from cache", 
            friendsUpdated, friendsMarkedOnline, bookmarksUpdated, bookmarksMarkedOnline);
    }

    public List<string> GetBookmarksList()
    {
        if (string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot get bookmarks: username not set");
            throw new InvalidOperationException("Credentials not set. Call ConnectAsync first.");
        }

        _logger.LogDebug("Returning bookmarks list for user: {Username}", _username);
        return _bookmarksList;
    }

    public List<Friend> GetBookmarksWithStatus()
    {
        if (string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot get bookmarks with status: username not set");
            throw new InvalidOperationException("Credentials not set. Call ConnectAsync first.");
        }

        _logger.LogDebug("Returning {BookmarkCount} bookmarks with status for user: {Username}", _bookmarksWithStatus.Count, _username);
        return _bookmarksWithStatus.Values.ToList();
    }

    public FChatCharacter? GetOnlineCharacter(string characterName)
    {
        if (string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot get online character: username not set");
            throw new InvalidOperationException("Credentials not set. Call ConnectAsync first.");
        }

        if (_onlineCharactersCache.TryGetValue(characterName, out var onlineCharacter))
        {
            _logger.LogDebug("Found online character: {CharacterName} with status: {Status}", characterName, onlineCharacter.Status);
            return onlineCharacter;
        }

        _logger.LogDebug("Character {CharacterName} not found in online characters cache", characterName);
        return null;
    }

    public Dictionary<string, string> GetFriendGenders()
    {
        if (string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot get friend genders: username not set");
            throw new InvalidOperationException("Credentials not set. Call ConnectAsync first.");
        }

        _logger.LogDebug("Returning friend genders for user: {Username}", _username);
        return new Dictionary<string, string>(_friendGenders);
    }

    /// <summary>
    /// Gets friends with their online status from FRL response
    /// </summary>
    public List<Friend> GetFriendsWithStatus()
    {
        if (string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot get friends with status: username not set");
            throw new InvalidOperationException("Credentials not set. Call ConnectAsync first.");
        }

        _logger.LogDebug("Returning {FriendCount} friends with status for user: {Username}", _friendsWithStatus.Count, _username);
        return _friendsWithStatus.Values.ToList();
    }

    /// <summary>
    /// Marks all friends and bookmarks as offline. Called when CON is received to reset status before LIS chunks arrive.
    /// </summary>
    private void MarkAllFriendsAndBookmarksOffline()
    {
        _logger.LogInformation("Marking all friends and bookmarks as offline (CON received, preparing for LIS chunks)");
        
        var friendsMarkedOffline = 0;
        var bookmarksMarkedOffline = 0;
        
        // Mark all friends as offline
        foreach (var friend in _friendsWithStatus.Values)
        {
            friend.IsOnline = false;
            friend.Status = "offline";
            friend.LastSeen = DateTime.UtcNow;
            friendsMarkedOffline++;
        }
        
        // Mark all bookmarks as offline
        foreach (var bookmark in _bookmarksWithStatus.Values)
        {
            bookmark.IsOnline = false;
            bookmark.Status = "offline";
            bookmark.LastSeen = DateTime.UtcNow;
            bookmarksMarkedOffline++;
        }
        
        // Clear the online characters cache
        _onlineCharactersCache.Clear();
        
        _logger.LogInformation("Marked {FriendsCount} friends and {BookmarksCount} bookmarks as offline", 
            friendsMarkedOffline, bookmarksMarkedOffline);
    }

    /// <summary>
    /// Fix #4: Refreshes the friends list by clearing cache and requesting fresh FRL from F-Chat server
    /// </summary>
    public async Task RefreshFriendsListAsync()
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        _logger.LogInformation("Refreshing friends list - clearing cache and requesting fresh FRL");
        
        // Clear the friends cache to force fresh data
        _friendsWithStatus.Clear();
        _bookmarksWithStatus.Clear();
        
        // Request fresh friends list from F-Chat server
        // FRL command with empty object requests the full friends list
        await SendCommandAsync("FRL", new { });
        
        _logger.LogInformation("Sent FRL command to refresh friends list");
    }

    public async Task<List<FChatChannel>> GetChannelListAsync()
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Must be authenticated and have character selected");
        }

        // Check if there's already a pending channel list request
        Task<List<FChatChannel>>? existingTask = null;
        lock (_channelListRequestLock)
        {
            existingTask = _pendingChannelListRequest;
        }

        if (existingTask != null)
        {
            _logger.LogInformation("Channel list request already in progress, returning existing task");
            return await existingTask;
        }

        // Create new request task
        var requestTask = GetChannelListInternalAsync();
        
        // Store the task to prevent duplicates
        lock (_channelListRequestLock)
        {
            _pendingChannelListRequest = requestTask;
        }

        try
        {
            var result = await requestTask;
            return result;
        }
        finally
        {
            // Clear the pending request when done
            lock (_channelListRequestLock)
            {
                _pendingChannelListRequest = null;
            }
        }
    }

    private async Task<List<FChatChannel>> GetChannelListInternalAsync()
    {
        try
        {
            _logger.LogInformation("Requesting complete channel list from F-Chat (CHA + ORS)");

            // Request both CHA and ORS channel lists simultaneously
            var chaTask = SendCommandWithResponseAsync("CHA", new { }, "CHA", 15000);
            var orsTask = SendCommandWithResponseAsync("ORS", new { }, "ORS", 15000);

            // Wait for both responses
            var chaResponse = await chaTask;
            var orsResponse = await orsTask;

            _logger.LogInformation("CHA response type: {ChaResponseType}, ORS response type: {OrsResponseType}", 
                chaResponse?.GetType().Name ?? "null", orsResponse?.GetType().Name ?? "null");

            // Parse and merge the results
            var mergedChannels = MergeChannelLists(
                chaResponse as JsonElement?, 
                orsResponse as JsonElement?
            );
            
            _logger.LogInformation("Received merged channel list with {ChannelCount} channels", mergedChannels.Count);
            return mergedChannels;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting channel list from F-Chat");
            return [];
        }
    }

    private List<FChatChannel> MergeChannelLists(JsonElement? chaResponse, JsonElement? orsResponse)
    {
        var mergedChannels = new Dictionary<string, FChatChannel>();
        var chaChannelCount = 0;
        var orsChannelCount = 0;

        // Process CHA channels first
        if (chaResponse.HasValue && chaResponse.Value.TryGetProperty("channels", out var chaChannelsElement))
        {
            _logger.LogInformation("CHA response received with {ChannelCount} channels", chaChannelsElement.GetArrayLength());
            foreach (var channelElement in chaChannelsElement.EnumerateArray())
            {
                var channel = ParseChannelFromElement(channelElement);
                if (channel != null)
                {
                    mergedChannels[channel.Id] = channel;
                    chaChannelCount++;
                }
            }
            _logger.LogInformation("Successfully parsed {ChannelCount} channels from CHA response", chaChannelCount);
        }
        else
        {
            _logger.LogWarning("CHA response is null or missing 'channels' property. CHA response: {ChaResponse}", 
                chaResponse?.ToString() ?? "null");
        }

        // Process ORS channels, preferring ORS data for conflicts (more up-to-date user counts)
        if (orsResponse.HasValue && orsResponse.Value.TryGetProperty("channels", out var orsChannelsElement))
        {
            _logger.LogInformation("ORS response received with {ChannelCount} channels", orsChannelsElement.GetArrayLength());
            foreach (var channelElement in orsChannelsElement.EnumerateArray())
            {
                var channel = ParseChannelFromElement(channelElement);
                if (channel != null)
                {
                    mergedChannels[channel.Id] = channel; // This will overwrite CHA data if same channel
                    orsChannelCount++;
                }
            }
            _logger.LogInformation("Successfully parsed {ChannelCount} channels from ORS response", orsChannelCount);
        }
        else
        {
            _logger.LogWarning("ORS response is null or missing 'channels' property. ORS response: {OrsResponse}", 
                orsResponse?.ToString() ?? "null");
        }

        var result = mergedChannels.Values.ToList();
        _availableChannels = result; // Update the main channel list
        
        _logger.LogInformation("Merged channel lists: {TotalChannels} total channels ({ChaChannels} from CHA, {OrsChannels} from ORS)", 
            result.Count, chaChannelCount, orsChannelCount);
        
        return result;
    }

    private FChatChannel? ParseChannelFromElement(JsonElement channelElement)
    {
        try
        {
            if (channelElement.TryGetProperty("name", out var nameElement))
            {
                var id = nameElement.GetString() ?? "";
                var title = id; // Default to name if title is not provided
                
                // Try to get title, but don't require it
                if (channelElement.TryGetProperty("title", out var titleElement))
                {
                    var titleValue = titleElement.GetString();
                    if (!string.IsNullOrEmpty(titleValue))
                    {
                        title = titleValue;
                    }
                }

                if (string.IsNullOrEmpty(id)) return null;

                var userCount = 0;
                if (channelElement.TryGetProperty("characters", out var charactersElement))
                {
                    userCount = charactersElement.GetInt32();
                }

                var mode = ChannelMode.Chat;
                if (channelElement.TryGetProperty("mode", out var modeElement))
                {
                    var modeStr = modeElement.GetString();
                    if (Enum.TryParse<ChannelMode>(modeStr, true, out var parsedMode))
                    {
                        mode = parsedMode;
                    }
                }

                return new FChatChannel
                {
                    Id = id,
                    Name = id, // F-Chat uses the same for both
                    Title = title,
                    UserCount = userCount,
                    Mode = mode
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error parsing individual channel element");
        }
        
        return null;
    }

    /// <summary>
    /// Check if the current WebSocket connection is healthy and can be reused
    /// </summary>
    private bool IsConnectionHealthy()
    {
        var isHealthy = _webSocket?.State == WebSocketState.Open &&
                       !(_cancellationTokenSource?.Token.IsCancellationRequested ?? true);

        _logger.LogDebug("Connection health check: WebSocket State={WebSocketState}, Token Cancelled={TokenCancelled}, Overall Healthy={IsHealthy}",
            _webSocket?.State.ToString() ?? "null",
            _cancellationTokenSource?.Token.IsCancellationRequested ?? true,
            isHealthy);

        return isHealthy;
    }

    /// <summary>
    /// Switch to a different character on an existing healthy connection
    /// </summary>
    public Task<bool> SwitchCharacterAsync(string characterName)
    {
        if (!IsConnectionHealthy() || !_isAuthenticated)
        {
            _logger.LogError("Cannot switch character: connection not healthy or not authenticated");
            throw new InvalidOperationException("Connection must be healthy and authenticated to switch characters");
        }

        // First check if character exists in our list
        var character = _availableCharacters.FirstOrDefault(c => c.Name == characterName);
        if (character == null)
        {
            _logger.LogError("Character '{CharacterName}' not found in available characters list", characterName);
            throw new ArgumentException($"Character '{characterName}' not found");
        }

        // Check if we're trying to "switch" to the same character (which is a no-op)
        if (_selectedCharacter == characterName)
        {
            _logger.LogInformation("Character {Character} is already selected on this connection", characterName);
            return Task.FromResult(true);
        }

        // F-Chat protocol limitation: Each WebSocket connection is tied to one character via IDN authentication
        // We cannot switch characters on the same connection - this would require a new connection
        _logger.LogWarning("Cannot switch from character {CurrentCharacter} to {NewCharacter} on same F-Chat connection. F-Chat requires one character per connection.",
            _selectedCharacter, characterName);

        // For now, we'll reject character switching and require the caller to create a new connection
        throw new InvalidOperationException($"Cannot switch from character '{_selectedCharacter}' to '{characterName}' on same F-Chat connection. Character switching requires a new connection.");
    }

    public async Task<bool> SelectCharacterAsync(string characterName)
    {
        _logger.LogInformation("=== SelectCharacterAsync START ===");
        _logger.LogInformation("Attempting to select character: {CharacterName}", characterName);
        _logger.LogInformation("Current selected character: {CurrentCharacter}", _selectedCharacter ?? "None");
        _logger.LogInformation("Current connection state: {ConnectionState}", _webSocket?.State.ToString() ?? "No connection");
        _logger.LogInformation("Is authenticated: {IsAuthenticated}", _isAuthenticated);
        
        var startTime = DateTime.UtcNow;
        
        if (string.IsNullOrEmpty(_username) || string.IsNullOrEmpty(_ticket))
        {
            _logger.LogError("Cannot select character: credentials or ticket not available");
            _logger.LogError("Username available: {HasUsername}, Ticket available: {HasTicket}", 
                !string.IsNullOrEmpty(_username), !string.IsNullOrEmpty(_ticket));
            throw new InvalidOperationException("Must connect and authenticate first");
        }

        // First check if character exists in our list
        var character = _availableCharacters.FirstOrDefault(c => c.Name == characterName);
        if (character == null)
        {
            _logger.LogError("Character '{CharacterName}' not found in available characters list", characterName);
            _logger.LogError("Available characters: {AvailableCharacters}", 
                string.Join(", ", _availableCharacters.Select(c => c.Name)));
            throw new ArgumentException($"Character '{characterName}' not found");
        }

        _logger.LogInformation("Character {CharacterName} found in available characters list", characterName);

        // If we have a healthy connection, try to switch character instead of creating new connection
        var isHealthy = IsConnectionHealthy();
        _logger.LogInformation("Connection health check: {IsHealthy}", isHealthy);
        
        if (isHealthy)
        {
            _logger.LogInformation("Reusing existing healthy WebSocket connection for character: {Character}", characterName);
            var switchResult = await SwitchCharacterAsync(characterName);
            _logger.LogInformation("Character switch result: {Result}", switchResult);
            return switchResult;
        }

        try
        {
            _logger.LogInformation("Establishing new WebSocket connection for character: {Character}", characterName);

            // Clean up any existing unhealthy connection
            if (_webSocket != null)
            {
                _logger.LogInformation("Disposing unhealthy WebSocket connection (State: {State})", _webSocket.State);
                _webSocket.Dispose();
            }
            _cancellationTokenSource?.Cancel();
            _cancellationTokenSource?.Dispose();

            _webSocket = new ClientWebSocket();
            _cancellationTokenSource = new CancellationTokenSource();

            _logger.LogInformation("Connecting to F-Chat WebSocket: {ServerUrl}", _serverUrl);
            var connectStartTime = DateTime.UtcNow;
            
            // Retry logic for 504 Gateway Timeout errors
            var maxRetries = 3;
            var retryDelay = 2000; // Start with 2 seconds
            var connected = false;
            
            for (int attempt = 1; attempt <= maxRetries; attempt++)
            {
                try
                {
                    _logger.LogInformation("WebSocket connection attempt {Attempt}/{MaxRetries} for character {CharacterName}", 
                        attempt, maxRetries, characterName);
                    
                    await _webSocket.ConnectAsync(new Uri(_serverUrl), _cancellationTokenSource.Token);
                    connected = true;
                    break;
                }
                catch (WebSocketException ex) when (ex.Message.Contains("504") && attempt < maxRetries)
                {
                    _logger.LogWarning("F-List server overloaded (504 Gateway Timeout) on attempt {Attempt}/{MaxRetries} for character {CharacterName}. Retrying in {Delay}ms...", 
                        attempt, maxRetries, characterName, retryDelay);
                    
                    // Dispose the failed connection and create a new one
                    _webSocket.Dispose();
                    _webSocket = new ClientWebSocket();
                    
                    // Wait before retrying with exponential backoff
                    await Task.Delay(retryDelay, _cancellationTokenSource.Token);
                    retryDelay *= 2; // Double the delay for next attempt
                }
            }
            
            if (!connected)
            {
                var connectEndTime = DateTime.UtcNow;
                var connectDuration = connectEndTime - connectStartTime;
                _logger.LogError("Failed to connect to F-Chat WebSocket after {MaxRetries} attempts in {Duration}ms. F-List server appears to be overloaded.", 
                    maxRetries, connectDuration.TotalMilliseconds);
                throw new WebSocketException("F-List server is currently overloaded. Please try again in a few minutes.");
            }
            
            var finalConnectEndTime = DateTime.UtcNow;
            var finalConnectDuration = finalConnectEndTime - connectStartTime;
            _logger.LogInformation("WebSocket connection established in {Duration}ms", finalConnectDuration.TotalMilliseconds);

            if (_webSocket.State != WebSocketState.Open)
            {
                _logger.LogError("WebSocket failed to connect. State: {State}", _webSocket.State);
                return false;
            }

            _logger.LogInformation("WebSocket connected successfully, starting message listener");

            // Start listening for messages
            _ = Task.Run(async () => await ListenForMessagesAsync(_cancellationTokenSource.Token));

            // Authenticate with the selected character using existing ticket
            _logger.LogInformation("Authenticating with F-Chat using character: {Character}", characterName);
            if (string.IsNullOrEmpty(_ticket))
            {
                _logger.LogError("Cannot authenticate: ticket is null or empty");
                return false;
            }
            
            var authStartTime = DateTime.UtcNow;
            var authResult = await AuthenticateWithCharacterAsync(characterName, _ticket);
            var authEndTime = DateTime.UtcNow;
            var authDuration = authEndTime - authStartTime;
            _logger.LogInformation("Authentication completed in {Duration}ms with result: {Result}", 
                authDuration.TotalMilliseconds, authResult);

            if (authResult)
            {
                _selectedCharacter = characterName;
                _isAuthenticated = true;
                ConnectionStatusChanged?.Invoke("Connected");
                _logger.LogInformation("Successfully authenticated and connected as character: {Character}", characterName);
                
                var totalTime = DateTime.UtcNow - startTime;
                _logger.LogInformation("SelectCharacterAsync completed successfully in {TotalDuration}ms", totalTime.TotalMilliseconds);
                _logger.LogInformation("=== SelectCharacterAsync END (SUCCESS) ===");
                return true;
            }
            else
            {
                _logger.LogError("Authentication failed for character: {Character}", characterName);
                // Clean up failed connection
                _webSocket?.Dispose();
                _cancellationTokenSource?.Cancel();
                
                var totalTime = DateTime.UtcNow - startTime;
                _logger.LogInformation("SelectCharacterAsync failed in {TotalDuration}ms", totalTime.TotalMilliseconds);
                _logger.LogInformation("=== SelectCharacterAsync END (FAILED) ===");
                return false;
            }
        }
        catch (WebSocketException ex)
        {
            var totalTime = DateTime.UtcNow - startTime;
            
            if (ex.Message.Contains("504"))
            {
                _logger.LogError(ex, "F-List server overloaded (504 Gateway Timeout) while connecting with character {Character}", characterName);
                ConnectionStatusChanged?.Invoke("F-List server overloaded - please try again in a few minutes");
                _logger.LogInformation("SelectCharacterAsync failed with F-List server overload in {TotalDuration}ms", totalTime.TotalMilliseconds);
                _logger.LogInformation("=== SelectCharacterAsync END (F-LIST OVERLOAD) ===");
            }
            else
            {
                _logger.LogError(ex, "WebSocket error while connecting with character {Character}", characterName);
                ConnectionStatusChanged?.Invoke("WebSocket connection failed");
                _logger.LogInformation("SelectCharacterAsync failed with WebSocket error in {TotalDuration}ms", totalTime.TotalMilliseconds);
                _logger.LogInformation("=== SelectCharacterAsync END (WEBSOCKET ERROR) ===");
            }
            return false;
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogError(ex, "Connection timeout while connecting with character {Character}", characterName);
            ConnectionStatusChanged?.Invoke("Connection timeout");
            
            var totalTime = DateTime.UtcNow - startTime;
            _logger.LogInformation("SelectCharacterAsync failed with timeout in {TotalDuration}ms", totalTime.TotalMilliseconds);
            _logger.LogInformation("=== SelectCharacterAsync END (TIMEOUT) ===");
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while connecting with character {Character}", characterName);
            ConnectionStatusChanged?.Invoke("Connection failed");
            
            var totalTime = DateTime.UtcNow - startTime;
            _logger.LogInformation("SelectCharacterAsync failed with unexpected error in {TotalDuration}ms", totalTime.TotalMilliseconds);
            _logger.LogInformation("=== SelectCharacterAsync END (UNEXPECTED ERROR) ===");
            return false;
        }
    }

    public async Task SendMessageAsync(string channel, string message)
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        var msgData = new
        {
            channel = channel,
            message = message
        };

        await SendCommandAsync("MSG", msgData);
    }
    internal async Task SendPRIMessageAsync(string user, string message)
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        var msgData = new
        {
            recipient = user,
            message = message
        };

        await SendCommandAsync("PRI", msgData);
    }

    internal async Task SendTypingNotificationAsync(string recipient, string status)
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        var tpnData = new
        {
            character = recipient,
            status = status
        };

        await SendCommandAsync("TPN", tpnData);
        _logger.LogInformation("Sent typing notification to {Recipient}: {Status}", recipient, status);
    }

    public async Task SendStatusUpdateAsync(string status, string? statusMessage = null)
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        var statusData = new
        {
            status = status,
            statusmsg = statusMessage ?? ""
        };

        await SendCommandAsync("STA", statusData);
        _logger.LogInformation("Sent status update: {Status} - {StatusMessage}", status, statusMessage);
    }

    public async Task SearchCharactersAsync(Dictionary<string, object> searchCriteria)
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        await SendCommandAsync("FKS", searchCriteria);
        _logger.LogInformation("Sent character search request with criteria: {Criteria}", searchCriteria);
    }

    public async Task JoinChannelAsync(string channelName)
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        var joinData = new { channel = channelName };
        await SendCommandAsync("JCH", joinData);

        // Track joined channel
        _joinedChannels.Add(channelName);

        // Find and store channel details from available channels
        var channelDetails = _availableChannels.FirstOrDefault(c => c.Id == channelName || c.Name == channelName);
        if (channelDetails != null)
        {
            _joinedChannelDetails[channelName] = channelDetails;
            _logger.LogInformation("Joined channel {ChannelName} ({ChannelTitle}), now in {ChannelCount} channels",
                channelDetails.Name, channelDetails.Title, _joinedChannels.Count);
        }
        else
        {
            _logger.LogInformation("Joined channel {ChannelName}, now in {ChannelCount} channels", channelName, _joinedChannels.Count);
        }

        // Note: Channel operator list request removed as it was causing issues
    }

    public async Task LeaveChannelAsync(string channelName)
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        // Don't leave private channels
        if(channelName[..3] != "PRI") 
        {
            var leaveData = new { channel = channelName };
            await SendCommandAsync("LCH", leaveData);
        }

        // Track left channel
        _joinedChannels.Remove(channelName);
        _joinedChannelDetails.Remove(channelName);
        _logger.LogInformation("Left channel {ChannelName}, now in {ChannelCount} channels", channelName, _joinedChannels.Count);
    }

    public Task<List<string>> GetJoinedChannelsAsync()
    {
        return Task.FromResult(_joinedChannels.ToList());
    }


    public Task<List<FChatChannel>> GetJoinedChannelDetailsAsync()
    {
        var channelDetails = _joinedChannelDetails.Values.ToList();

        // For channels without details, create basic entries
        foreach (var channelId in _joinedChannels)
        {
            if (!_joinedChannelDetails.ContainsKey(channelId))
            {
                channelDetails.Add(new FChatChannel
                {
                    Id = channelId,
                    Name = channelId, // Fallback to ID as name
                    Title = channelId,
                    UserCount = 0,
                    Mode = ChannelMode.Chat
                });
            }
        }

        return Task.FromResult(channelDetails);
    }

    /// <summary>
    /// Gets the list of operators currently in a specific channel
    /// </summary>
    public Task<List<string>> GetChannelOperatorsAsync(string channelId)
    {
        if (_channelOperators.TryGetValue(channelId, out var operators))
        {
            return Task.FromResult(operators.ToList());
        }
        return Task.FromResult(new List<string>());
    }

    /// <summary>
    /// Gets the list of characters currently in a specific channel
    /// </summary>
    public Task<List<ChannelCharacter>> GetChannelCharactersAsync(string channelId)
    {
        if (_channelCharacters.TryGetValue(channelId, out var characters))
        {
            return Task.FromResult(characters.ToList());
        }
        return Task.FromResult(new List<ChannelCharacter>());
    }

    /// <summary>
    /// Requests the operator list for a channel using COL command
    /// Note: This only returns channel operators, not all characters in the channel
    /// </summary>
    public async Task<bool> RequestChannelOperatorListAsync(string channelId)
    {
        if (!_isAuthenticated || string.IsNullOrEmpty(_selectedCharacter))
        {
            throw new InvalidOperationException("Not authenticated or no character selected");
        }

        try
        {
            _logger.LogInformation("Requesting operator list for channel: {ChannelId}", channelId);

            var colData = new { channel = channelId };
            var response = await SendCommandWithResponseAsync("COL", colData, "COL", 10000);

            if (response != null)
            {
                _logger.LogInformation("Successfully received operator list for channel: {ChannelId}", channelId);
                return true;
            }

            _logger.LogWarning("Failed to get operator list for channel: {ChannelId}", channelId);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting operator list for channel: {ChannelId}", channelId);
            return false;
        }
    }

    public async Task RequestProfileAsync(string characterName)
    {
        if (!IsConnected || !_isAuthenticated)
        {
            throw new InvalidOperationException("Not connected or not authenticated");
        }

        _logger.LogInformation("Requesting profile for character: {CharacterName}", characterName);

        // Track the last requested character for PRD sequence handling
        _lastRequestedCharacter = characterName;
        _profileBuildInProgress = false;

        // Clear any existing building profile data for this character
        if (_buildingProfiles.ContainsKey(characterName))
        {
            _buildingProfiles.Remove(characterName);
        }

        var proData = new { character = characterName };
        await SendCommandAsync("PRO", proData);
    }

    public async Task<bool> AddBookmarkAsync(string characterName)
    {
        if (string.IsNullOrEmpty(_ticket) || string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot add bookmark: No valid ticket or username available");
            return false;
        }

        var ticket = _ticketManager.GetValidTicket(_username, characterName);
        if (string.IsNullOrEmpty(ticket))
        {
            _logger.LogError("Cannot add bookmark: No valid ticket available");
            return false;
        }

        try
        {
            _logger.LogInformation("Adding bookmark for character: {CharacterName}", characterName);

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);

            _logger.LogInformation("Adding bookmark for character: {CharacterName} with username: {Username} and ticket: {Ticket}", characterName, _username, _ticket);

            var bookmarkData = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("account", _username),
                new KeyValuePair<string, string>("ticket", ticket),
                new KeyValuePair<string, string>("name", characterName)
            });

            var response = await httpClient.PostAsync("https://www.f-list.net/json/api/bookmark-add.php", bookmarkData);
            var content = await response.Content.ReadAsStringAsync();

            _logger.LogDebug("Bookmark add response: {StatusCode}, Content: {Content}", response.StatusCode, content);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to add bookmark: {StatusCode}, {Content}", response.StatusCode, content);
                return false;
            }

            var bookmarkResponse = JsonSerializer.Deserialize<JsonElement>(content);
            
            if (bookmarkResponse.TryGetProperty("error", out var errorElement))
            {
                var errorMessage = errorElement.GetString();
                if (!string.IsNullOrEmpty(errorMessage))
                {
                    _logger.LogError("F-List API error adding bookmark: {Error}", errorMessage);
                    return false;
                }
            }

            // Add to local bookmarks list
            if (!_bookmarksList.Contains(characterName))
            {
                _bookmarksList.Add(characterName);
                _logger.LogInformation("Successfully added bookmark: {CharacterName}", characterName);
                
                // Add to friends list as well (bookmarks are automatically friends)
                if (!_friendsList.Contains(characterName))
                {
                    _friendsList.Add(characterName);
                    _logger.LogInformation("Added {CharacterName} to friends list as part of bookmark", characterName);
                }
                
                // Create initial bookmark entry with offline status (will be updated when profile data comes in)
                if (!_bookmarksWithStatus.ContainsKey(characterName))
                {
                    _bookmarksWithStatus[characterName] = new Friend
                    {
                        Name = characterName,
                        IsOnline = false,
                        Status = "offline",
                        LastSeen = DateTime.UtcNow,
                        Gender = null
                    };
                    _logger.LogInformation("Created initial bookmark entry for {CharacterName}", characterName);
                }
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding bookmark for character: {CharacterName}", characterName);
            return false;
        }
    }

    public async Task<bool> RemoveBookmarkAsync(string characterName)
    {
        if (string.IsNullOrEmpty(_ticket) || string.IsNullOrEmpty(_username))
        {
            _logger.LogError("Cannot remove bookmark: No valid ticket or username available");
            return false;
        }

        try
        {
            _logger.LogInformation("Removing bookmark for character: {CharacterName}", characterName);

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);

            var bookmarkData = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("account", _username),
                new KeyValuePair<string, string>("ticket", _ticket),
                new KeyValuePair<string, string>("name", characterName)
            });

            var response = await httpClient.PostAsync("https://www.f-list.net/json/api/bookmark-remove.php", bookmarkData);
            var content = await response.Content.ReadAsStringAsync();

            _logger.LogDebug("Bookmark remove response: {StatusCode}, Content: {Content}", response.StatusCode, content);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to remove bookmark: {StatusCode}, {Content}", response.StatusCode, content);
                return false;
            }

            var bookmarkResponse = JsonSerializer.Deserialize<JsonElement>(content);
            
            if (bookmarkResponse.TryGetProperty("error", out var errorElement))
            {
                var errorMessage = errorElement.GetString();
                if (!string.IsNullOrEmpty(errorMessage))
                {
                    _logger.LogError("F-List API error removing bookmark: {Error}", errorMessage);
                    return false;
                }
            }

            // Remove from local bookmarks list
            if (_bookmarksList.Contains(characterName))
            {
                _bookmarksList.Remove(characterName);
                _logger.LogInformation("Successfully removed bookmark: {CharacterName}", characterName);
                
                // Remove from friends list as well (bookmarks are automatically friends)
                if (_friendsList.Contains(characterName))
                {
                    _friendsList.Remove(characterName);
                    _logger.LogInformation("Removed {CharacterName} from friends list as part of bookmark removal", characterName);
                }
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing bookmark for character: {CharacterName}", characterName);
            return false;
        }
    }

    private async Task SendCommandAsync(string command, object data)
    {
        if (_webSocket?.State != WebSocketState.Open)
        {
            throw new InvalidOperationException("WebSocket is not connected");
        }

        var json = JsonSerializer.Serialize(data);
        var message = $"{command} {json}";
        var bytes = Encoding.UTF8.GetBytes(message);

        await _webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
        _logger.LogDebug("Sent F-Chat command: {Command}", message);
    }

    private async Task<object?> SendCommandWithResponseAsync(string command, object data, string expectedResponse, int timeoutMs = 10000)
    {
        var requestId = Guid.NewGuid().ToString();
        var tcs = new TaskCompletionSource<object?>();
        _pendingRequests[expectedResponse] = tcs;

        try
        {
            await SendCommandAsync(command, data);

            using var timeoutCts = new CancellationTokenSource(timeoutMs);
            timeoutCts.Token.Register(() => tcs.TrySetCanceled());

            return await tcs.Task;
        }
        finally
        {
            _pendingRequests.Remove(expectedResponse);
        }
    }

    private async Task ListenForMessagesAsync(CancellationToken cancellationToken)
    {
        if (_webSocket == null) return;

        var buffer = new byte[1024*4096];

        try
        {
            while (_webSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
            {
                var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    ProcessMessageAsync(message);
                }
                else if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.LogInformation("F-Chat WebSocket connection closed gracefully for user: {Username}", _username);
                    break;
                }
            }
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
        {
            _logger.LogWarning("F-Chat WebSocket connection closed prematurely for user: {Username}. This may be due to F-Chat server restart or network issues.", _username);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("F-Chat message listening cancelled for user: {Username}", _username);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in message listening loop for user: {Username}", _username);
        }
        finally
        {
            // Ensure we mark as disconnected and notify the service
            _isAuthenticated = false;
            _logger.LogInformation("F-Chat connection ended for user: {Username}", _username);
        }
    }

    private void ProcessMessageAsync(string message)
    {
        try
        {
            _logger.LogDebug("Received F-Chat message: {Message}", message);

            if (message.Length < 3)
                return;

            var command = message[..3];
            var jsonData = message.Length > 4 ? message[4..] : "{}";

            var data = JsonSerializer.Deserialize<JsonElement>(jsonData);

            // Log all commands for debugging profile issues
            if (command == "PRO" || command == "PRD" || command.StartsWith("PR"))
            {
                _logger.LogInformation("F-Chat command received: {Command} with data: {Data}", command, jsonData);
            }

            // Log character list related commands for debugging
            if (command == "USR" || command == "JCH" || command == "LCH" || command == "COL" || command == "ICH")
            {
                _logger.LogInformation("F-Chat character list command received: {Command} with data: {Data}", command, jsonData);
            }

            // Handle different message types
            switch (command)
            {
                case "IDN":
                    // IDN - Identity response
                    // payload example:     {"identity":"Some Guy"}
                    _logger.LogInformation("Received IDN (identity) command with data: {Data}", jsonData);
                    if (_pendingRequests.TryGetValue("IDN", out var idnTcs))
                    {
                        idnTcs.SetResult(data);
                    }
                    break;
                case "CON":
                    // Count of Online characters response
                    // payload example:     {"count":9379}
                    // CON is sent before LIS chunks, so we mark all friends/bookmarks as offline first
                    // Then LIS chunks will mark them online as they arrive

                    _onlineCharacterCount = JsonSerializer.Deserialize<JsonElement>(jsonData).GetProperty("count").GetInt32();
                    _receivedCharacterCount = 0;
                    _logger.LogInformation("Online character count: {Count}", _onlineCharacterCount);
                    
                    // Mark all friends and bookmarks as offline before processing LIS chunks
                    MarkAllFriendsAndBookmarksOffline();
                    if (_pendingRequests.TryGetValue("CON", out var conTcs))
                    {
                        conTcs.SetResult(data);
                    }
                    break;

                case "FRL":
                    // Friends list response - parse friends with online status
                    _logger.LogInformation("Received FRL (friends list) command with data: {Data}", jsonData);
                    HandleFriendsListResponse(data);
                    
                    // Complete pending requests
                    if (_pendingRequests.TryGetValue(command, out var tcs))
                    {
                        tcs.SetResult(data);
                    }
                    break;

                case "LIS":
                    // LIS - List of online characters with their status
                    HandleOnlineCharactersList(data);
                    break;

                case "CHA":
                    // CHA channel list response
                    _logger.LogInformation("=== CHA COMMAND RECEIVED ===");
                    _logger.LogInformation("Raw CHA data: {Data}", jsonData);
                    ParseChannelList(data, "CHA");
                    if (_pendingRequests.TryGetValue(command, out var chaTcs))
                    {
                        chaTcs.SetResult(data);
                    }
                    _logger.LogInformation("=== CHA PROCESSING COMPLETE ===");
                    break;

                case "ORS":
                    // ORS channel list response
                    _logger.LogInformation("=== ORS COMMAND RECEIVED ===");
                    _logger.LogInformation("Raw ORS data: {Data}", jsonData);
                    ParseChannelList(data, "ORS");
                    if (_pendingRequests.TryGetValue(command, out var orsTcs))
                    {
                        orsTcs.SetResult(data);
                    }
                    _logger.LogInformation("=== ORS PROCESSING COMPLETE ===");
                    break;

                case "COL":
                    // Channel character list response
                    ParseChannelCharacterList(data);
                    if (_pendingRequests.TryGetValue(command, out var colTcs))
                    {
                        colTcs.SetResult(data);
                    }
                    break;

                case "USR":
                    // User status update - might not always be channel-related
                    HandleUserStatusUpdate(data);
                    break;

                case "JCH":
                    // User joined channel
                    HandleUserJoinedChannel(data);
                    break;

                case "ICH":
                    // Initial channel data - received in response to JCH
                    HandleInitialChannelData(data);
                    break;

                case "LCH":
                    // User left channel
                    HandleUserLeftChannel(data);
                    break;

                case "PRI":
                    var fchatPRIMessage = ParseMessage(data);
                    if (fchatPRIMessage != null)
                    {
                        MessageReceived?.Invoke(fchatPRIMessage);
                    }

                    break;

                case "MSG":
                    // Channel message
                    var fchatMessage = ParseMessage(data);
                    if (fchatMessage != null)
                    {
                        MessageReceived?.Invoke(fchatMessage);
                    }
                    break;

                case "RLL":
                    // Dice roll message
                    _logger.LogInformation("Received RLL (dice roll) command with data: {Data}", jsonData);
                    var fchatRollMessage = ParseRollMessage(data);
                    if (fchatRollMessage != null)
                    {
                        _logger.LogInformation("Parsed dice roll from {Character}: {Message}", fchatRollMessage.Character, fchatRollMessage.Message);
                        MessageReceived?.Invoke(fchatRollMessage);
                    }
                    break;

                case "PRD":
                    // Profile response data - handle the start/info/select/end sequence
                    HandlePRDCommandAsync(data, jsonData);
                    break;

                case "STA":
                    // Status update
                    // STA command received - logging removed
                    HandleStatusUpdate(data);
                    break;

                case "NLN":
                    // User came online
                    // NLN command received - logging removed
                    HandleUserOnline(data);
                    break;

                case "FLN":
                    // User went offline
                    // FLN command received - logging removed
                    HandleUserOffline(data);
                    break;

                case "TPN":
                    // Typing notification - only for PM windows
                    _logger.LogInformation("Received TPN (typing notification) command with data: {Data}", jsonData);
                    HandleTypingNotification(data);
                    break;

                case "FKS":
                    // Search results response
                    _logger.LogInformation("Received FKS (search results) command with data: {Data}", jsonData);
                    HandleSearchResults(data);
                    break;

                case "ERR":
                    // Error message
                    if (data.TryGetProperty("message", out var errorMsg))
                    {
                        var errorMessage = errorMsg.GetString() ?? "";
                        _logger.LogError("F-Chat error: {Error}", errorMessage);
                        
                        // Handle specific error types that indicate disconnection
                        if (errorMessage.Contains("logged in at another location") || 
                            errorMessage.Contains("disconnected") ||
                            errorMessage.Contains("connection lost"))
                        {
                            _logger.LogWarning("F-Chat disconnection detected for user: {Username}. Error: {Error}", _username, errorMessage);
                            _isAuthenticated = false;
                            
                            // Notify the service about the disconnection
                            // Note: This would need to be passed from the service to notify properly
                            // For now, just log the disconnection
                        }
                        
                        // Handle character not found errors
                        if (errorMessage.Contains("character requested was not found") ||
                            errorMessage.Contains("character not found") ||
                            errorMessage.Contains("user not found"))
                        {
                            _logger.LogWarning("F-Chat character not found error: {Error}. This may indicate the character is offline, doesn't exist, or the name was misspelled.", errorMessage);
                            
                            // Extract character name from the error context if possible
                            var characterName = ExtractCharacterNameFromError(errorMessage);
                            
                            // Notify about the character error
                            CharacterError?.Invoke(characterName, errorMessage);
                        }
                    }
                    break;

                default:
                    // Log unhandled commands for debugging
                    _logger.LogDebug("Unhandled F-Chat command: {Command} with data: {Data}", command, jsonData);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing F-Chat message");
        }

        return;
    }

    private void HandlePRDCommandAsync(JsonElement data, string rawJsonData)
    {
        try
        {
            // Extract character name and type from PRD data
            if (!data.TryGetProperty("character", out var charElement))
            {
                _logger.LogWarning("Received PRD command without character property. Data: {Data}", rawJsonData);
                return;
            }

            var characterName = charElement.GetString() ?? "";
            if (string.IsNullOrEmpty(characterName))
            {
                _logger.LogWarning("Received PRD command with empty character name. Data: {Data}", rawJsonData);
                return;
            }

            // Check if this is for the character we requested
            if (_lastRequestedCharacter != characterName)
            {
                _logger.LogWarning("Received PRD for character {ReceivedCharacter} but last requested was {RequestedCharacter}. Ignoring.",
                    characterName, _lastRequestedCharacter ?? "none");
                return;
            }

            // Extract type to determine the PRD sequence step
            var type = "unknown";
            if (data.TryGetProperty("type", out var typeElement))
            {
                type = typeElement.GetString() ?? "unknown";
            }

            _logger.LogInformation("Handling PRD command for character {CharacterName}, type: {Type}", characterName, type);

            switch (type.ToLower())
            {
                case "start":
                    // Begin profile building sequence
                    _profileBuildInProgress = true;
                    _buildingProfiles[characterName] = new ProfileData { CharacterName = characterName };
                    _logger.LogInformation("Started profile building for character {CharacterName}", characterName);
                    break;

                case "info":
                case "select":
                    // Add profile information to building profile
                    if (!_profileBuildInProgress || !_buildingProfiles.ContainsKey(characterName))
                    {
                        _logger.LogWarning("Received PRD {Type} for {CharacterName} but no profile build in progress", type, characterName);
                        return;
                    }

                    var buildingProfile = _buildingProfiles[characterName];

                    // Store the profile field data
                    if (data.TryGetProperty("key", out var keyElement) && data.TryGetProperty("value", out var valueElement))
                    {
                        var key = keyElement.GetString() ?? "";
                        var value = valueElement.GetString() ?? "";

                        if (!string.IsNullOrEmpty(key))
                        {
                            // Store in appropriate section based on type
                            if (type.ToLower() == "info")
                            {
                                buildingProfile.Info[key] = value;
                            }
                            else if (type.ToLower() == "select")
                            {
                                buildingProfile.Info[key] = value;
                            }

                            _logger.LogDebug("Added profile {Type} field for {CharacterName}: {Key} = {Value}",
                                type, characterName, key, value.Length > 50 ? $"{value.Substring(0, 50)}..." : value);
                        }
                    }
                    else
                    {
                        // If no key/value structure, store the entire data object in Info
                        buildingProfile.Info[type] = data.ToString();
                        _logger.LogDebug("Added profile section for {CharacterName}: {Type}", characterName, type);
                    }
                    break;

                case "end":
                    // Complete profile building sequence
                    if (!_profileBuildInProgress || !_buildingProfiles.ContainsKey(characterName))
                    {
                        _logger.LogWarning("Received PRD end for {CharacterName} but no profile build in progress", characterName);
                        return;
                    }

                    _profileBuildInProgress = false;
                    var completedProfile = _buildingProfiles[characterName];

                    // Extract gender from the completed profile data
                    completedProfile.ExtractGender();

                    // Convert built profile to JSON for the ProfileReceived event
                    var profileJson = JsonSerializer.Serialize(completedProfile, new JsonSerializerOptions
                    {
                        WriteIndented = true
                    });

                    _logger.LogInformation("Completed profile building for character {CharacterName}: {Summary}",
                        characterName, completedProfile.GetSummary());

                    // Invoke the ProfileReceived event with the structured profile data
                    ProfileReceived?.Invoke(characterName, profileJson);

                    // Clean up building state
                    _buildingProfiles.Remove(characterName);
                    _lastRequestedCharacter = null;
                    break;

                default:
                    _logger.LogWarning("Received PRD with unknown type '{Type}' for character {CharacterName}. Data: {Data}",
                        type, characterName, rawJsonData);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling PRD command. Data: {Data}", rawJsonData);
        }
    }

    private FChatMessage? ParseMessage(JsonElement data)
    {
        try
        {
            if (data.TryGetProperty("character", out var charElement) &&
                data.TryGetProperty("message", out var msgElement) &&
                data.TryGetProperty("channel", out var channelElement))
            {
                return new FChatMessage
                {
                    Character = charElement.GetString() ?? "",
                    Message = msgElement.GetString() ?? "",
                    Channel = channelElement.GetString() ?? "",
                    Timestamp = DateTime.UtcNow,
                    Id = Guid.NewGuid().ToString()
                };
            }
            if (data.TryGetProperty("character", out charElement) &&
                data.TryGetProperty("message", out msgElement))
            {
                return new FChatMessage
                {
                    Character = charElement.GetString() ?? "",
                    Message = msgElement.GetString() ?? "",
                    Channel = "PRI-" + charElement.GetString() ?? "",
                    Timestamp = DateTime.UtcNow,
                    Id = Guid.NewGuid().ToString()
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing F-Chat message");
        }

        return null;
    }

    private FChatMessage? ParseRollMessage(JsonElement data)
    {
        try
        {
            if (data.TryGetProperty("character", out var charElement) &&
                data.TryGetProperty("message", out var msgElement) &&
                data.TryGetProperty("channel", out var channelElement))
            {
                return new FChatMessage
                {
                    Character = charElement.GetString() ?? "",
                    Message = msgElement.GetString() ?? "",
                    Channel = channelElement.GetString() ?? "",
                    Timestamp = DateTime.UtcNow,
                    MessageType = "Roll" // Add a new message type for dice rolls
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing F-Chat roll message");
        }

        return null;
    }

    private void ParseChannelList(JsonElement data, string commandType)
    {
        try
        {
            _logger.LogInformation("Parsing {CommandType} channel list from F-Chat", commandType);
            _logger.LogInformation("{CommandType} data structure: {Data}", commandType, data.ToString());

            if (data.TryGetProperty("channels", out var channelsElement))
            {
                _logger.LogInformation("{CommandType} found 'channels' property with {ChannelCount} items", 
                    commandType, channelsElement.GetArrayLength());
                
                var channels = new List<FChatChannel>();
                foreach (var channelElement in channelsElement.EnumerateArray())
                {
                    _logger.LogDebug("{CommandType} processing channel element: {ChannelElement}", 
                        commandType, channelElement.ToString());
                        
                    if (channelElement.TryGetProperty("name", out var nameElement))
                    {
                        var id = nameElement.GetString() ?? "";
                        var title = id; // Default to name if title is not provided
                        
                        // Try to get title, but don't require it
                        if (channelElement.TryGetProperty("title", out var titleElement))
                        {
                            var titleValue = titleElement.GetString();
                            if (!string.IsNullOrEmpty(titleValue))
                            {
                                title = titleValue;
                            }
                        }

                        if (string.IsNullOrEmpty(id)) 
                        {
                            _logger.LogWarning("{CommandType} skipping channel with empty name", commandType);
                            continue;
                        }

                        var userCount = 0;
                        if (channelElement.TryGetProperty("characters", out var charactersElement))
                        {
                            userCount = charactersElement.GetInt32();
                        }

                        var mode = ChannelMode.Chat;
                        if (channelElement.TryGetProperty("mode", out var modeElement))
                        {
                            var modeStr = modeElement.GetString();
                            if (Enum.TryParse<ChannelMode>(modeStr, true, out var parsedMode))
                            {
                                mode = parsedMode;
                            }
                        }

                        var channel = new FChatChannel
                        {
                            Id = id,
                            Name = id, // F-Chat uses the same for both
                            Title = title,
                            UserCount = userCount,
                            Mode = mode
                        };
                        
                        channels.Add(channel);
                        _logger.LogDebug("{CommandType} added channel: {ChannelId} - {ChannelTitle}", 
                            commandType, channel.Id, channel.Title);
                    }
                    else
                    {
                        _logger.LogWarning("{CommandType} channel element missing required 'name' property: {ChannelElement}", 
                            commandType, channelElement.ToString());
                    }
                }

                // Store channels based on command type
                if (commandType == "CHA")
                {
                    _chaChannels = channels;
                    _logger.LogInformation("Parsed {ChannelCount} channels from CHA command", channels.Count);
                }
                else if (commandType == "ORS")
                {
                    _orsChannels = channels;
                    _logger.LogInformation("Parsed {ChannelCount} channels from ORS command", channels.Count);
                }
            }
            else
            {
                _logger.LogWarning("{CommandType} response does not contain 'channels' property. Available properties: {Properties}", 
                    commandType, string.Join(", ", data.EnumerateObject().Select(p => p.Name)));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing F-Chat {CommandType} channel list", commandType);
        }
    }

    private void ParseChannelCharacterList(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Parsing channel operator list from F-Chat COL command");

            if (data.TryGetProperty("channel", out var channelElement) &&
                data.TryGetProperty("oplist", out var oplistElement))
            {
                var channelId = channelElement.GetString() ?? "";
                if (string.IsNullOrEmpty(channelId))
                {
                    _logger.LogWarning("Received COL command without channel ID");
                    return;
                }

                var operators = new List<string>();
                foreach (var opElement in oplistElement.EnumerateArray())
                {
                    var operatorName = opElement.GetString() ?? "";
                    if (!string.IsNullOrEmpty(operatorName))
                    {
                        operators.Add(operatorName);
                    }
                }

                // Store operators separately - COL only gives us operators, not all characters
                _channelOperators[channelId] = operators;
                _logger.LogInformation("Parsed {OperatorCount} operators for channel {ChannelId}", operators.Count, channelId);
            }
            else
            {
                _logger.LogWarning("Received COL command with unexpected format: {Data}", data.ToString());
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing F-Chat channel operator list");
        }
    }

    private void HandleUserJoinedChannel(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling user joined channel with data: {Data}", data.ToString());

            string channelId = "";
            string characterName = "";

            // Try different possible JSON structures for USR/JCH commands
            if (data.TryGetProperty("channel", out var channelElement))
            {
                if (channelElement.ValueKind == JsonValueKind.String)
                {
                    channelId = channelElement.GetString() ?? "";
                }
                else if (channelElement.ValueKind == JsonValueKind.Object)
                {
                    // Sometimes channel might be an object with an id property
                    if (channelElement.TryGetProperty("id", out var channelIdElement))
                    {
                        channelId = channelIdElement.GetString() ?? "";
                    }
                }
            }

            if (data.TryGetProperty("character", out var characterElement))
            {
                if (characterElement.ValueKind == JsonValueKind.String)
                {
                    characterName = characterElement.GetString() ?? "";
                }
                else if (characterElement.ValueKind == JsonValueKind.Object)
                {
                    // Try different possible character object structures
                    if (characterElement.TryGetProperty("identity", out var identityElement))
                    {
                        characterName = identityElement.GetString() ?? "";
                    }
                    else if (characterElement.TryGetProperty("name", out var nameElement))
                    {
                        characterName = nameElement.GetString() ?? "";
                    }
                    else if (characterElement.TryGetProperty("character", out var nestedCharacterElement))
                    {
                        characterName = nestedCharacterElement.GetString() ?? "";
                    }
                }
            }

            // Alternative: check if the data itself contains the character name directly
            if (string.IsNullOrEmpty(characterName) && data.ValueKind == JsonValueKind.String)
            {
                characterName = data.GetString() ?? "";
            }

            // Alternative: check for "name" property at root level
            if (string.IsNullOrEmpty(characterName) && data.TryGetProperty("name", out var rootNameElement))
            {
                if (rootNameElement.ValueKind == JsonValueKind.String)
                {
                    characterName = rootNameElement.GetString() ?? "";
                }
            }

            if (string.IsNullOrEmpty(channelId) || string.IsNullOrEmpty(characterName))
            {
                _logger.LogWarning("Received USR/JCH command with missing channel or character. Channel: '{Channel}', Character: '{Character}', Data: {Data}", 
                    channelId, characterName, data.ToString());
                return;
            }

            var now = DateTime.UtcNow;
            
            // Try to get character details from online characters cache
            string gender = string.Empty;
            string? statusMessage = null;
            if (_onlineCharactersCache.TryGetValue(characterName, out var onlineCharacter))
            {
                gender = onlineCharacter.Gender;
                statusMessage = onlineCharacter.StatusMessage;
            }
            // Also check friend genders cache as fallback
            else if (_friendGenders.TryGetValue(characterName, out var cachedGender))
            {
                gender = cachedGender;
            }
            
            var character = new ChannelCharacter
            {
                CharacterName = characterName,
                ChannelId = channelId,
                JoinedAt = now,
                LastSeenAt = now,
                Status = CharacterStatus.Online,
                Gender = gender,
                StatusMessage = statusMessage
            };

            // Add to channel character list
            if (!_channelCharacters.ContainsKey(channelId))
            {
                _channelCharacters[channelId] = new List<ChannelCharacter>();
            }

            // Remove existing entry if present (in case of rejoin)
            _channelCharacters[channelId].RemoveAll(c => c.CharacterName == characterName);
            _channelCharacters[channelId].Add(character);

            // Character joined channel - logging removed
            CharacterJoinedChannel?.Invoke(channelId, character);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling user joined channel. Data: {Data}", data.ToString());
        }
    }

    private void HandleUserLeftChannel(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling user left channel with data: {Data}", data.ToString());

            string channelId = "";
            string characterName = "";

            // Try different possible JSON structures for LCH commands
            if (data.TryGetProperty("channel", out var channelElement))
            {
                if (channelElement.ValueKind == JsonValueKind.String)
                {
                    channelId = channelElement.GetString() ?? "";
                }
                else if (channelElement.ValueKind == JsonValueKind.Object)
                {
                    // Sometimes channel might be an object with an id property
                    if (channelElement.TryGetProperty("id", out var channelIdElement))
                    {
                        channelId = channelIdElement.GetString() ?? "";
                    }
                }
            }

            if (data.TryGetProperty("character", out var characterElement))
            {
                if (characterElement.ValueKind == JsonValueKind.String)
                {
                    characterName = characterElement.GetString() ?? "";
                }
                else if (characterElement.ValueKind == JsonValueKind.Object)
                {
                    // Try different possible character object structures
                    if (characterElement.TryGetProperty("identity", out var identityElement))
                    {
                        characterName = identityElement.GetString() ?? "";
                    }
                    else if (characterElement.TryGetProperty("name", out var nameElement))
                    {
                        characterName = nameElement.GetString() ?? "";
                    }
                    else if (characterElement.TryGetProperty("character", out var nestedCharacterElement))
                    {
                        characterName = nestedCharacterElement.GetString() ?? "";
                    }
                }
            }

            // Alternative: check if the data itself contains the character name directly
            if (string.IsNullOrEmpty(characterName) && data.ValueKind == JsonValueKind.String)
            {
                characterName = data.GetString() ?? "";
            }

            // Alternative: check for "name" property at root level
            if (string.IsNullOrEmpty(characterName) && data.TryGetProperty("name", out var rootNameElement))
            {
                if (rootNameElement.ValueKind == JsonValueKind.String)
                {
                    characterName = rootNameElement.GetString() ?? "";
                }
            }

            if (string.IsNullOrEmpty(channelId) || string.IsNullOrEmpty(characterName))
            {
                _logger.LogWarning("Received LCH command with missing channel or character. Channel: '{Channel}', Character: '{Character}', Data: {Data}", 
                    channelId, characterName, data.ToString());
                return;
            }

            // Remove from channel character list
            if (_channelCharacters.ContainsKey(channelId))
            {
                var removed = _channelCharacters[channelId].RemoveAll(c => c.CharacterName == characterName);
                if (removed > 0)
                {
                    // Character left channel - logging removed
                    CharacterLeftChannel?.Invoke(channelId, characterName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling user left channel. Data: {Data}", data.ToString());
        }
    }

    private void HandleUserStatusUpdate(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling user status update with data: {Data}", data.ToString());

            // USR commands might be general status updates, not necessarily channel-related
            // We'll only process them if they contain channel information
            string channelId = "";
            string characterName = "";

            // Try to extract channel and character information
            if (data.TryGetProperty("channel", out var channelElement))
            {
                if (channelElement.ValueKind == JsonValueKind.String)
                {
                    channelId = channelElement.GetString() ?? "";
                }
            }

            if (data.TryGetProperty("character", out var characterElement))
            {
                if (characterElement.ValueKind == JsonValueKind.String)
                {
                    characterName = characterElement.GetString() ?? "";
                }
            }

            // Alternative: check for "name" property at root level
            if (string.IsNullOrEmpty(characterName) && data.TryGetProperty("name", out var nameElement))
            {
                characterName = nameElement.GetString() ?? "";
            }

            // Only process if we have both channel and character information
            if (!string.IsNullOrEmpty(channelId) && !string.IsNullOrEmpty(characterName))
            {
                _logger.LogInformation("Processing USR command as channel join for {CharacterName} in {ChannelId}", characterName, channelId);
                HandleUserJoinedChannel(data);
            }
            else
            {
                _logger.LogDebug("USR command received without channel information, ignoring for character list purposes");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling user status update. Data: {Data}", data.ToString());
        }
    }

    public void Dispose()
    {
        _cancellationTokenSource?.Cancel();
        _webSocket?.Dispose();
        _cancellationTokenSource?.Dispose();
        GC.SuppressFinalize(this);
    }


    public string? SelectedCharacter => _selectedCharacter;
    public bool IsAuthenticated => _isAuthenticated;
    private void HandleStatusUpdate(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling status update with data: {Data}", data.ToString());

            string characterName = "";
            string status = "";
            string statusMessage = "";

            // Extract character name
            if (data.TryGetProperty("character", out var characterElement))
            {
                if (characterElement.ValueKind == JsonValueKind.String)
                {
                    characterName = characterElement.GetString() ?? "";
                }
            }

            // Extract status
            if (data.TryGetProperty("status", out var statusElement))
            {
                if (statusElement.ValueKind == JsonValueKind.String)
                {
                    status = statusElement.GetString() ?? "";
                }
            }

            // Extract status message (optional)
            if (data.TryGetProperty("statusmsg", out var statusMsgElement))
            {
                if (statusMsgElement.ValueKind == JsonValueKind.String)
                {
                    statusMessage = statusMsgElement.GetString() ?? "";
                }
            }

            if (!string.IsNullOrEmpty(characterName) && !string.IsNullOrEmpty(status))
            {
                // Status update - logging removed

                // Update channel characters if this character is in any channels
                foreach (var kvp in _channelCharacters)
                {
                    var channelId = kvp.Key;
                    var characters = kvp.Value;
                    
                    var characterInChannel = characters.FirstOrDefault(c => c.CharacterName == characterName);
                    if (characterInChannel != null)
                    {
                        // Update the character's status and status message
                        characterInChannel.Status = status.ToLower() switch
                        {
                            "online" => CharacterStatus.Online,
                            "away" => CharacterStatus.Away,
                            "busy" => CharacterStatus.Busy,
                            "looking" => CharacterStatus.Looking,
                            "donotdisturb" => CharacterStatus.DoNotDisturb,
                            _ => CharacterStatus.Online
                        };
                        characterInChannel.StatusMessage = statusMessage;
                        characterInChannel.LastSeenAt = DateTime.UtcNow;
                        
                        _logger.LogDebug("Updated character {CharacterName} status in channel {ChannelId} to {Status}", 
                            characterName, channelId, status);
                    }
                }

                // Update online characters cache
                if (_onlineCharactersCache.TryGetValue(characterName, out var onlineCharacter))
                {
                    onlineCharacter.Status = status;
                    onlineCharacter.StatusMessage = statusMessage;
                    onlineCharacter.LastSeen = DateTime.UtcNow;
                }

                // Fix #2: Update friends cache when status changes
                var statusLower = status.ToLower();
                var isOffline = statusLower == "offline";
                
                if (_friendsWithStatus.TryGetValue(characterName, out var friend))
                {
                    friend.Status = status;
                    friend.StatusMessage = statusMessage;
                    friend.IsOnline = !isOffline;
                    friend.LastSeen = DateTime.UtcNow;
                    
                    if (isOffline)
                    {
                        _logger.LogInformation("Marked friend {CharacterName} as offline via STA command", characterName);
                        // Remove from online characters cache when explicitly offline
                        _onlineCharactersCache.TryRemove(characterName, out _);
                    }
                }
                
                // Also update bookmarks cache
                if (_bookmarksWithStatus.TryGetValue(characterName, out var bookmark))
                {
                    bookmark.Status = status;
                    bookmark.StatusMessage = statusMessage;
                    bookmark.IsOnline = !isOffline;
                    bookmark.LastSeen = DateTime.UtcNow;
                    
                    if (isOffline)
                    {
                        _logger.LogInformation("Marked bookmark {CharacterName} as offline via STA command", characterName);
                    }
                }

                // Fire the status updated event
                StatusUpdated?.Invoke(characterName, status, statusMessage);
            }
            else
            {
                _logger.LogWarning("STA command missing required fields - Character: {Character}, Status: {Status}", 
                    characterName, status);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling status update");
        }
    }

    private void HandleUserOnline(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling user online with data: {Data}", data.ToString());

            string characterName = "";

            // Extract character name - NLN uses "identity" field
            if (data.TryGetProperty("identity", out var identityElement))
            {
                if (identityElement.ValueKind == JsonValueKind.String)
                {
                    characterName = identityElement.GetString() ?? "";
                }
            }

            if (!string.IsNullOrEmpty(characterName))
            {
                // Extract additional data from NLN command
                string status = "online";
                string gender = "";
                
                if (data.TryGetProperty("status", out var statusElement))
                {
                    status = statusElement.GetString() ?? "online";
                }
                
                if (data.TryGetProperty("gender", out var genderElement))
                {
                    gender = genderElement.GetString() ?? "";
                }
                
                // User came online - logging removed
                
                // Cache gender information for friends
                if (!string.IsNullOrEmpty(gender) && _friendsList.Contains(characterName))
                {
                    _friendGenders[characterName] = gender;
                }
                
                // Fire the user online event with additional data
                UserOnline?.Invoke(characterName, status, gender);
            }
            else
            {
                _logger.LogWarning("NLN command missing identity field");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling user online");
        }
    }

    private void HandleUserOffline(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling user offline with data: {Data}", data.ToString());

            string characterName = "";

            // Extract character name
            if (data.TryGetProperty("character", out var characterElement))
            {
                if (characterElement.ValueKind == JsonValueKind.String)
                {
                    characterName = characterElement.GetString() ?? "";
                }
            }

            if (!string.IsNullOrEmpty(characterName))
            {
                // User went offline - logging removed
                
                // Fix #1: Mark friend as offline in cache
                if (_friendsWithStatus.TryGetValue(characterName, out var friend))
                {
                    friend.IsOnline = false;
                    friend.Status = "offline";
                    friend.LastSeen = DateTime.UtcNow;
                    _logger.LogInformation("Marked friend {CharacterName} as offline in friends cache", characterName);
                }
                
                // Also mark bookmark as offline if it exists
                if (_bookmarksWithStatus.TryGetValue(characterName, out var bookmark))
                {
                    bookmark.IsOnline = false;
                    bookmark.Status = "offline";
                    bookmark.LastSeen = DateTime.UtcNow;
                    _logger.LogInformation("Marked bookmark {CharacterName} as offline in bookmarks cache", characterName);
                }
                
                // Remove from online characters cache
                _onlineCharactersCache.TryRemove(characterName, out _);
                
                // Fire the user offline event
                UserOffline?.Invoke(characterName);
            }
            else
            {
                _logger.LogWarning("FLN command missing character field");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling user offline");
        }
    }

    private void HandleTypingNotification(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling typing notification with data: {Data}", data.ToString());

            string fromCharacter = "";
            string status = "";

            // Extract character name (who is typing)
            if (data.TryGetProperty("character", out var characterElement))
            {
                if (characterElement.ValueKind == JsonValueKind.String)
                {
                    fromCharacter = characterElement.GetString() ?? "";
                }
            }

            // Extract status (typing, paused, clear)
            if (data.TryGetProperty("status", out var statusElement))
            {
                if (statusElement.ValueKind == JsonValueKind.String)
                {
                    status = statusElement.GetString() ?? "";
                }
            }

            if (!string.IsNullOrEmpty(fromCharacter) && !string.IsNullOrEmpty(status))
            {
                _logger.LogInformation("Typing notification from {FromCharacter}: {Status}", fromCharacter, status);
                
                // Fire the typing notification event - TPN is only for PM windows
                // The current character receiving this notification is the selected character
                if (!string.IsNullOrEmpty(_selectedCharacter))
                {
                    TypingNotificationReceived?.Invoke(_selectedCharacter, fromCharacter, status);
                }
                else
                {
                    _logger.LogWarning("TPN received but no character selected");
                }
            }
            else
            {
                _logger.LogWarning("TPN command missing character or status field");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling typing notification");
        }
    }

    private void HandleSearchResults(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling search results with data: {Data}", data.ToString());

            var searchResults = new List<SearchResult>();

            // FKS command returns: {"characters":["Some Guy", "Another Guy", "Some Gal"], "kinks": ["523","66"]}
            if (data.TryGetProperty("characters", out var charactersElement) && 
                charactersElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var characterElement in charactersElement.EnumerateArray())
                {
                    if (characterElement.ValueKind == JsonValueKind.String)
                    {
                        var characterName = characterElement.GetString();
                        if (!string.IsNullOrEmpty(characterName))
                        {
                            // Create a basic search result - we'll look up the character details
                            var result = new SearchResult
                            {
                                CharacterName = characterName
                            };
                            searchResults.Add(result);
                        }
                    }
                }
            }

            _logger.LogInformation("Processed {Count} search results from FKS command", searchResults.Count);
            SearchResultsReceived?.Invoke(searchResults);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling search results");
        }
    }

    private void HandleInitialChannelData(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling initial channel data with data: {Data}", data.ToString());

            string channelId = "";
            string mode = "";
            var users = new List<string>();

            // Parse channel ID
            if (data.TryGetProperty("channel", out var channelElement))
            {
                channelId = channelElement.GetString() ?? "";
            }

            // Parse mode
            if (data.TryGetProperty("mode", out var modeElement))
            {
                mode = modeElement.GetString() ?? "";
            }

            // Parse users array
            if (data.TryGetProperty("users", out var usersElement) && usersElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var userElement in usersElement.EnumerateArray())
                {
                    if (userElement.ValueKind == JsonValueKind.Object)
                    {
                        // Extract identity from user object
                        if (userElement.TryGetProperty("identity", out var identityElement))
                        {
                            var identity = identityElement.GetString();
                            if (!string.IsNullOrEmpty(identity))
                            {
                                users.Add(identity);
                            }
                        }
                    }
                    else if (userElement.ValueKind == JsonValueKind.String)
                    {
                        // Direct string value
                        var user = userElement.GetString();
                        if (!string.IsNullOrEmpty(user))
                        {
                            users.Add(user);
                        }
                    }
                }
            }

            if (string.IsNullOrEmpty(channelId))
            {
                _logger.LogWarning("Received ICH command with missing channel. Data: {Data}", data.ToString());
                return;
            }

            // Parse mode to enum
            ChannelMode channelMode = ChannelMode.Chat; // Default
            if (!string.IsNullOrEmpty(mode))
            {
                channelMode = mode.ToLower() switch
                {
                    "ads" => ChannelMode.Ads,
                    "chat" => ChannelMode.Chat,
                    "both" => ChannelMode.Both,
                    _ => ChannelMode.Chat
                };
            }

            // Update channel details if we have them
            if (_joinedChannelDetails.ContainsKey(channelId))
            {
                _joinedChannelDetails[channelId].Mode = channelMode;
                _joinedChannelDetails[channelId].UserCount = users.Count;
            }

            // Initialize channel character list with all users
            _channelCharacters[channelId] = new List<ChannelCharacter>();
            var now = DateTime.UtcNow;
            
            foreach (var user in users)
            {
                // Try to get character details from online characters cache
                string gender = string.Empty;
                string? statusMessage = null;
                if (_onlineCharactersCache.TryGetValue(user, out var onlineCharacter))
                {
                    gender = onlineCharacter.Gender;
                    statusMessage = onlineCharacter.StatusMessage;
                }
                // Also check friend genders cache as fallback
                else if (_friendGenders.TryGetValue(user, out var cachedGender))
                {
                    gender = cachedGender;
                }
                
                var character = new ChannelCharacter
                {
                    CharacterName = user,
                    ChannelId = channelId,
                    JoinedAt = now,
                    LastSeenAt = now,
                    Status = CharacterStatus.Online,
                    Gender = gender,
                    StatusMessage = statusMessage
                };
                _channelCharacters[channelId].Add(character);
            }

            _logger.LogInformation("Initial channel data for {ChannelId}: {UserCount} users, mode: {Mode}", 
                channelId, users.Count, mode);

            // Fire event for initial channel data
            InitialChannelDataReceived?.Invoke(channelId, users, channelMode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling initial channel data. Data: {Data}", data.ToString());
        }
    }

    public bool IsConnected => _webSocket?.State == WebSocketState.Open;

    /// <summary>
    /// Handles the FRL (friends list) response from F-Chat server
    /// </summary>
    private void HandleFriendsListResponse(JsonElement data)
    {
        try
        {
            _logger.LogDebug("Handling friends list response with data: {Data}", data.ToString());

            // FRL response contains a "characters" array with ALL friends (both online and offline)
            if (data.TryGetProperty("characters", out var charactersElement) && charactersElement.ValueKind == JsonValueKind.Array)
            {
                var allFriends = new List<Friend>();
                
                foreach (var characterElement in charactersElement.EnumerateArray())
                {
                    var friendName = characterElement.GetString();
                    if (!string.IsNullOrEmpty(friendName))
                    {
                        var friend = new Friend
                        {
                            Name = friendName,
                            Status = "offline", // Default to offline, will be updated by real-time events
                            IsOnline = false,
                            LastSeen = DateTime.UtcNow,
                            Gender = _friendGenders.TryGetValue(friendName, out var gender) ? gender : null
                        };
                        
                        allFriends.Add(friend);
                    }
                }
                
                _logger.LogInformation("Parsed {FriendCount} total friends from FRL response", allFriends.Count);
                
                // Update the friends cache with the fresh data from FRL
                UpdateFriendsListWithStatus(allFriends);
                _logger.LogInformation("Updated friends cache with {FriendCount} friends from FRL", allFriends.Count);
                
                // Fire event with complete friends list
                _logger.LogInformation("About to invoke FriendsListReceived event. Event has {SubscriberCount} subscribers", 
                    FriendsListReceived?.GetInvocationList().Length ?? 0);
                FriendsListReceived?.Invoke(allFriends);
                _logger.LogInformation("FriendsListReceived event invoked");
            }
            else if (data.TryGetProperty("count", out var countElement))
            {
                // FRL response with count - this is how many friends are currently online
                var onlineCount = countElement.GetInt32();
                _logger.LogInformation("FRL response received with {OnlineCount} friends currently online", onlineCount);
            }
            else if (data.TryGetProperty("character", out var characterElement))
            {
                // FRL response with character name - this might be a single character response
                var characterName = characterElement.GetString();
                _logger.LogInformation("FRL response received for character: {CharacterName}", characterName);
            }
            else
            {
                _logger.LogWarning("FRL response format not recognized: {Data}", data.ToString());
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling friends list response");
        }
    }

    private void HandleOnlineCharactersList(JsonElement data)
    {
        try
        {
            // LIS response contains a "characters" array with online characters
            // Each character is an array: [name, gender, status, statusMessage]
            if (data.TryGetProperty("characters", out var charactersElement) && charactersElement.ValueKind == JsonValueKind.Array)
            {
                var onlineCharacters = new List<FChatCharacter>();
                var newOnlineCharacters = new List<FChatCharacter>();
                var statusChangedCharacters = new List<FChatCharacter>();
                
                foreach (var characterElement in charactersElement.EnumerateArray())
                {
                    if (characterElement.ValueKind == JsonValueKind.Array && characterElement.GetArrayLength() >= 3)
                    {
                        var characterArray = characterElement.EnumerateArray().ToArray();
                        
                        var character = new FChatCharacter
                        {
                            Name = characterArray[0].GetString() ?? string.Empty,
                            Gender = characterArray[1].GetString() ?? string.Empty,
                            Status = characterArray[2].GetString() ?? "online",
                            StatusMessage = characterArray.Length > 3 ? characterArray[3].GetString() : null,
                            LastSeen = DateTime.UtcNow
                        };
                        
                        if (!string.IsNullOrEmpty(character.Name))
                        {
                            onlineCharacters.Add(character);
                            
                            // Check if this character is new or has status changes
                            if (!_onlineCharactersCache.TryGetValue(character.Name, out var cachedCharacter))
                            {
                                // New character came online
                                newOnlineCharacters.Add(character);
                                _onlineCharactersCache[character.Name] = character;
                                
                                // Update friend gender cache
                                _friendGenders[character.Name] = character.Gender;
                                
                                // Fire individual character online event
                                UserOnline?.Invoke(character.Name, character.Status, character.Gender);
                            }
                            else
                            {
                                // Check if status changed
                                if (cachedCharacter.Status != character.Status || 
                                    cachedCharacter.StatusMessage != character.StatusMessage)
                                {
                                    statusChangedCharacters.Add(character);
                                    _onlineCharactersCache[character.Name] = character;
                                }
                                else
                                {
                                    // Update last seen time
                                    _onlineCharactersCache[character.Name] = character;
                                }
                            }
                            
                            // Fire status updated event for all characters
                            StatusUpdated?.Invoke(character.Name, character.Status, character.StatusMessage ?? string.Empty);
                        }
                    }
                }
                
                // Update the received character count with the actual number of characters parsed
                _receivedCharacterCount += onlineCharacters.Count;
                
                // Only log summary periodically or when significant events occur
                if (_receivedCharacterCount % 1000 == 0 || _receivedCharacterCount >= _onlineCharacterCount)
                {
                    _logger.LogInformation("LIS progress: {ReceivedCount}/{TotalCount} characters received", 
                        _receivedCharacterCount, _onlineCharacterCount);
                }
                
                // Update channel characters with gender information from LIS data
                UpdateChannelCharactersWithLISData(onlineCharacters);
                
                // Update friends list with online status from LIS
                UpdateFriendsListWithOnlineStatus(onlineCharacters);
                
                // Fire event with complete online characters list
                OnlineCharactersListReceived?.Invoke(onlineCharacters);
            }
            else
            {
                _logger.LogWarning("LIS response format not recognized");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling online characters list response");
        }
    }

    /// <summary>
    /// Updates channel characters with gender and status information from LIS data
    /// </summary>
    /// <param name="onlineCharacters">List of online characters with complete information</param>
    private void UpdateChannelCharactersWithLISData(List<FChatCharacter> onlineCharacters)
    {
        try
        {
            _logger.LogDebug("Updating channel characters with LIS data for {CharacterCount} characters", onlineCharacters.Count);
            
            foreach (var onlineCharacter in onlineCharacters)
            {
                // Update all channel character lists that contain this character
                foreach (var channelEntry in _channelCharacters)
                {
                    var channelId = channelEntry.Key;
                    var channelCharacterList = channelEntry.Value;
                    
                    // Find the character in this channel
                    var channelCharacter = channelCharacterList.FirstOrDefault(cc => cc.CharacterName == onlineCharacter.Name);
                    if (channelCharacter != null)
                    {
                        // Update gender if it was missing or different
                        if (string.IsNullOrEmpty(channelCharacter.Gender) || channelCharacter.Gender != onlineCharacter.Gender)
                        {
                            channelCharacter.Gender = onlineCharacter.Gender;
                            _logger.LogDebug("Updated gender for {CharacterName} in channel {ChannelId}: {Gender}", 
                                onlineCharacter.Name, channelId, onlineCharacter.Gender);
                        }
                        
                        // Update status if it was different
                        var newStatus = onlineCharacter.Status.ToLower() switch
                        {
                            "online" => CharacterStatus.Online,
                            "away" => CharacterStatus.Away,
                            "busy" => CharacterStatus.Busy,
                            "looking" => CharacterStatus.Looking,
                            "dnd" => CharacterStatus.DoNotDisturb,
                            _ => CharacterStatus.Online
                        };
                        
                        if (channelCharacter.Status != newStatus)
                        {
                            channelCharacter.Status = newStatus;
                            _logger.LogDebug("Updated status for {CharacterName} in channel {ChannelId}: {Status}", 
                                onlineCharacter.Name, channelId, newStatus);
                        }
                        
                        // Update status message if it was different
                        if (channelCharacter.StatusMessage != onlineCharacter.StatusMessage)
                        {
                            channelCharacter.StatusMessage = onlineCharacter.StatusMessage;
                            _logger.LogDebug("Updated status message for {CharacterName} in channel {ChannelId}", 
                                onlineCharacter.Name, channelId);
                        }
                        
                        // Update last seen time
                        channelCharacter.LastSeenAt = onlineCharacter.LastSeen;
                    }
                }
            }
            
            _logger.LogDebug("Completed updating channel characters with LIS data");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating channel characters with LIS data");
        }
    }

    /// <summary>
    /// Attempts to extract a character name from an F-Chat error message
    /// </summary>
    /// <param name="errorMessage">The error message from F-Chat</param>
    /// <returns>The character name if found, null otherwise</returns>
    private string? ExtractCharacterNameFromError(string errorMessage)
    {
        try
        {
            // Common patterns in F-Chat error messages that might contain character names
            // This is a best-effort attempt to extract character names from error messages
            
            // Pattern 1: "The character 'CharacterName' was not found"
            var match = System.Text.RegularExpressions.Regex.Match(errorMessage, @"character\s+['""]([^'""]+)['""]", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (match.Success)
            {
                return match.Groups[1].Value;
            }
            
            // Pattern 2: "CharacterName is not online" or similar
            match = System.Text.RegularExpressions.Regex.Match(errorMessage, @"^([A-Za-z0-9_\s]+)\s+(?:is\s+not\s+online|not\s+found|doesn't\s+exist)", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (match.Success)
            {
                return match.Groups[1].Value.Trim();
            }
            
            // Pattern 3: Look for the last requested character if we have it
            if (!string.IsNullOrEmpty(_lastRequestedCharacter))
            {
                return _lastRequestedCharacter;
            }
            
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error extracting character name from error message: {ErrorMessage}", errorMessage);
            return null;
        }
    }
}

public class FChatMessage
{
    public string Character { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Channel { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public string MessageType { get; set; } = "Chat";
    public string? Id { get; set; }
}