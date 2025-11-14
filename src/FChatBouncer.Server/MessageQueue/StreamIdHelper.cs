using System.Globalization;

namespace FChatBouncer.Server.MessageQueue;

public static class StreamIdHelper
{
    public static string GenerateDeliveryTag() => Guid.NewGuid().ToString("N");

    public static DateTime ParseRedisTimestamp(string? milliseconds)
    {
        if (string.IsNullOrWhiteSpace(milliseconds))
        {
            return DateTime.UtcNow;
        }

        if (long.TryParse(milliseconds, NumberStyles.Integer, CultureInfo.InvariantCulture, out var ms))
        {
            return DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime;
        }

        return DateTime.UtcNow;
    }

    public static string GetMillisecondsTimestamp(DateTime dateTime)
    {
        var utc = dateTime.Kind == DateTimeKind.Utc ? dateTime : dateTime.ToUniversalTime();
        return new DateTimeOffset(utc).ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture);
    }
}

