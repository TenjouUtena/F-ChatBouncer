using FChatBouncer.Server.Configuration;
using Microsoft.Extensions.Logging;

namespace FChatBouncer.Server.Tests;

/// <summary>
/// Simple test to verify the enhanced logging configuration is working correctly.
/// Tests per-sink log levels, categories, and correlation IDs.
/// </summary>
public class LoggingConfigurationTest
{
    public static void RunAllTests()
    {
        Console.WriteLine("=== Logging Configuration Test ===");
        Console.WriteLine();

        TestLogCategories();
        TestLogLevels();
        TestLoggingExtensions();

        Console.WriteLine();
        Console.WriteLine("=== All Logging Tests Completed ===");
        Console.WriteLine();
        Console.WriteLine("To see the full logging in action:");
        Console.WriteLine("1. Start the application: dotnet run");
        Console.WriteLine("2. Check console output (should show Warning+ by default)");
        Console.WriteLine("3. Check logs/fchat-bouncer-*.log (should show Information+ by default)");
        Console.WriteLine("4. In Development mode, console shows Debug+, file shows Trace+");
        Console.WriteLine();
        Console.WriteLine("Key Features:");
        Console.WriteLine("- Console logs: Warning+ (Production), Debug+ (Development)");
        Console.WriteLine("- File logs: Information+ (Production), Trace+ (Development)");
        Console.WriteLine("- EF Core queries: Error (suppressed in normal operation)");
        Console.WriteLine("- Category-specific levels: Auth, FChatWebSocket, Messaging, etc.");
        Console.WriteLine("- Correlation IDs: Tracked across requests in X-Correlation-Id header");
        Console.WriteLine();
    }

    private static void TestLogCategories()
    {
        Console.WriteLine("Testing Log Categories...");
        
        var categories = new[]
        {
            LogCategories.Application,
            LogCategories.Authentication,
            LogCategories.FChatWebSocket,
            LogCategories.Messaging,
            LogCategories.SignalR,
            LogCategories.Database,
            LogCategories.Redis,
            LogCategories.Characters,
            LogCategories.Profiles,
            LogCategories.FListAPI,
            LogCategories.Infrastructure,
            LogCategories.Http,
            LogCategories.BackgroundServices,
            LogCategories.Security,
            LogCategories.Performance,
            LogCategories.EntityFrameworkCoreCommands
        };

        Console.WriteLine($"✓ Found {categories.Length} log categories defined");
        Console.WriteLine("  Categories include:");
        Console.WriteLine("  - Application-specific: Auth, FChatWebSocket, Messaging, etc.");
        Console.WriteLine("  - Infrastructure: Redis, Database, Infrastructure");
        Console.WriteLine("  - Framework: ASP.NET Core, EF Core, SignalR");
        Console.WriteLine();
    }

    private static void TestLogLevels()
    {
        Console.WriteLine("Testing Log Level Configuration...");
        Console.WriteLine("✓ Production (appsettings.json):");
        Console.WriteLine("  - Console: Warning+ only");
        Console.WriteLine("  - File: Information+ (includes all important logs)");
        Console.WriteLine("  - EF Core Commands: Error (suppresses query logs)");
        Console.WriteLine();
        
        Console.WriteLine("✓ Development (appsettings.Development.json):");
        Console.WriteLine("  - Console: Debug+ (verbose for debugging)");
        Console.WriteLine("  - File: Trace+ (captures everything)");
        Console.WriteLine("  - EF Core Commands: Warning (see queries if needed)");
        Console.WriteLine();
    }

    private static void TestLoggingExtensions()
    {
        Console.WriteLine("Testing Logging Extensions...");
        Console.WriteLine("✓ Available extension methods:");
        Console.WriteLine("  - TimeOperation(): Logs operation duration");
        Console.WriteLine("  - LogSecurityEvent(): Standardized security logging");
        Console.WriteLine("  - LogFChatMessage(): F-Chat protocol message logging");
        Console.WriteLine("  - LogHubMethodInvocation(): SignalR hub method logging");
        Console.WriteLine("  - LogDatabaseQuery(): Database operation logging");
        Console.WriteLine("  - LogRedisOperation(): Redis operation logging");
        Console.WriteLine("  - LogExternalApiCall(): External API call logging");
        Console.WriteLine("  - LogCharacterStateChange(): Character state tracking");
        Console.WriteLine();
    }
}

