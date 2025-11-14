using System.Text.RegularExpressions;
using FChatBouncer.Server.Infrastructure;

namespace FChatBouncer.Server.MessageQueue;

/// <summary>
/// Provides helper methods for generating and parsing Redis stream keys and consumer group names.
/// </summary>
public static class StreamKeys
{
    private const string RoomStreamPrefix = "chat:messages:room";
    private const string DirectStreamPrefix = "chat:messages:dm";
    private const string SystemStreamPrefix = "chat:system:events";
    private const string ConnectionStreamPrefix = "chat:system:connections";

    private static readonly Regex RoomStreamPattern = new($@"^{RoomStreamPrefix}:(?<userId>[^:]+):(?<roomId>.+)$", RegexOptions.Compiled);
    private static readonly Regex DirectStreamPattern = new($@"^{DirectStreamPrefix}:(?<userId>[^:]+):(?<conversationId>.+)$", RegexOptions.Compiled);
    private static readonly Regex SystemStreamPattern = new($@"^{SystemStreamPrefix}:(?<userId>[^:]+)$", RegexOptions.Compiled);

    public static string GetRoomStreamKey(string userId, string roomId)
        => $"{RoomStreamPrefix}:{userId}:{roomId}";

    public static string GetDirectStreamKey(string userId, string conversationId)
        => $"{DirectStreamPrefix}:{userId}:{conversationId}";

    public static string GetSystemStreamKey(string userId)
        => $"{SystemStreamPrefix}:{userId}";

    public static string GetConnectionStreamKey(string userId)
        => $"{ConnectionStreamPrefix}:{userId}";

    public static string GetRoomConsumerGroup(string userId, string userAgentId, string roomId)
        => $"user-agent:{userId}:{userAgentId}:room:{roomId}";

    public static string GetDirectConsumerGroup(string userId, string userAgentId, string conversationId)
        => $"user-agent:{userId}:{userAgentId}:dm:{conversationId}";

    public static string GetSystemConsumerGroup(string userId, string userAgentId)
        => $"user-agent:{userId}:{userAgentId}:system";

    public static string GetAgentStreamSetKey(string userId, string userAgentId)
        => $"user-agent:{userId}:{userAgentId}:streams";

    public static string GetAgentOffsetHashKey(string userId, string userAgentId)
        => $"user-agent:{userId}:{userAgentId}:offsets";

    public static bool TryParseRoomStream(string streamKey, out string userId, out string roomId)
    {
        var match = RoomStreamPattern.Match(streamKey);
        if (match.Success)
        {
            userId = match.Groups["userId"].Value;
            roomId = match.Groups["roomId"].Value;
            return true;
        }

        userId = string.Empty;
        roomId = string.Empty;
        return false;
    }

    public static bool TryParseDirectStream(string streamKey, out string userId, out string conversationId)
    {
        var match = DirectStreamPattern.Match(streamKey);
        if (match.Success)
        {
            userId = match.Groups["userId"].Value;
            conversationId = match.Groups["conversationId"].Value;
            return true;
        }

        userId = string.Empty;
        conversationId = string.Empty;
        return false;
    }

    public static bool TryParseSystemStream(string streamKey, out string userId)
    {
        var match = SystemStreamPattern.Match(streamKey);
        if (match.Success)
        {
            userId = match.Groups["userId"].Value;
            return true;
        }

        userId = string.Empty;
        return false;
    }

    public static IEnumerable<string> GetStreamScanPatterns()
    {
        yield return $"{RoomStreamPrefix}:*";
        yield return $"{DirectStreamPrefix}:*";
        yield return $"{SystemStreamPrefix}:*";
    }

    public static IEnumerable<string> ScanAllUserStreams(IRedisConnectionFactory connectionFactory, string userId)
    {
        if (connectionFactory is null)
        {
            throw new ArgumentNullException(nameof(connectionFactory));
        }

        if (string.IsNullOrWhiteSpace(userId))
        {
            yield break;
        }

        var server = connectionFactory.GetServer();

        foreach (var key in server.Keys(pattern: $"{RoomStreamPrefix}:{userId}:*"))
        {
            yield return key.ToString();
        }

        foreach (var key in server.Keys(pattern: $"{DirectStreamPrefix}:{userId}:*"))
        {
            yield return key.ToString();
        }

        foreach (var key in server.Keys(pattern: $"{SystemStreamPrefix}:{userId}"))
        {
            yield return key.ToString();
        }
    }
}

