using System.Text.Json;
using FChatBouncer.Server.Services;

namespace FChatBouncer.Server.Tests;

/// <summary>
/// Test class to demonstrate RLL command parsing
/// </summary>
public class RLLCommandTest
{
    /// <summary>
    /// Test parsing of RLL command with sample data
    /// </summary>
    public static void TestRLLParsing()
    {
        // Sample RLL command data based on F-Chat documentation
        var sampleRLLData = """
        {
            "character": "TestCharacter",
            "message": "rolled 2d6+3: [4, 2] + 3 = 9",
            "channel": "TestChannel"
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleRLLData);
        
        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();
        
        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger);
        
        // Use reflection to access the private ParseRollMessage method
        var method = typeof(FChatWebSocketClient).GetMethod("ParseRollMessage", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            var result = method.Invoke(client, new object[] { jsonElement }) as FChatMessage;
            
            if (result != null)
            {
                Console.WriteLine($"✅ RLL Parsing Test Passed!");
                Console.WriteLine($"   Character: {result.Character}");
                Console.WriteLine($"   Message: {result.Message}");
                Console.WriteLine($"   Channel: {result.Channel}");
                Console.WriteLine($"   MessageType: {result.MessageType}");
                Console.WriteLine($"   Timestamp: {result.Timestamp}");
            }
            else
            {
                Console.WriteLine("❌ RLL Parsing Test Failed - Result was null");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find ParseRollMessage method");
        }
    }
}
