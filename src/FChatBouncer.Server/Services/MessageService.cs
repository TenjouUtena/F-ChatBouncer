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
                       m.Timestamp < since) // Changed to < since to get older messages
            .OrderByDescending(m => m.Timestamp) // Changed to descending to get most recent older messages first
            .Take(limit)
            .Select(m => new MessageDto(
                m.ChannelName,
                m.Sender,
                m.Content,
                m.Timestamp,
                m.MessageType.ToString()
            ))
            .ToListAsync();

        // Reverse the order so we return messages in chronological order (oldest first)
        messages.Reverse();
        return messages;
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
                m.MessageType.ToString()
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
}