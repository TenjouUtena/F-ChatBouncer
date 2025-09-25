using FChatBouncer.Server.Data;
using FChatBouncer.Server.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FChatBouncer.Server.Services;

public class UserService : IUserService
{
    private readonly BouncerDbContext _context;
    private readonly UserManager<BouncerUser> _userManager;

    public UserService(BouncerDbContext context, UserManager<BouncerUser> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    public async Task<BouncerUser?> GetUserByIdAsync(string userId)
    {
        return await _context.Users
            .Include(u => u.Settings)
            .FirstOrDefaultAsync(u => u.Id == userId);
    }

    public async Task<BouncerUser?> GetUserByUsernameAsync(string username)
    {
        return await _context.Users
            .Include(u => u.Settings)
            .FirstOrDefaultAsync(u => u.UserName == username);
    }

    public async Task<UserSettings?> GetUserSettingsAsync(string userId)
    {
        return await _context.UserSettings
            .FirstOrDefaultAsync(us => us.UserId == userId);
    }

    public async Task UpdateUserSettingsAsync(string userId, UserSettings settings)
    {
        var existing = await GetUserSettingsAsync(userId);
        if (existing != null)
        {
            existing.RetentionDays = settings.RetentionDays;
            existing.AutoPurgeEnabled = settings.AutoPurgeEnabled;
            existing.FChatCredentialsEncrypted = settings.FChatCredentialsEncrypted;
        }
        else
        {
            settings.UserId = userId;
            _context.UserSettings.Add(settings);
        }

        await _context.SaveChangesAsync();
    }

    public async Task<bool> ValidateUserCredentialsAsync(string username, string password)
    {
        var user = await _userManager.FindByNameAsync(username);
        if (user == null) return false;

        return await _userManager.CheckPasswordAsync(user, password);
    }
}