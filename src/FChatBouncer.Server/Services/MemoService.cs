using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Per-user character memos, stored in UserCharacterNotes
/// </summary>
public class MemoService : IMemoService
{
    private readonly BouncerDbContext _context;
    private readonly ICharacterService _characterService;
    private readonly ILogger<MemoService> _logger;

    public MemoService(
        BouncerDbContext context,
        ICharacterService characterService,
        ILogger<MemoService> logger)
    {
        _context = context;
        _characterService = characterService;
        _logger = logger;
    }

    public async Task<string?> GetMemoAsync(string userId, string characterName)
    {
        return await _context.UserCharacterNotes
            .Where(n => n.UserId == userId)
            .Join(_context.Characters.Where(c => c.Name == characterName),
                n => n.CharacterId, c => c.Id, (n, c) => n.Memo)
            .FirstOrDefaultAsync();
    }

    public async Task UpdateMemoAsync(string userId, string characterName, string? memo)
    {
        var character = await _characterService.GetOrCreateCharacterAsync(characterName);

        var note = await _context.UserCharacterNotes
            .AsTracking()
            .FirstOrDefaultAsync(n => n.UserId == userId && n.CharacterId == character.Id);

        if (note == null)
        {
            note = new UserCharacterNote { UserId = userId, CharacterId = character.Id };
            _context.UserCharacterNotes.Add(note);
        }

        note.Memo = memo;
        note.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated memo for character {CharacterName} (User: {UserId})", characterName, userId);
    }
}
