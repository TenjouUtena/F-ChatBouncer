using System.Globalization;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace FChatBouncer.Server.Configuration;

/// <summary>
/// Provides helper methods to merge Redis configuration from appsettings with environment variables.
/// This enables production deployments (e.g., Railway) to supply Redis credentials without touching configuration files.
/// </summary>
public static class RedisEnvironmentConfiguration
{
    /// <summary>
    /// Creates a <see cref="RedisSettings"/> instance from configuration and applies environment overrides.
    /// </summary>
    public static RedisSettings CreateFromConfiguration(IConfiguration configuration)
    {
        var settings = configuration.GetSection("Redis").Get<RedisSettings>() ?? new RedisSettings();
        ApplyEnvironmentOverrides(settings);
        return settings;
    }

    /// <summary>
    /// Applies Redis-related environment variables on top of the provided settings.
    /// </summary>
    public static void ApplyEnvironmentOverrides(RedisSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        // Railway sets REDIS_URL (redis:// or rediss://)
        var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL")
            ?? Environment.GetEnvironmentVariable("UPSTASH_REDIS_URL");
        if (TryFormatRedisUrl(redisUrl, out var urlConnectionString, out var urlSsl))
        {
            settings.ConnectionString = urlConnectionString;
            if (urlSsl.HasValue)
            {
                settings.UseSsl = urlSsl.Value;
            }
        }

        // Generic "just give me the connection string" override
        var redisConnectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING");
        if (!string.IsNullOrWhiteSpace(redisConnectionString))
        {
            settings.ConnectionString = redisConnectionString;
        }

        // Host/port/password style overrides (common in containerized deployments)
        var host = Environment.GetEnvironmentVariable("REDIS_HOST");
        if (!string.IsNullOrWhiteSpace(host))
        {
            var port = Environment.GetEnvironmentVariable("REDIS_PORT");
            var password = Environment.GetEnvironmentVariable("REDIS_PASSWORD");

            var builder = new StringBuilder();
            builder.Append(host.Trim());
            builder.Append(':');
            builder.Append(string.IsNullOrWhiteSpace(port) ? "6379" : port.Trim());

            if (!string.IsNullOrWhiteSpace(password))
            {
                builder.Append(",password=");
                builder.Append(password.Trim());
            }

            settings.ConnectionString = builder.ToString();
        }

        var databaseVar = Environment.GetEnvironmentVariable("REDIS_DATABASE")
            ?? Environment.GetEnvironmentVariable("REDIS_DB");
        if (int.TryParse(databaseVar, NumberStyles.Integer, CultureInfo.InvariantCulture, out var db))
        {
            settings.Database = db;
        }

        var instanceName = Environment.GetEnvironmentVariable("REDIS_INSTANCE_NAME");
        if (!string.IsNullOrWhiteSpace(instanceName))
        {
            settings.InstanceName = instanceName;
        }

        var useSslVar = Environment.GetEnvironmentVariable("REDIS_USE_SSL");
        if (bool.TryParse(useSslVar, out var useSsl))
        {
            settings.UseSsl = useSsl;
        }
    }

    private static bool TryFormatRedisUrl(string? redisUrl, out string connectionString, out bool? useSsl)
    {
        connectionString = string.Empty;
        useSsl = null;

        if (string.IsNullOrWhiteSpace(redisUrl))
        {
            return false;
        }

        if (!Uri.TryCreate(redisUrl, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (!string.Equals(uri.Scheme, "redis", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(uri.Scheme, "rediss", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var host = uri.Host;
        if (string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        var port = uri.Port > 0 ? uri.Port : 6379;
        var password = ExtractPassword(uri.UserInfo);

        var builder = new StringBuilder();
        builder.Append(host);
        builder.Append(':');
        builder.Append(port.ToString(CultureInfo.InvariantCulture));

        if (!string.IsNullOrEmpty(password))
        {
            builder.Append(",password=");
            builder.Append(password);
        }

        connectionString = builder.ToString();
        useSsl = string.Equals(uri.Scheme, "rediss", StringComparison.OrdinalIgnoreCase);
        return true;
    }

    private static string ExtractPassword(string? userInfo)
    {
        if (string.IsNullOrWhiteSpace(userInfo))
        {
            return string.Empty;
        }

        // Formats: "default:password" or ":password"
        var parts = userInfo.Split(':', 2);
        if (parts.Length == 2)
        {
            return parts[1];
        }

        return parts[0];
    }
}

