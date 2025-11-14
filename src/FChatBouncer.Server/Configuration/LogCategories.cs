namespace FChatBouncer.Server.Configuration;

/// <summary>
/// Defines logging category constants for granular log control throughout the application.
/// These categories can be configured independently in appsettings.json to control log levels per component.
/// </summary>
public static class LogCategories
{
    /// <summary>
    /// General application logging category.
    /// </summary>
    public const string Application = "FChatBouncer.Server";

    /// <summary>
    /// Authentication and authorization related logs (login, token generation, OAuth, etc.)
    /// </summary>
    public const string Authentication = "FChatBouncer.Server.Auth";

    /// <summary>
    /// F-Chat WebSocket connection and protocol handling.
    /// </summary>
    public const string FChatWebSocket = "FChatBouncer.Server.FChatWebSocket";

    /// <summary>
    /// Message processing, sending, receiving, and queuing.
    /// </summary>
    public const string Messaging = "FChatBouncer.Server.Messaging";

    /// <summary>
    /// SignalR hub operations and client communications.
    /// </summary>
    public const string SignalR = "FChatBouncer.Server.SignalR";

    /// <summary>
    /// Database operations and queries (use with caution in production).
    /// </summary>
    public const string Database = "FChatBouncer.Server.Database";

    /// <summary>
    /// Redis operations, caching, and state management.
    /// </summary>
    public const string Redis = "FChatBouncer.Server.Redis";

    /// <summary>
    /// Character management and multi-character operations.
    /// </summary>
    public const string Characters = "FChatBouncer.Server.Characters";

    /// <summary>
    /// Profile fetching, caching, and queue processing.
    /// </summary>
    public const string Profiles = "FChatBouncer.Server.Profiles";

    /// <summary>
    /// F-List API integration (ticket management, mapping, character data).
    /// </summary>
    public const string FListAPI = "FChatBouncer.Server.FListAPI";

    /// <summary>
    /// Infrastructure components (Redis connection factory, health checks, etc.)
    /// </summary>
    public const string Infrastructure = "FChatBouncer.Server.Infrastructure";

    /// <summary>
    /// HTTP request/response logging (including controllers).
    /// </summary>
    public const string Http = "FChatBouncer.Server.Http";

    /// <summary>
    /// Background services and hosted services.
    /// </summary>
    public const string BackgroundServices = "FChatBouncer.Server.BackgroundServices";

    /// <summary>
    /// Security-related operations (encryption, credential management, rate limiting).
    /// </summary>
    public const string Security = "FChatBouncer.Server.Security";

    /// <summary>
    /// Performance-related logging (timings, metrics, bottlenecks).
    /// </summary>
    public const string Performance = "FChatBouncer.Server.Performance";

    // Microsoft Framework Categories
    
    /// <summary>
    /// ASP.NET Core framework logging.
    /// </summary>
    public const string AspNetCore = "Microsoft.AspNetCore";

    /// <summary>
    /// SignalR framework logging.
    /// </summary>
    public const string AspNetCoreSignalR = "Microsoft.AspNetCore.SignalR";

    /// <summary>
    /// Entity Framework Core logging.
    /// </summary>
    public const string EntityFrameworkCore = "Microsoft.EntityFrameworkCore";

    /// <summary>
    /// Entity Framework Core database command logging (SQL queries).
    /// Usually disabled in production for performance.
    /// </summary>
    public const string EntityFrameworkCoreCommands = "Microsoft.EntityFrameworkCore.Database.Command";

    /// <summary>
    /// ASP.NET Core hosting logging.
    /// </summary>
    public const string Hosting = "Microsoft.Hosting";
}

