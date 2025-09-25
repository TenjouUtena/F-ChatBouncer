using FChatBouncer.Server.Models;
using FChatBouncer.Server.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace FChatBouncer.Server.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<BouncerUser> _userManager;
    private readonly IUserService _userService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthController> _logger;
    private readonly SignInManager<BouncerUser> _signInManager;

    public AuthController(
        UserManager<BouncerUser> userManager,
        IUserService userService,
        IConfiguration configuration,
        ILogger<AuthController> logger,
        SignInManager<BouncerUser> signInManager)
    {
        _userManager = userManager;
        _userService = userService;
        _configuration = configuration;
        _logger = logger;
        _signInManager = signInManager;
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        try
        {
            // Check for account lockout
            var user = await _userManager.FindByNameAsync(request.Username);
            if (user != null && user.LockoutEnd.HasValue && user.LockoutEnd > DateTime.UtcNow)
            {
                var remainingTime = user.LockoutEnd.Value - DateTime.UtcNow;
                return Unauthorized(new { 
                    message = $"Account locked. Try again in {remainingTime.Minutes} minutes.",
                    lockoutEnd = user.LockoutEnd.Value
                });
            }

            // Attempt login
            var result = await _signInManager.PasswordSignInAsync(request.Username, request.Password, false, true);
            
            if (!result.Succeeded)
            {
                if (result.IsLockedOut)
                {
                    return Unauthorized(new { message = "Account is locked due to too many failed attempts" });
                }
                return Unauthorized(new { message = "Invalid username or password" });
            }

            if (!user!.IsActive)
            {
                return Unauthorized(new { message = "Account is deactivated" });
            }

            // Reset failed login attempts on successful login
            user.FailedLoginAttempts = 0;
            user.LockoutEnd = null;
            user.LastLoginAt = DateTime.UtcNow;
            await _userManager.UpdateAsync(user);

            // Update F-Chat credentials if provided
            if (!string.IsNullOrEmpty(request.FchatUsername) && !string.IsNullOrEmpty(request.FchatPassword))
            {
                await UpdateFChatCredentials(user, request.FchatUsername, request.FchatPassword);
            }

            var token = GenerateJwtToken(user);
            var refreshToken = await GenerateRefreshTokenAsync(user);

            return Ok(new LoginResponse
            {
                User = new UserDto
                {
                    Id = user.Id,
                    Username = user.UserName!,
                    Email = user.Email,
                    GoogleId = user.GoogleId,
                    GoogleEmail = user.GoogleEmail,
                    GoogleName = user.GoogleName,
                    GooglePicture = user.GooglePicture,
                    HasFChatCredentials = user.HasFChatCredentials
                },
                Token = token,
                RefreshToken = refreshToken
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login failed for user {Username}", request.Username);
            return StatusCode(500, new { message = "Login failed" });
        }
    }

    [HttpPost("register")]
    public async Task<ActionResult<LoginResponse>> Register([FromBody] LoginRequest request)
    {
        try
        {
            // Check if user already exists
            var existingUser = await _userManager.FindByNameAsync(request.Username);
            if (existingUser != null)
            {
                return BadRequest(new { message = "Username already exists" });
            }

            // Create new user
            var user = new BouncerUser
            {
                UserName = request.Username,
                Email = request.Username.Contains('@') ? request.Username : $"{request.Username}@bouncer.local",
                IsActive = true,
                LastPasswordChange = DateTime.UtcNow
            };

            var result = await _userManager.CreateAsync(user, request.Password);
            if (!result.Succeeded)
            {
                return BadRequest(new { message = "Registration failed", errors = result.Errors });
            }

            // Create user settings
            var settings = new UserSettings
            {
                UserId = user.Id,
                RetentionDays = 30,
                AutoPurgeEnabled = true
            };

            // Update F-Chat credentials if provided
            if (!string.IsNullOrEmpty(request.FchatUsername) && !string.IsNullOrEmpty(request.FchatPassword))
            {
                await UpdateFChatCredentials(user, request.FchatUsername, request.FchatPassword);
            }

            await _userService.UpdateUserSettingsAsync(user.Id, settings);

            var token = GenerateJwtToken(user);
            var refreshToken = await GenerateRefreshTokenAsync(user);

            return Ok(new LoginResponse
            {
                User = new UserDto
                {
                    Id = user.Id,
                    Username = user.UserName!,
                    Email = user.Email,
                    HasFChatCredentials = user.HasFChatCredentials
                },
                Token = token,
                RefreshToken = refreshToken
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Registration failed for user {Username}", request.Username);
            return StatusCode(500, new { message = "Registration failed" });
        }
    }

    [HttpGet("google")]
    public IActionResult GoogleLogin()
    {
        var redirectUrl = Url.Action("GoogleCallback", "Auth", null, Request.Scheme);
        var properties = _signInManager.ConfigureExternalAuthenticationProperties("Google", redirectUrl);
        return Challenge(properties, "Google");
    }

    [HttpGet("google-callback")]
    public async Task<IActionResult> GoogleCallback()
    {
        try
        {
            _logger.LogInformation("Google OAuth callback received");
            _logger.LogInformation("Request URL: {Url}", $"{Request.Scheme}://{Request.Host}{Request.Path}{Request.QueryString}");
            _logger.LogInformation("Query parameters: {Query}", Request.QueryString);
            
            // Check if this is a callback without OAuth parameters (duplicate request)
            if (!Request.Query.ContainsKey("code") && !Request.Query.ContainsKey("state"))
            {
                _logger.LogWarning("OAuth callback received without code/state parameters - likely a duplicate request");
                return Redirect("/"); // Redirect to main app instead of showing error
            }
            
            var info = await _signInManager.GetExternalLoginInfoAsync();
            if (info == null)
            {
                _logger.LogWarning("External login info is null - possible OAuth state issue");
                _logger.LogWarning("This could be due to:");
                _logger.LogWarning("1. Session/cookie issues");
                _logger.LogWarning("2. Incorrect redirect URI in Google Console");
                _logger.LogWarning("3. Port mismatch (server on 5001, Google app configured for 5000?)");
                return Redirect($"/login?error=external_login_failed");
            }

            _logger.LogInformation("External login info retrieved successfully");
            var googleId = info.Principal.FindFirst("sub")?.Value;
            var email = info.Principal.FindFirst("email")?.Value;
            var name = info.Principal.FindFirst("name")?.Value;
            var picture = info.Principal.FindFirst("picture")?.Value;

            if (string.IsNullOrEmpty(googleId) || string.IsNullOrEmpty(email))
            {
                _logger.LogWarning("Missing Google data - GoogleId: {GoogleId}, Email: {Email}", googleId, email);
                return Redirect($"/login?error=invalid_google_data");
            }

            // Check if user exists by Google ID
            var user = await _userManager.Users.FirstOrDefaultAsync(u => u.GoogleId == googleId);
            
            if (user == null)
            {
                // Check if user exists by email
                user = await _userManager.FindByEmailAsync(email);
                
                if (user == null)
                {
                    // Create new user
                    user = new BouncerUser
                    {
                        UserName = email,
                        Email = email,
                        GoogleId = googleId,
                        GoogleEmail = email,
                        GoogleName = name,
                        GooglePicture = picture,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        LastLoginAt = DateTime.UtcNow
                    };

                    var result = await _userManager.CreateAsync(user);
                    if (!result.Succeeded)
                    {
                        _logger.LogError("Failed to create Google user: {Errors}", string.Join(", ", result.Errors.Select(e => e.Description)));
                        return Redirect($"/login?error=user_creation_failed");
                    }

                    // Create user settings
                    var settings = new UserSettings
                    {
                        UserId = user.Id,
                        RetentionDays = 30,
                        AutoPurgeEnabled = true
                    };
                    await _userService.UpdateUserSettingsAsync(user.Id, settings);
                }
                else
                {
                    // Link existing user with Google account
                    user.GoogleId = googleId;
                    user.GoogleEmail = email;
                    user.GoogleName = name;
                    user.GooglePicture = picture;
                    await _userManager.UpdateAsync(user);
                }
            }
            else
            {
                // Update user info
                user.GoogleEmail = email;
                user.GoogleName = name;
                user.GooglePicture = picture;
                user.LastLoginAt = DateTime.UtcNow;
                await _userManager.UpdateAsync(user);
            }

            if (!user.IsActive)
            {
                return Redirect($"/login?error=account_deactivated");
            }

            // Sign in the user
            await _signInManager.SignInAsync(user, false);

            // Generate JWT token
            var token = GenerateJwtToken(user);
            var refreshToken = await GenerateRefreshTokenAsync(user);

            // Redirect to frontend with tokens
            var frontendUrl = $"/auth-success?token={token}&refreshToken={refreshToken}&userId={user.Id}&hasFChatCredentials={user.HasFChatCredentials}";
            return Redirect(frontendUrl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Google OAuth callback failed");
            return Redirect($"/login?error=oauth_callback_failed");
        }
    }

    [HttpPost("update-fchat-credentials")]
    public async Task<ActionResult> UpdateFChatCredentials([FromBody] UpdateFChatCredentialsRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized();
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return NotFound();
            }

            await UpdateFChatCredentials(user, request.FchatUsername, request.FchatPassword);

            return Ok(new { message = "F-Chat credentials updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update F-Chat credentials");
            return StatusCode(500, new { message = "Failed to update F-Chat credentials" });
        }
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<RefreshResponse>> Refresh([FromBody] RefreshRequest request)
    {
        try
        {
            var user = await _userManager.FindByIdAsync(request.UserId);
            if (user == null || !user.IsActive)
            {
                return Unauthorized(new { message = "Invalid user" });
            }

            // Validate refresh token
            var isValidRefreshToken = await _userManager.VerifyUserTokenAsync(
                user, 
                TokenOptions.DefaultProvider, 
                "RefreshToken", 
                request.RefreshToken);

            if (!isValidRefreshToken)
            {
                return Unauthorized(new { message = "Invalid refresh token" });
            }

            // Generate new tokens
            var newToken = GenerateJwtToken(user);
            var newRefreshToken = await GenerateRefreshTokenAsync(user);

            return Ok(new RefreshResponse
            {
                Token = newToken,
                RefreshToken = newRefreshToken
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token refresh failed for user {UserId}", request.UserId);
            return StatusCode(500, new { message = "Token refresh failed" });
        }
    }

    private string GenerateJwtToken(BouncerUser user)
    {
        var jwtSecretKey = Environment.GetEnvironmentVariable("JWT__SecretKey");
        if (string.IsNullOrEmpty(jwtSecretKey))
        {
            throw new InvalidOperationException("JWT__SecretKey environment variable is not set");
        }
        var secretKey = Encoding.ASCII.GetBytes(jwtSecretKey);
        
        var jwtIssuer = Environment.GetEnvironmentVariable("JWT__Issuer") ?? "F-ChatBouncer";
        var jwtAudience = Environment.GetEnvironmentVariable("JWT__Audience") ?? "F-ChatBouncer-Users";
        var jwtExpirationMinutes = int.Parse(Environment.GetEnvironmentVariable("JWT__ExpirationInMinutes") ?? "60");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Name, user.UserName!),
            new Claim(ClaimTypes.Email, user.Email ?? ""),
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(jwtExpirationMinutes),
            Issuer = jwtIssuer,
            Audience = jwtAudience,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(secretKey), SecurityAlgorithms.HmacSha256Signature)
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private async Task<string> GenerateRefreshTokenAsync(BouncerUser user)
    {
        // Generate a refresh token using ASP.NET Core Identity's token provider
        var refreshToken = await _userManager.GenerateUserTokenAsync(
            user, 
            TokenOptions.DefaultProvider, 
            "RefreshToken");

        return refreshToken;
    }

    private async Task UpdateFChatCredentials(BouncerUser user, string fchatUsername, string fchatPassword)
    {
        var settings = await _userService.GetUserSettingsAsync(user.Id) ?? new UserSettings { UserId = user.Id };
        var credentials = $"{fchatUsername}:{fchatPassword}";
        settings.FChatCredentialsEncrypted = Convert.ToBase64String(Encoding.UTF8.GetBytes(credentials));
        await _userService.UpdateUserSettingsAsync(user.Id, settings);
        
        // Update user flags
        user.HasFChatCredentials = true;
        user.LastFChatCredentialsUpdate = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);
    }
}

// DTOs
public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FchatUsername { get; set; } = string.Empty;
    public string FchatPassword { get; set; } = string.Empty;
}

public class LoginResponse
{
    public UserDto User { get; set; } = null!;
    public string Token { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
}

public class UserDto
{
    public string Id { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? GoogleId { get; set; }
    public string? GoogleEmail { get; set; }
    public string? GoogleName { get; set; }
    public string? GooglePicture { get; set; }
    public bool HasFChatCredentials { get; set; }
}

public class RefreshRequest
{
    public string UserId { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
}

public class RefreshResponse
{
    public string Token { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
}

public class UpdateFChatCredentialsRequest
{
    public string FchatUsername { get; set; } = string.Empty;
    public string FchatPassword { get; set; } = string.Empty;
}