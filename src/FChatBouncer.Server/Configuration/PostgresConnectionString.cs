using Npgsql;

namespace FChatBouncer.Server.Configuration;

/// <summary>
/// Railway provides DATABASE_URL as a postgresql:// URI, which Npgsql does not accept directly.
/// </summary>
public static class PostgresConnectionString
{
    public static string FromUrl(string databaseUrl)
    {
        if (!Uri.TryCreate(databaseUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "postgresql" && uri.Scheme != "postgres"))
        {
            throw new InvalidOperationException("DATABASE_URL must be a postgresql:// or postgres:// URI");
        }

        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null
        };

        return builder.ConnectionString;
    }
}
