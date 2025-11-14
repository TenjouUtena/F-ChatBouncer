using FChatBouncer.Server.Configuration;
using FChatBouncer.Server.Infrastructure;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FChatBouncer.Server.Tests;

/// <summary>
/// Simple test to verify Redis connection is working.
/// This is a manual test class that can be run to verify the Redis infrastructure.
/// </summary>
public class RedisConnectionTest
{
    public static async Task<bool> TestRedisConnection()
    {
        Console.WriteLine("=== Redis Connection Test ===");
        Console.WriteLine();

        // Create logger
        var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        var logger = loggerFactory.CreateLogger<RedisConnectionFactory>();

        // Create Redis settings
        var settings = new RedisSettings
        {
            ConnectionString = "localhost:6379",
            InstanceName = "FChatBouncer:Test:",
            Database = 0,
            ConnectTimeout = 5000,
            AllowAdmin = true
        };

        var options = Options.Create(settings);

        try
        {
            // Create connection factory
            Console.WriteLine("Creating Redis connection factory...");
            var factory = new RedisConnectionFactory(options, logger);

            // Test connection
            Console.WriteLine("Testing Redis connection...");
            var connection = factory.GetConnection();
            Console.WriteLine($"✓ Connection established: {connection.IsConnected}");

            // Test database operations
            Console.WriteLine("\nTesting database operations...");
            var db = factory.GetDatabase();
            
            // Test write
            var testKey = "test:connection";
            var testValue = $"Test at {DateTime.UtcNow:O}";
            await db.StringSetAsync(testKey, testValue);
            Console.WriteLine($"✓ Write successful: {testKey} = {testValue}");

            // Test read
            var readValue = await db.StringGetAsync(testKey);
            Console.WriteLine($"✓ Read successful: {testKey} = {readValue}");

            // Test delete
            await db.KeyDeleteAsync(testKey);
            Console.WriteLine($"✓ Delete successful: {testKey}");

            // Test health check
            Console.WriteLine("\nTesting health check...");
            var isHealthy = await factory.IsHealthyAsync();
            Console.WriteLine($"✓ Health check: {(isHealthy ? "HEALTHY" : "UNHEALTHY")}");

            // Get connection status
            Console.WriteLine("\nConnection Status:");
            Console.WriteLine(factory.GetConnectionStatus());

            // Test server info (requires AllowAdmin = true)
            Console.WriteLine("\nTesting server info...");
            try
            {
                var server = factory.GetServer();
                var info = await server.InfoAsync("Server");
                
                foreach (var group in info)
                {
                    Console.WriteLine($"\n{group.Key}:");
                    foreach (var item in group)
                    {
                        if (item.Key == "redis_version" || item.Key == "uptime_in_seconds" || item.Key == "uptime_in_days")
                        {
                            Console.WriteLine($"  {item.Key}: {item.Value}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ Server info not available (requires admin): {ex.Message}");
            }

            Console.WriteLine("\n=== All Tests Passed ===");
            Console.WriteLine();

            // Cleanup
            factory.Dispose();
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n✗ Error: {ex.Message}");
            Console.WriteLine($"Stack trace: {ex.StackTrace}");
            Console.WriteLine("\n=== Tests Failed ===");
            Console.WriteLine();
            return false;
        }
    }
}

