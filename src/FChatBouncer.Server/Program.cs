using FChatBouncer.Server.Data;
using FChatBouncer.Server.Hubs;
using FChatBouncer.Server.Models;
using FChatBouncer.Server.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using System.Security.Claims;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
builder.Host.UseSerilog((context, config) =>
{
    config
        .ReadFrom.Configuration(context.Configuration)
        .WriteTo.Console(restrictedToMinimumLevel: Serilog.Events.LogEventLevel.Warning)
        .WriteTo.File(
            path: "logs/fchat-bouncer-.log",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 7,
            fileSizeLimitBytes: 100_000_000,
            rollOnFileSizeLimit: true,
            restrictedToMinimumLevel: Serilog.Events.LogEventLevel.Information
        );
});

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddSignalR();

// Database
builder.Services.AddDbContext<BouncerDbContext>(options =>
{
    // Try to get connection string from environment variables first (Railway)
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
    
    if (!string.IsNullOrEmpty(databaseUrl))
    {
        // Use Railway's DATABASE_URL if available
        options.UseNpgsql(databaseUrl);
    }
    else if (!string.IsNullOrEmpty(connectionString))
    {
        // Fall back to configuration connection string
        options.UseNpgsql(connectionString);
    }
    else
    {
        // Build connection string from individual PostgreSQL environment variables
        var host = Environment.GetEnvironmentVariable("PGHOST") ?? "localhost";
        var port = Environment.GetEnvironmentVariable("PGPORT") ?? "5432";
        var database = Environment.GetEnvironmentVariable("PGDATABASE") ?? "fchat_bouncer";
        var username = Environment.GetEnvironmentVariable("PGUSER") ?? "postgres";
        var password = Environment.GetEnvironmentVariable("PGPASSWORD") ?? "password";
        
        var builtConnectionString = $"Host={host};Port={port};Database={database};Username={username};Password={password}";
        options.UseNpgsql(builtConnectionString);
    }
});

// Identity
var securitySettings = builder.Configuration.GetSection("Security");
builder.Services.AddIdentity<BouncerUser, IdentityRole>(options =>
{
    // Configure password requirements from settings
    options.Password.RequireDigit = securitySettings.GetValue<bool>("RequireNumbers");
    options.Password.RequiredLength = securitySettings.GetValue<int>("PasswordMinLength");
    options.Password.RequireNonAlphanumeric = securitySettings.GetValue<bool>("RequireSpecialCharacters");
    options.Password.RequireUppercase = securitySettings.GetValue<bool>("RequireUppercase");
    options.Password.RequireLowercase = true; // Always require lowercase

    // Configure user requirements
    options.User.RequireUniqueEmail = false;
    
    // Configure lockout settings
    options.Lockout.MaxFailedAccessAttempts = securitySettings.GetValue<int>("MaxLoginAttempts");
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(securitySettings.GetValue<int>("LockoutDurationMinutes"));
    options.Lockout.AllowedForNewUsers = true;
})
.AddEntityFrameworkStores<BouncerDbContext>()
.AddDefaultTokenProviders();

// JWT Authentication
var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secretKey = Encoding.ASCII.GetBytes(jwtSettings["SecretKey"]!);

// Authentication
var googleSettings = builder.Configuration.GetSection("GoogleOAuth");
var requireHttps = securitySettings.GetValue<bool>("RequireHttps");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = requireHttps;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(secretKey),
        ValidateIssuer = false,
        ValidateAudience = false,
        ClockSkew = TimeSpan.Zero
    };

    // Allow JWT in SignalR
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/bouncerHub"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
})
.AddGoogle(options =>
{
    options.ClientId = googleSettings["ClientId"] ?? "";
    options.ClientSecret = googleSettings["ClientSecret"] ?? "";
    options.CallbackPath = "/api/auth/google-callback";
    options.SaveTokens = true;
    
    // Request additional scopes
    options.Scope.Add("email");
    options.Scope.Add("profile");
    
    // Configure events
    options.Events.OnCreatingTicket = async context =>
    {
        // Store Google user info in claims
        var googleId = context.Principal?.FindFirst("sub")?.Value;
        var email = context.Principal?.FindFirst("email")?.Value;
        var name = context.Principal?.FindFirst("name")?.Value;
        var picture = context.Principal?.FindFirst("picture")?.Value;
        
        if (!string.IsNullOrEmpty(googleId))
        {
            context.Principal?.AddIdentity(new ClaimsIdentity(new[]
            {
                new Claim("GoogleId", googleId),
                new Claim("GoogleEmail", email ?? ""),
                new Claim("GoogleName", name ?? ""),
                new Claim("GooglePicture", picture ?? "")
            }));
        }
        
        await Task.CompletedTask;
    };
    
    // Handle OAuth errors with more detailed logging
    options.Events.OnRemoteFailure = async context =>
    {
        var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<Program>>();
        var errorMessage = context.Failure?.Message ?? "Unknown error";
        var request = context.HttpContext.Request;
        
        // Check if this is a duplicate request without OAuth parameters
        if (!request.Query.ContainsKey("code") && !request.Query.ContainsKey("state"))
        {
            logger.LogWarning("OAuth failure on request without parameters - likely duplicate callback");
            context.Response.Redirect("/"); // Redirect to main app
            context.HandleResponse();
            await Task.CompletedTask;
            return;
        }
        
        // Log detailed OAuth failure information
        logger.LogError("Google OAuth failure: {Error}", errorMessage);
        logger.LogError("Request URL: {Url}", $"{request.Scheme}://{request.Host}{request.Path}{request.QueryString}");
        logger.LogError("Request Headers: {Headers}", string.Join(", ", request.Headers.Select(h => $"{h.Key}={h.Value}")));
        logger.LogError("Query Parameters: {Query}", request.QueryString);
        
        // Log specific OAuth state errors
        if (errorMessage.Contains("state") || errorMessage.Contains("invalid"))
        {
            logger.LogError("OAuth state validation failed. This may be due to:");
            logger.LogError("1. Session/cookie issues");
            logger.LogError("2. Incorrect redirect URI in Google Console");
            logger.LogError("3. Port mismatch (server on 5001, Google app configured for 5000?)");
            logger.LogError("4. CORS or cookie policy issues");
        }
        
        // Redirect to frontend with error
        context.Response.Redirect($"/login?error=oauth_failed&message={Uri.EscapeDataString(errorMessage)}");
        context.HandleResponse();
        await Task.CompletedTask;
    };
});

// Data Protection for OAuth state
builder.Services.AddDataProtection();

// Session configuration for OAuth state validation (using in-memory, not Redis)
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = requireHttps ? CookieSecurePolicy.Always : CookieSecurePolicy.None;
});

// Cookie policy for OAuth
builder.Services.Configure<CookiePolicyOptions>(options =>
{
    options.CheckConsentNeeded = context => false;
    options.MinimumSameSitePolicy = SameSiteMode.Lax;
});


// Custom Services
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IMessageService, MessageService>();
builder.Services.AddScoped<IProfileService, ProfileService>();
builder.Services.AddScoped<ICharacterService, CharacterService>();
builder.Services.AddSingleton<IFChatService, FChatService>();
builder.Services.AddSingleton<IProfileRateLimiter, ProfileRateLimiter>();
builder.Services.AddSingleton<TicketManager>();

// CORS
builder.Services.AddCors(options =>
{
    if (builder.Environment.IsDevelopment())
    {
        // Development: More permissive for local development
        options.AddPolicy("AllowClient", policy =>
        {
            policy.WithOrigins("http://localhost:3000", "https://localhost:3000")
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        });
    }
    else
    {
        // Production: Strict CORS policy
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() 
            ?? new[] { "https://fchat.proactiveapathy.com" };
        
        options.AddPolicy("AllowClient", policy =>
        {
            policy.WithOrigins(allowedOrigins)
                  .WithHeaders("Authorization", "Content-Type", "X-Requested-With")
                  .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                  .AllowCredentials();
        });
    }
});

// Add Health Checks
builder.Services.AddHealthChecks()
    .AddCheck("database", () => 
    {
        try
        {
            using var scope = builder.Services.BuildServiceProvider().CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            context.Database.CanConnect();
            return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy("Database connection is working");
        }
        catch (Exception ex)
        {
            return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Unhealthy("Database connection failed", ex);
        }
    });

// Add Swagger for development
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();
}

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRouting();
app.UseCors("AllowClient");
app.UseCookiePolicy();
app.UseSession();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<BouncerHub>("/bouncerHub");

// Add health check endpoint
app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var result = System.Text.Json.JsonSerializer.Serialize(new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(entry => new
            {
                name = entry.Key,
                status = entry.Value.Status.ToString(),
                description = entry.Value.Description,
                duration = entry.Value.Duration.TotalMilliseconds
            }),
            totalDuration = report.TotalDuration.TotalMilliseconds
        });
        await context.Response.WriteAsync(result);
    }
});

// Handle test commands
if (args.Length > 0 && args[0] == "--test-ich")
{
    Console.WriteLine("🧪 Running ICH Command Tests...\n");
    FChatBouncer.Server.Tests.ICHCommandTest.RunAllTests();
    Console.WriteLine("\n🏁 All Tests Complete!");
    return;
}

// Cleanup invalid channels on startup
using (var scope = app.Services.CreateScope())
{
    var fChatService = scope.ServiceProvider.GetRequiredService<IFChatService>();
    try
    {
        await fChatService.CleanupInvalidChannelsAsync();
    }
    catch (Exception ex)
    {
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Failed to cleanup invalid channels on startup");
    }
}

app.Run();