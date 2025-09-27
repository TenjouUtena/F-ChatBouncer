using System.Text.Json;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Manages F-List API tickets with automatic renewal on expiration
/// </summary>
public class FListTicketManager : IFListTicketManager
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<FListTicketManager> _logger;
    private readonly Dictionary<string, FListTicketInfo> _tickets = new();
    private readonly object _lock = new();

    public FListTicketManager(HttpClient httpClient, ILogger<FListTicketManager> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    /// <summary>
    /// Gets a valid ticket for the given account, renewing if necessary
    /// </summary>
    public async Task<string?> GetValidTicketAsync(string account, string password)
    {
        lock (_lock)
        {
            // Check if we have a valid ticket
            if (_tickets.TryGetValue(account, out var ticketInfo) && 
                ticketInfo.ExpiresAt > DateTime.UtcNow.AddMinutes(1)) // Renew 1 minute before expiry
            {
                _logger.LogDebug("Using existing valid ticket for account {Account}", account);
                return ticketInfo.Ticket;
            }

            // Remove expired ticket
            if (_tickets.ContainsKey(account))
            {
                _tickets.Remove(account);
                _logger.LogDebug("Removed expired ticket for account {Account}", account);
            }
        }

        // Request new ticket
        _logger.LogInformation("Requesting new F-List API ticket for account {Account}", account);
        var newTicket = await RequestNewTicketAsync(account, password);
        
        if (newTicket != null)
        {
            lock (_lock)
            {
                _tickets[account] = new FListTicketInfo
                {
                    Ticket = newTicket,
                    ExpiresAt = DateTime.UtcNow.AddMinutes(5), // F-List tickets expire in 5 minutes
                    Account = account
                };
            }
            _logger.LogInformation("Successfully obtained new ticket for account {Account}", account);
        }

        return newTicket;
    }

    /// <summary>
    /// Requests a new ticket from F-List API
    /// </summary>
    private async Task<string?> RequestNewTicketAsync(string account, string password)
    {
        try
        {
            _logger.LogDebug("Requesting authentication ticket from F-List API for account {Account}", account);

            var authData = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("account", account),
                new KeyValuePair<string, string>("password", password)
            });

            var response = await _httpClient.PostAsync("https://www.f-list.net/json/getApiTicket.php", authData);
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

            if (authResponse.TryGetProperty("error", out var errorElement))
            {
                var errorMessage = errorElement.GetString();
                if (!string.IsNullOrEmpty(errorMessage))
                {
                    _logger.LogError("F-List authentication failed for account {Account}: {Error}", account, errorMessage);
                    return null;
                }
            }

            if (authResponse.TryGetProperty("ticket", out var ticketElement))
            {
                var ticket = ticketElement.GetString();
                _logger.LogInformation("Authentication ticket retrieved successfully for account: {Account}", account);
                return ticket;
            }

            _logger.LogError("F-List API response missing 'ticket' property. Response: {Content}", content);
            return null;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Network error while requesting authentication ticket for account: {Account}", account);
            return null;
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogError(ex, "Timeout while requesting authentication ticket for account: {Account}", account);
            return null;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse F-List API response for account: {Account}", account);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while getting authentication ticket for account: {Account}", account);
            return null;
        }
    }

    /// <summary>
    /// Clears the ticket for a specific account
    /// </summary>
    public void ClearTicket(string account)
    {
        lock (_lock)
        {
            if (_tickets.Remove(account))
            {
                _logger.LogDebug("Cleared ticket for account {Account}", account);
            }
        }
    }

    /// <summary>
    /// Cleans up expired tickets
    /// </summary>
    public void CleanupExpiredTickets()
    {
        lock (_lock)
        {
            var expiredKeys = _tickets
                .Where(kvp => kvp.Value.ExpiresAt <= DateTime.UtcNow)
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in expiredKeys)
            {
                _tickets.Remove(key);
            }

            if (expiredKeys.Count > 0)
            {
                _logger.LogDebug("Cleaned up {Count} expired F-List tickets", expiredKeys.Count);
            }
        }
    }
}

/// <summary>
/// Information about a stored F-List ticket
/// </summary>
public class FListTicketInfo
{
    public string Ticket { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string Account { get; set; } = string.Empty;
}

/// <summary>
/// Interface for F-List ticket management
/// </summary>
public interface IFListTicketManager
{
    Task<string?> GetValidTicketAsync(string account, string password);
    void ClearTicket(string account);
    void CleanupExpiredTickets();
}
