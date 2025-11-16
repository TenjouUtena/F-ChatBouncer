using FChatBouncer.Server.Data;
using FChatBouncer.Server.Hubs;
using FChatBouncer.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FChatBouncer.Server.Services;

public class MessageService : IMessageService
{
    private readonly BouncerDbContext _context;

    public MessageService(BouncerDbContext context)
    {
        _context = context;
    }

    public async Task<List<MessageDto>> GetMessagesAsync(string userId, string channel, DateTime since, int limit = 100)
    {
        var messages = await _context.Messages
            .Where(m => m.UserId == userId &&
                       m.ChannelName == channel &&
                       m.Timestamp < since) // Get older messages than 'since'
            .OrderByDescending(m => m.Timestamp) // Get most recent older messages first
            .Take(limit)
            .Select(m => new MessageDto(
                m.ChannelName,
                m.Sender,
                m.Content,
                m.Timestamp,
                m.MessageType.ToString(),
                m.CharacterName
            ))
            .ToListAsync();

        // Reverse the order so we return messages in chronological order (oldest first)
        messages.Reverse();
        return messages;
    }

    public async Task<int> GetMessagesCountAsync(string userId, string channel, DateTime? before = null)
    {
        var query = _context.Messages
            .Where(m => m.UserId == userId && 
                       m.ChannelName == channel);
        
        if (before.HasValue)
        {
            query = query.Where(m => m.Timestamp < before.Value);
        }

        return await query.CountAsync();
    }

    public async Task<List<MessageDto>> GetRecentMessagesAsync(string userId, DateTime since)
    {
        var messages = await _context.Messages
            .Where(m => m.UserId == userId && m.Timestamp >= since)
            .OrderBy(m => m.Timestamp)
            .Select(m => new MessageDto(
                m.ChannelName,
                m.Sender,
                m.Content,
                m.Timestamp,
                m.MessageType.ToString(),
                m.CharacterName
            ))
            .ToListAsync();

        return messages;
    }

    public async Task<List<MessageDto>> GetChannelMessagesSinceAsync(string userId, string channel, DateTime since, int limit = 100)
    {
        var messages = await _context.Messages
            .Where(m => m.UserId == userId &&
                        m.ChannelName == channel &&
                        m.Timestamp >= since)
            .OrderBy(m => m.Timestamp)
            .Take(limit)
            .Select(m => new MessageDto(
                m.ChannelName,
                m.Sender,
                m.Content,
                m.Timestamp,
                m.MessageType.ToString(),
                m.CharacterName
            ))
            .ToListAsync();

        return messages;
    }

    public async Task SaveMessageAsync(string userId, string channel, string sender, string content, MessageType messageType, string characterName = "")
    {
        var message = new Message
        {
            UserId = userId,
            ChannelName = channel,
            CharacterName = characterName,
            Sender = sender,
            Content = content,
            MessageType = messageType,
            Timestamp = DateTime.UtcNow
        };

        _context.Messages.Add(message);
        await _context.SaveChangesAsync();
    }

    public async Task<int> PurgeMessagesAsync(string userId, DateTime? before = null, string? channel = null)
    {
        var query = _context.Messages.Where(m => m.UserId == userId);

        if (before.HasValue)
        {
            query = query.Where(m => m.Timestamp < before.Value);
        }

        if (!string.IsNullOrEmpty(channel))
        {
            query = query.Where(m => m.ChannelName == channel);
        }

        var messages = await query.ToListAsync();
        _context.Messages.RemoveRange(messages);
        await _context.SaveChangesAsync();

        return messages.Count;
    }

    public async Task QueueMessageAsync(string userId, string channel, string senderCharacter, string content, MessageType messageType)
    {
        var queuedMessage = new QueuedMessage
        {
            UserId = userId,
            ChannelName = channel,
            SenderCharacter = senderCharacter,
            Content = content,
            MessageType = messageType,
            QueuedAt = DateTime.UtcNow
        };

        _context.QueuedMessages.Add(queuedMessage);
        await _context.SaveChangesAsync();
    }

    public async Task<List<QueuedMessage>> GetQueuedMessagesAsync(string userId)
    {
        return await _context.QueuedMessages
            .Where(qm => qm.UserId == userId)
            .OrderBy(qm => qm.QueuedAt)
            .ToListAsync();
    }

    public async Task ProcessQueuedMessageAsync(int queuedMessageId)
    {
        var queuedMessage = await _context.QueuedMessages.FindAsync(queuedMessageId);
        if (queuedMessage != null)
        {
            _context.QueuedMessages.Remove(queuedMessage);
            await _context.SaveChangesAsync();
        }
    }

    public async Task ClearQueuedMessagesAsync(string userId)
    {
        var queuedMessages = await _context.QueuedMessages
            .Where(qm => qm.UserId == userId)
            .ToListAsync();

        _context.QueuedMessages.RemoveRange(queuedMessages);
        await _context.SaveChangesAsync();
    }

    // New log retrieval methods
    public async Task<List<CharacterLogSummary>> GetCharactersWithLogsAsync(string userId)
    {
        var characterLogs = await _context.Messages
            .Where(m => m.UserId == userId)
            .GroupBy(m => m.CharacterName)
            .Select(g => new CharacterLogSummary
            {
                CharacterName = g.Key,
                MessageCount = g.Count(),
                LastMessageTime = g.Max(m => m.Timestamp),
                Channels = g.Select(m => m.ChannelName).Distinct().ToArray()
            })
            .OrderByDescending(c => c.LastMessageTime)
            .ToListAsync();

        return characterLogs;
    }

    public async Task<List<ChannelLogSummary>> GetChannelsWithLogsAsync(string userId)
    {
        var channelLogs = await _context.Messages
            .Where(m => m.UserId == userId)
            .GroupBy(m => m.ChannelName)
            .Select(g => new ChannelLogSummary
            {
                ChannelName = g.Key,
                ChannelTitle = g.Key, // Will be updated with actual title if available
                MessageCount = g.Count(),
                LastMessageTime = g.Max(m => m.Timestamp),
                Characters = g.Select(m => m.CharacterName).Distinct().ToArray()
            })
            .OrderByDescending(c => c.LastMessageTime)
            .ToListAsync();

        // Try to get channel titles from the Channels table
        var channelNames = channelLogs.Select(c => c.ChannelName).ToList();
        var channelTitles = await _context.Channels
            .Where(c => c.UserId == userId && channelNames.Contains(c.FChatChannelName))
            .ToDictionaryAsync(c => c.FChatChannelName, c => c.DisplayName ?? c.FChatChannelName);

        // Update channel titles where available
        foreach (var channelLog in channelLogs)
        {
            if (channelTitles.TryGetValue(channelLog.ChannelName, out var title))
            {
                channelLog.ChannelTitle = title;
            }
        }

        return channelLogs;
    }

    public async Task<List<Message>> GetCharacterLogsAsync(string userId, string characterName, DateTime? since = null, DateTime? until = null, int limit = 1000)
    {
        var query = _context.Messages
            .Where(m => m.UserId == userId && m.CharacterName == characterName);

        if (since.HasValue)
        {
            query = query.Where(m => m.Timestamp >= since.Value);
        }

        if (until.HasValue)
        {
            query = query.Where(m => m.Timestamp <= until.Value);
        }

        return await query
            .OrderByDescending(m => m.Timestamp)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<List<Message>> GetChannelLogsAsync(string userId, string channelName, DateTime? since = null, DateTime? until = null, int limit = 1000)
    {
        var query = _context.Messages
            .Where(m => m.UserId == userId && m.ChannelName == channelName);

        if (since.HasValue)
        {
            query = query.Where(m => m.Timestamp >= since.Value);
        }

        if (until.HasValue)
        {
            query = query.Where(m => m.Timestamp <= until.Value);
        }

        return await query
            .OrderByDescending(m => m.Timestamp)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<List<Message>> GetCharacterChannelLogsAsync(string userId, string characterName, string channelName, DateTime? since = null, DateTime? until = null, int limit = 1000)
    {
        var query = _context.Messages
            .Where(m => m.UserId == userId && m.CharacterName == characterName && m.ChannelName == channelName);

        if (since.HasValue)
        {
            query = query.Where(m => m.Timestamp >= since.Value);
        }

        if (until.HasValue)
        {
            query = query.Where(m => m.Timestamp <= until.Value);
        }

        return await query
            .OrderByDescending(m => m.Timestamp)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<List<Message>> SearchLogsAsync(string userId, string? characterName = null, string? channelName = null, string? content = null, string? messageType = null, DateTime? since = null, DateTime? until = null, int limit = 1000)
    {
        var query = _context.Messages
            .Where(m => m.UserId == userId);

        if (!string.IsNullOrEmpty(characterName))
        {
            query = query.Where(m => m.CharacterName == characterName);
        }

        if (!string.IsNullOrEmpty(channelName))
        {
            query = query.Where(m => m.ChannelName == channelName);
        }

        if (!string.IsNullOrEmpty(content))
        {
            query = query.Where(m => m.Content.Contains(content));
        }

        if (!string.IsNullOrEmpty(messageType) && Enum.TryParse<MessageType>(messageType, out var msgType))
        {
            query = query.Where(m => m.MessageType == msgType);
        }

        if (since.HasValue)
        {
            query = query.Where(m => m.Timestamp >= since.Value);
        }

        if (until.HasValue)
        {
            query = query.Where(m => m.Timestamp <= until.Value);
        }

        return await query
            .OrderByDescending(m => m.Timestamp)
            .Take(limit)
            .ToListAsync();
    }
}