using System.Collections.Generic;
using FChatBouncer.Server.Configuration;
using FChatBouncer.Server.Data;
using FChatBouncer.Server.BackgroundServices;
using FChatBouncer.Server.HealthChecks;
using FChatBouncer.Server.Hubs;
using FChatBouncer.Server.Infrastructure;
using FChatBouncer.Server.Middleware;
using FChatBouncer.Server.MessageQueue;
using FChatBouncer.Server.Models;
using FChatBouncer.Server.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Serilog.Events;
using StackExchange.Redis;
using System.Security.Claims;
using System.Text;
using Prometheus;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog with enhanced logging
builder.Host.UseSerilog((context, config) =>
{
    config
        .ReadFrom.Configuration(context.Configuration)
        .Enrich.FromLogContext()
        .Enrich.WithMachineName()
        .Enrich.WithEnvironmentName()
        .Enrich.WithThreadId()
        .Enrich.WithProcessId()
        .Enrich.WithProperty("Application", "FChatBouncer")
        .Enrich.WithProperty("Version", typeof(Program).Assembly.GetName().Version?.ToString() ?? "Unknown");
    
    // Note: WriteTo configuration is now handled in appsettings.json for better control
    // This allows different log levels per sink (Console vs File) without code changes
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
    
    
    string finalConnectionString;
    
    if (!string.IsNullOrEmpty(databaseUrl))
    {
        // Use Railway's DATABASE_URL if available
        try
        {
            // Validate the connection string format
            if (databaseUrl.StartsWith("postgresql://") || databaseUrl.StartsWith("postgres://"))
            {
                finalConnectionString = databaseUrl;
            }
            else
            {
                throw new InvalidOperationException($"Invalid DATABASE_URL format: {databaseUrl}");
            }
        }
        catch
        {
            throw;
        }
    }
    else if (!string.IsNullOrEmpty(connectionString))
    {
        // Fall back to configuration connection string
        finalConnectionString = connectionString;
    }
    else
    {
        // Build connection string from individual PostgreSQL environment variables
        var host = Environment.GetEnvironmentVariable("PGHOST") ?? "localhost";
        var port = Environment.GetEnvironmentVariable("PGPORT") ?? "5432";
        var database = Environment.GetEnvironmentVariable("PGDATABASE") ?? "fchat_bouncer";
        var username = Environment.GetEnvironmentVariable("PGUSER") ?? "postgres";
        var password = Environment.GetEnvironmentVariable("PGPASSWORD") ?? "password";
        
        finalConnectionString = $"Host={host};Port={port};Database={database};Username={username};Password={password}";
    }

    // Configure PostgreSQL with connection resilience
    options.UseNpgsql(finalConnectionString, npgsqlOptions =>
    {
        // Enable connection resilience with retry policy
        npgsqlOptions.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(30),
            errorCodesToAdd: null);
        
        // Set command timeout to 30 seconds
        npgsqlOptions.CommandTimeout(30);
    });
    
    // Configure Entity Framework execution strategy for transient failures
    options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
    
    // Enable sensitive data logging in development
    if (builder.Environment.IsDevelopment())
    {
        options.EnableSensitiveDataLogging();
        options.EnableDetailedErrors();
    }
});

// Redis Configuration (supports Railway/production environment variables)
var redisSettingsSnapshot = RedisEnvironmentConfiguration.CreateFromConfiguration(builder.Configuration);

builder.Services.Configure<RedisSettings>(builder.Configuration.GetSection("Redis"));
builder.Services.PostConfigure<RedisSettings>(RedisEnvironmentConfiguration.ApplyEnvironmentOverrides);
builder.Services.Configure<MessageQueueOptions>(builder.Configuration.GetSection("MessageQueue"));
builder.Services.AddSingleton<IRedisConnectionFactory, RedisConnectionFactory>();
builder.Services.AddSingleton<IMessageQueue, RedisStreamMessageQueue>();

// Register IConnectionMultiplexer for services that need direct Redis access
builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
{
    var factory = sp.GetRequiredService<IRedisConnectionFactory>();
    return factory.GetConnection();
});

builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = redisSettingsSnapshot.ConnectionString;
    options.InstanceName = redisSettingsSnapshot.InstanceName ?? "FChatBouncer:";
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
var jwtSecretKey = Environment.GetEnvironmentVariable("JWT__SecretKey");
if (string.IsNullOrEmpty(jwtSecretKey))
{
    throw new InvalidOperationException("JWT__SecretKey environment variable is not set");
}
var secretKey = Encoding.ASCII.GetBytes(jwtSecretKey);

var jwtIssuer = Environment.GetEnvironmentVariable("JWT__Issuer") ?? "F-ChatBouncer";
var jwtAudience = Environment.GetEnvironmentVariable("JWT__Audience") ?? "F-ChatBouncer-Users";

// Authentication
var googleClientId = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID");
var googleClientSecret = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_SECRET");
var requireHttps = securitySettings.GetValue<bool>("RequireHttps");

if (string.IsNullOrEmpty(googleClientId) || string.IsNullOrEmpty(googleClientSecret))
{
    // Google OAuth credentials not set - Google login will not work
}

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
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtAudience,
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
    options.ClientId = googleClientId ?? "";
    options.ClientSecret = googleClientSecret ?? "";
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
        
        static string ToFrontendRedirect(IConfiguration? config, string path)
        {
            var baseUrl = config?["Frontend:BaseUrl"] ?? Environment.GetEnvironmentVariable("FRONTEND_BASE_URL");
            if (string.IsNullOrWhiteSpace(baseUrl)) return path;
            var trimmed = baseUrl.TrimEnd('/');
            return path.StartsWith("/") ? trimmed + path : trimmed + "/" + path;
        }

        // Check if this is a duplicate request without OAuth parameters
        if (!request.Query.ContainsKey("code") && !request.Query.ContainsKey("state"))
        {
            logger.LogWarning("OAuth failure on request without parameters - likely duplicate callback");
            var config = context.HttpContext.RequestServices.GetService<IConfiguration>();
            context.Response.Redirect(ToFrontendRedirect(config, "/"));
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
        var configuration = context.HttpContext.RequestServices.GetService<IConfiguration>();
        context.Response.Redirect(ToFrontendRedirect(configuration, $"/login?error=oauth_failed&message={Uri.EscapeDataString(errorMessage)}"));
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


// Security Services
builder.Services.AddSingleton<IEncryptionService, EncryptionService>();
builder.Services.AddSingleton<ISecretsService, SecretsService>();
builder.Services.AddSingleton<ITokenBlacklistService, RedisTokenBlacklistService>();

// Rate Limiting
builder.Services.AddRateLimitingPolicies();
builder.Services.AddSingleton<SignalRRateLimiter>();

// Custom Services
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IMessageService, MessageService>();
builder.Services.AddScoped<IMessageQueueService, MessageQueueService>();
builder.Services.AddScoped<IProfileService, ProfileService>();
builder.Services.AddScoped<ICharacterService, CharacterService>();
builder.Services.AddScoped<IMemoService, MemoService>();
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
builder.Services.AddSingleton<IFChatService, FChatService>();
builder.Services.AddSingleton<IProfileRateLimiter, ProfileRateLimiter>();
builder.Services.AddSingleton<TicketManager>();

// Profile Queue Services
builder.Services.AddScoped<IProfileQueueService, ProfileQueueService>();
builder.Services.AddHostedService<ProfileQueueProcessor>();

// Background Services
builder.Services.AddHostedService<MetricsCollectionService>();
builder.Services.AddHostedService<AuditLogCleanupService>();
builder.Services.AddHostedService<StreamRetentionService>();
builder.Services.AddHostedService<StreamMonitoringService>();
builder.Services.AddHostedService<PendingEntryListProcessor>();

// HTTP Client for external API calls
builder.Services.AddHttpClient<MemoService>();
builder.Services.AddHttpClient<FListMappingService>();
builder.Services.AddHttpClient<FListCharacterDataService>();
builder.Services.AddHttpClient<FListImageService>();
builder.Services.AddHttpClient<FListTicketManager>();

// F-List API Services
builder.Services.AddScoped<IFListMappingService, FListMappingService>();
builder.Services.AddScoped<IFListCharacterDataService, FListCharacterDataService>();
builder.Services.AddScoped<FListImageService>();
builder.Services.AddSingleton<IFListTicketManager, FListTicketManager>();

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
        var allowedOrigins = new List<string>();
        
        // Check for CORS__AllowedOrigins__0 environment variable (Railway format)
        var corsOrigin0 = Environment.GetEnvironmentVariable("CORS__AllowedOrigins__0");
        if (!string.IsNullOrEmpty(corsOrigin0))
        {
            allowedOrigins.Add(corsOrigin0);
        }
        
        // Fallback to configuration
        if (allowedOrigins.Count == 0)
        {
            var configOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() 
                ?? new[] { "https://fchat.proactiveapathy.com" };
            allowedOrigins.AddRange(configOrigins);
        }
        
        
        options.AddPolicy("AllowClient", policy =>
        {
            policy.WithOrigins(allowedOrigins.ToArray())
                  .WithHeaders("Authorization", "Content-Type", "X-Requested-With", 
                              "x-signalr-user-agent", "x-requested-with", "x-signalr-connection-token")
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
#pragma warning disable ASP0000 // Do not call 'IServiceCollection.BuildServiceProvider' in 'ConfigureServices'
            using var scope = builder.Services.BuildServiceProvider().CreateScope();
#pragma warning restore ASP0000 // Do not call 'IServiceCollection.BuildServiceProvider' in 'ConfigureServices'
            var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
            
            // Test basic connection synchronously
            var canConnect = context.Database.CanConnect();
            if (!canConnect)
            {
                return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Unhealthy("Cannot connect to database");
            }
            
            return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy("Database connection is working");
        }
        catch (Exception ex)
        {
            return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Unhealthy($"Database connection failed: {ex.Message}", ex);
        }
    })
    .AddCheck<RedisHealthCheck>("redis")
    .AddCheck<FChatWebSocketHealthCheck>("fchat_websocket")
    .AddCheck<FListApiHealthCheck>("flist_api");

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

// Add correlation ID middleware early in the pipeline
app.UseCorrelationId();

// Enable Prometheus metrics collection (before UseRouting for accurate metrics)
app.UseHttpMetrics();

app.UseCors("AllowClient");
app.UseRouting();

// Rate limiting (after routing, before authentication)
app.UseRateLimiter();
app.UseRateLimitHeaders();

app.UseCookiePolicy();
app.UseSession();
app.UseAuthentication();

// Token blacklist check (after authentication, before authorization)
app.UseTokenBlacklist();

app.UseAuthorization();

app.MapControllers();
app.MapHub<BouncerHub>("/bouncerHub");

// Add Prometheus metrics endpoint
app.MapMetrics();

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



// Ensure database is created and migrated
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<BouncerDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    
    try
    {
        logger.LogInformation("Ensuring database is created and migrated...");
        await context.Database.MigrateAsync();
        logger.LogInformation("Database migration completed successfully");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "An error occurred while migrating the database");
        throw;
    }
}

app.Run();