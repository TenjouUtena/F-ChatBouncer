using System.Text.Json;
using FChatBouncer.Server.Services;
using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Tests;

/// <summary>
/// Test class to demonstrate LIS command parsing
/// </summary>
public class LISCommandTest
{
    /// <summary>
    /// Test parsing of LIS command with sample data
    /// </summary>
    public static void TestLISParsing()
    {
        // Sample LIS command data based on the user's example
        var sampleLISData = """
        {
            "characters": [
                ["lil victim angie", "Female", "looking", ""],
                ["The_Valentino", "Male", "online", "[session=Hazbin Helluva: Hell's Ruin ]adh-4e7232ea9e8bf1ac82d3[/session]"],
                ["Kayra", "Male", "away", ""],
                ["Ghostly Accident", "Cunt-boy", "online", ""],
                ["Dalurka", "None", "online", ""]
            ]
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleLISData);
        
        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();
        
        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger);
        
        // Use reflection to access the private HandleOnlineCharactersList method
        var method = typeof(FChatWebSocketClient).GetMethod("HandleOnlineCharactersList", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            // Set up event handler to capture the online characters list
            List<FChatCharacter>? capturedCharacters = null;
            
            client.OnlineCharactersListReceived += (characters) =>
            {
                capturedCharacters = characters;
            };
            
            // Invoke the method
            method.Invoke(client, new object[] { jsonElement });
            
            // Check results
            if (capturedCharacters != null && capturedCharacters.Count == 5)
            {
                var firstChar = capturedCharacters.FirstOrDefault(c => c.Name == "lil victim angie");
                var secondChar = capturedCharacters.FirstOrDefault(c => c.Name == "The_Valentino");
                
                if (firstChar != null && firstChar.Gender == "Female" && firstChar.Status == "looking" &&
                    secondChar != null && secondChar.Gender == "Male" && secondChar.Status == "online" &&
                    !string.IsNullOrEmpty(secondChar.StatusMessage))
                {
                    Console.WriteLine($"✅ LIS Parsing Test Passed!");
                    Console.WriteLine($"   Total Characters: {capturedCharacters.Count}");
                    Console.WriteLine($"   First Character: {firstChar.Name} ({firstChar.Gender}, {firstChar.Status})");
                    Console.WriteLine($"   Second Character: {secondChar.Name} ({secondChar.Gender}, {secondChar.Status})");
                    Console.WriteLine($"   Status Message Length: {secondChar.StatusMessage?.Length ?? 0}");
                }
                else
                {
                    Console.WriteLine("❌ LIS Parsing Test Failed - Character data incorrect");
                }
            }
            else
            {
                Console.WriteLine("❌ LIS Parsing Test Failed - No characters captured or wrong count");
                Console.WriteLine($"   Expected: 5 characters, Actual: {capturedCharacters?.Count ?? 0}");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find HandleOnlineCharactersList method");
        }
    }

    /// <summary>
    /// Test parsing of LIS command with minimal data
    /// </summary>
    public static void TestLISParsingMinimal()
    {
        // Sample LIS command data with minimal fields
        var sampleLISData = """
        {
            "characters": [
                ["TestCharacter", "Male", "online", ""]
            ]
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleLISData);
        
        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();
        
        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger);
        
        // Use reflection to access the private HandleOnlineCharactersList method
        var method = typeof(FChatWebSocketClient).GetMethod("HandleOnlineCharactersList", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            // Set up event handler to capture the online characters list
            List<FChatCharacter>? capturedCharacters = null;
            
            client.OnlineCharactersListReceived += (characters) =>
            {
                capturedCharacters = characters;
            };
            
            // Invoke the method
            method.Invoke(client, new object[] { jsonElement });
            
            // Check results
            if (capturedCharacters != null && capturedCharacters.Count == 1)
            {
                var character = capturedCharacters[0];
                if (character.Name == "TestCharacter" && 
                    character.Gender == "Male" && 
                    character.Status == "online" &&
                    string.IsNullOrEmpty(character.StatusMessage))
                {
                    Console.WriteLine($"✅ LIS Minimal Parsing Test Passed!");
                    Console.WriteLine($"   Character: {character.Name} ({character.Gender}, {character.Status})");
                    Console.WriteLine($"   Status Message: '{character.StatusMessage}'");
                }
                else
                {
                    Console.WriteLine("❌ LIS Minimal Parsing Test Failed - Character data incorrect");
                }
            }
            else
            {
                Console.WriteLine("❌ LIS Minimal Parsing Test Failed - No characters captured or wrong count");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find HandleOnlineCharactersList method");
        }
    }

    /// <summary>
    /// Test parsing of LIS command with empty characters array
    /// </summary>
    public static void TestLISParsingEmpty()
    {
        // Sample LIS command data with empty characters array
        var sampleLISData = """
        {
            "characters": []
        }
        """;

        var jsonElement = JsonSerializer.Deserialize<JsonElement>(sampleLISData);
        
        // Create a mock logger for testing
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<FChatWebSocketClient>();
        
        // Create WebSocket client instance for testing
        var client = new FChatWebSocketClient(logger);
        
        // Use reflection to access the private HandleOnlineCharactersList method
        var method = typeof(FChatWebSocketClient).GetMethod("HandleOnlineCharactersList", 
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        
        if (method != null)
        {
            // Set up event handler to capture the online characters list
            List<FChatCharacter>? capturedCharacters = null;
            
            client.OnlineCharactersListReceived += (characters) =>
            {
                capturedCharacters = characters;
            };
            
            // Invoke the method
            method.Invoke(client, new object[] { jsonElement });
            
            // Check results
            if (capturedCharacters != null && capturedCharacters.Count == 0)
            {
                Console.WriteLine($"✅ LIS Empty Parsing Test Passed!");
                Console.WriteLine($"   Characters Count: {capturedCharacters.Count}");
            }
            else
            {
                Console.WriteLine("❌ LIS Empty Parsing Test Failed");
                Console.WriteLine($"   Expected: 0 characters, Actual: {capturedCharacters?.Count ?? -1}");
            }
        }
        else
        {
            Console.WriteLine("❌ Could not find HandleOnlineCharactersList method");
        }
    }

    /// <summary>
    /// Run all LIS command tests
    /// </summary>
    public static void RunAllTests()
    {
        Console.WriteLine("🧪 Running LIS Command Tests...\n");
        
        TestLISParsing();
        Console.WriteLine();
        
        TestLISParsingMinimal();
        Console.WriteLine();
        
        TestLISParsingEmpty();
        Console.WriteLine();
        
        Console.WriteLine("🏁 LIS Command Tests Complete!");
    }
}
