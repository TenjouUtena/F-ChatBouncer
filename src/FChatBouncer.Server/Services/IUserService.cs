using FChatBouncer.Server.Models;

namespace FChatBouncer.Server.Services;

public interface IUserService
{
    Task<BouncerUser?> GetUserByIdAsync(string userId);
    Task<BouncerUser?> GetUserByUsernameAsync(string username);
    Task<UserSettings?> GetUserSettingsAsync(string userId);
    Task UpdateUserSettingsAsync(string userId, UserSettings settings);
    Task<bool> ValidateUserCredentialsAsync(string username, string password);
}