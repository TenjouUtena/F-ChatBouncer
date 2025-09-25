using System.Text.Json;
using FChatBouncer.Server.Services;
using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Tests;

/// <summary>
/// Test class to demonstrate ICH command parsing
/// </summary>
public class ICHCommandTest
{
    /// <summary>
    /// Test parsing of ICH command with sample data from F-Chat documentation
    /// </summary>
    public static void TestICHParsing()
    {
        // Sample ICH command data based on F-Chat documentation
        var sampleICHData = """
        {
            "users": [
                {"identity": "Shadlor"}, 
                {"identity": "Bunnie Patcher"}, 
                {"identity": "DemonNeko"}, 
                {"identity": "Desbreko"}, 
                {"identity": "Robert Bell"}, 
                {"identity": "Jayson"}, 
                {"identity": "Valoriel Talonheart"}, 
                {"identity": "Jordan Costa"}, 
                {"identity": "Skip Weber"}, 
                {"identity": "Niruka"}, 
                {"identity": "Jake Brian Purplecat"}, 
                {"identity": "Hexxy"}
            ], 
            "channel": "Frontpage", 
            "mode": "chat"
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleICHData);
        
        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();
        
        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger);
        
        // Use reflection to access the private HandleInitialChannelData method
        var method = typeof(FChatWebSocketClient).GetMethod("HandleInitialChannelData", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            // Set up event handler to capture the initial channel data
            string? capturedChannel = null;
            List<string>? capturedUsers = null;
            ChannelMode capturedMode = ChannelMode.Chat;
            
            client.InitialChannelDataReceived += (channel, users, mode) =>
            {
                capturedChannel = channel;
                capturedUsers = users;
                capturedMode = mode;
            };
            
            // Invoke the method
            method.Invoke(client, new object[] { jsonElement });
            
            // Check results
            var expectedUsers = new List<string> 
            { 
                "Shadlor", "Bunnie Patcher", "DemonNeko", "Desbreko", "Robert Bell", 
                "Jayson", "Valoriel Talonheart", "Jordan Costa", "Skip Weber", 
                "Niruka", "Jake Brian Purplecat", "Hexxy" 
            };
            
            if (capturedChannel == "Frontpage" && 
                capturedUsers != null && 
                capturedUsers.Count == 12 &&
                capturedMode == ChannelMode.Chat &&
                capturedUsers.SequenceEqual(expectedUsers))
            {
                Console.WriteLine($"✅ ICH Parsing Test Passed!");
                Console.WriteLine($"   Channel: {capturedChannel}");
                Console.WriteLine($"   Mode: {capturedMode}");
                Console.WriteLine($"   User Count: {capturedUsers.Count}");
                Console.WriteLine($"   Users: {string.Join(", ", capturedUsers.Take(3))}... (and {capturedUsers.Count - 3} more)");
            }
            else
            {
                Console.WriteLine("❌ ICH Parsing Test Failed");
                Console.WriteLine($"   Expected: Frontpage, 12 users, Chat mode");
                Console.WriteLine($"   Actual: {capturedChannel}, {capturedUsers?.Count ?? 0} users, {capturedMode} mode");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find HandleInitialChannelData method");
        }
    }

    /// <summary>
    /// Test parsing of ICH command with "both" mode
    /// </summary>
    public static void TestICHParsingBothMode()
    {
        // Sample ICH command data with "both" mode
        var sampleICHData = """
        {
            "users": [
                {"identity": "TestUser1"}, 
                {"identity": "TestUser2"}
            ], 
            "channel": "TestChannel", 
            "mode": "both"
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleICHData);
        
        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();
        
        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger);
        
        // Use reflection to access the private HandleInitialChannelData method
        var method = typeof(FChatWebSocketClient).GetMethod("HandleInitialChannelData", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            // Set up event handler to capture the initial channel data
            string? capturedChannel = null;
            List<string>? capturedUsers = null;
            ChannelMode capturedMode = ChannelMode.Chat;
            
            client.InitialChannelDataReceived += (channel, users, mode) =>
            {
                capturedChannel = channel;
                capturedUsers = users;
                capturedMode = mode;
            };
            
            // Invoke the method
            method.Invoke(client, new object[] { jsonElement });
            
            // Check results
            if (capturedChannel == "TestChannel" && 
                capturedUsers != null && 
                capturedUsers.Count == 2 &&
                capturedMode == ChannelMode.Both)
            {
                Console.WriteLine($"✅ ICH Both Mode Test Passed!");
                Console.WriteLine($"   Channel: {capturedChannel}");
                Console.WriteLine($"   Mode: {capturedMode}");
                Console.WriteLine($"   User Count: {capturedUsers.Count}");
            }
            else
            {
                Console.WriteLine("❌ ICH Both Mode Test Failed");
                Console.WriteLine($"   Expected: TestChannel, 2 users, Both mode");
                Console.WriteLine($"   Actual: {capturedChannel}, {capturedUsers?.Count ?? 0} users, {capturedMode} mode");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find HandleInitialChannelData method");
        }
    }

    /// <summary>
    /// Test parsing of ICH command with "ads" mode
    /// </summary>
    public static void TestICHParsingAdsMode()
    {
        // Sample ICH command data with "ads" mode
        var sampleICHData = """
        {
            "users": [
                {"identity": "AdUser1"}
            ], 
            "channel": "AdsChannel", 
            "mode": "ads"
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleICHData);
        
        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();
        
        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger);
        
        // Use reflection to access the private HandleInitialChannelData method
        var method = typeof(FChatWebSocketClient).GetMethod("HandleInitialChannelData", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            // Set up event handler to capture the initial channel data
            string? capturedChannel = null;
            List<string>? capturedUsers = null;
            ChannelMode capturedMode = ChannelMode.Chat;
            
            client.InitialChannelDataReceived += (channel, users, mode) =>
            {
                capturedChannel = channel;
                capturedUsers = users;
                capturedMode = mode;
            };
            
            // Invoke the method
            method.Invoke(client, new object[] { jsonElement });
            
            // Check results
            if (capturedChannel == "AdsChannel" && 
                capturedUsers != null && 
                capturedUsers.Count == 1 &&
                capturedMode == ChannelMode.Ads)
            {
                Console.WriteLine($"✅ ICH Ads Mode Test Passed!");
                Console.WriteLine($"   Channel: {capturedChannel}");
                Console.WriteLine($"   Mode: {capturedMode}");
                Console.WriteLine($"   User Count: {capturedUsers.Count}");
            }
            else
            {
                Console.WriteLine("❌ ICH Ads Mode Test Failed");
                Console.WriteLine($"   Expected: AdsChannel, 1 user, Ads mode");
                Console.WriteLine($"   Actual: {capturedChannel}, {capturedUsers?.Count ?? 0} users, {capturedMode} mode");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find HandleInitialChannelData method");
        }
    }

    /// <summary>
    /// Run all ICH command tests
    /// </summary>
    public static void RunAllTests()
    {
        Console.WriteLine("🧪 Running ICH Command Tests...\n");
        
        TestICHParsing();
        Console.WriteLine();
        
        TestICHParsingBothMode();
        Console.WriteLine();
        
        TestICHParsingAdsMode();
        Console.WriteLine();
        
        Console.WriteLine("🏁 ICH Command Tests Complete!");
    }
}
