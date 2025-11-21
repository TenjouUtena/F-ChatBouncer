using System.Text.Json;
using FChatBouncer.Server.Services;

namespace FChatBouncer.Server.Tests;

/// <summary>
/// Test class to demonstrate STA command parsing
/// </summary>
public class STACommandTest
{
    /// <summary>
    /// Test parsing of STA command with sample data
    /// </summary>
    public static void TestSTAParsing()
    {
        // Sample STA command data based on F-Chat documentation
        var sampleSTAData = """
        {
            "character": "TestCharacter",
            "status": "away",
            "statusmsg": "Out for lunch, back in an hour."
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleSTAData);

        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();

        // Create mock TicketManager for testing
        var ticketManagerLogger = loggerFactory.CreateLogger<TicketManager>();
        var mockConfiguration = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { { "CREDENTIAL_ENCRYPTION_KEY", "test-key-for-unit-tests-only" } })
            .Build();
        var ticketManager = new TicketManager(ticketManagerLogger, mockConfiguration);

        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger, ticketManager);
        
        // Use reflection to access the private HandleStatusUpdate method
        var method = typeof(FChatWebSocketClient).GetMethod("HandleStatusUpdate", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            // Set up event handler to capture the status update
            string? capturedCharacter = null;
            string? capturedStatus = null;
            string? capturedStatusMessage = null;
            
            client.StatusUpdated += (character, status, statusMessage) =>
            {
                capturedCharacter = character;
                capturedStatus = status;
                capturedStatusMessage = statusMessage;
            };
            
            // Invoke the method
            method.Invoke(client, new object[] { jsonElement });
            
            // Check results
            if (capturedCharacter == "TestCharacter" && 
                capturedStatus == "away" && 
                capturedStatusMessage == "Out for lunch, back in an hour.")
            {
                Console.WriteLine($"✅ STA Parsing Test Passed!");
                Console.WriteLine($"   Character: {capturedCharacter}");
                Console.WriteLine($"   Status: {capturedStatus}");
                Console.WriteLine($"   Status Message: {capturedStatusMessage}");
            }
            else
            {
                Console.WriteLine("❌ STA Parsing Test Failed");
                Console.WriteLine($"   Expected: TestCharacter, away, Out for lunch, back in an hour.");
                Console.WriteLine($"   Actual: {capturedCharacter}, {capturedStatus}, {capturedStatusMessage}");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find HandleStatusUpdate method");
        }
    }

    /// <summary>
    /// Test parsing of STA command with minimal data (no status message)
    /// </summary>
    public static void TestSTAParsingMinimal()
    {
        // Sample STA command data with minimal fields
        var sampleSTAData = """
        {
            "character": "TestCharacter",
            "status": "online"
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleSTAData);

        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();

        // Create mock TicketManager for testing
        var ticketManagerLogger = loggerFactory.CreateLogger<TicketManager>();
        var mockConfiguration = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { { "CREDENTIAL_ENCRYPTION_KEY", "test-key-for-unit-tests-only" } })
            .Build();
        var ticketManager = new TicketManager(ticketManagerLogger, mockConfiguration);

        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger, ticketManager);
        
        // Use reflection to access the private HandleStatusUpdate method
        var method = typeof(FChatWebSocketClient).GetMethod("HandleStatusUpdate", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            // Set up event handler to capture the status update
            string? capturedCharacter = null;
            string? capturedStatus = null;
            string? capturedStatusMessage = null;
            
            client.StatusUpdated += (character, status, statusMessage) =>
            {
                capturedCharacter = character;
                capturedStatus = status;
                capturedStatusMessage = statusMessage;
            };
            
            // Invoke the method
            method.Invoke(client, new object[] { jsonElement });
            
            // Check results
            if (capturedCharacter == "TestCharacter" && 
                capturedStatus == "online" && 
                capturedStatusMessage == "")
            {
                Console.WriteLine($"✅ STA Minimal Parsing Test Passed!");
                Console.WriteLine($"   Character: {capturedCharacter}");
                Console.WriteLine($"   Status: {capturedStatus}");
                Console.WriteLine($"   Status Message: '{capturedStatusMessage}'");
            }
            else
            {
                Console.WriteLine("❌ STA Minimal Parsing Test Failed");
                Console.WriteLine($"   Expected: TestCharacter, online, ''");
                Console.WriteLine($"   Actual: {capturedCharacter}, {capturedStatus}, '{capturedStatusMessage}'");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find HandleStatusUpdate method");
        }
    }

    /// <summary>
    /// Run all STA command tests
    /// </summary>
    public static void RunAllTests()
    {
        Console.WriteLine("🧪 Running STA Command Tests...\n");
        
        TestSTAParsing();
        Console.WriteLine();
        
        TestSTAParsingMinimal();
        Console.WriteLine();
        
        Console.WriteLine("🏁 STA Command Tests Complete!");
    }
}
