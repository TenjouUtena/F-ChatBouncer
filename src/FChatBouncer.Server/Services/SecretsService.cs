namespace FChatBouncer.Server.Services;

/// <summary>
/// Default implementation of ISecretsService that reads from environment variables and configuration
/// This will be replaced with Azure Key Vault or AWS Secrets Manager in Phase 2
/// </summary>
public class SecretsService : ISecretsService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<SecretsService> _logger;

    public SecretsService(IConfiguration configuration, ILogger<SecretsService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public Task<string> GetSecretAsync(string secretName)
    {
        var secret = GetSecretInternal(secretName);
        if (string.IsNullOrEmpty(secret))
        {
            _logger.LogError("Secret '{SecretName}' not found", secretName);
            throw new InvalidOperationException($"Secret '{secretName}' not found");
        }
        return Task.FromResult(secret);
    }

    public Task<string?> GetSecretOrDefaultAsync(string secretName)
    {
        var secret = GetSecretInternal(secretName);
        return Task.FromResult(secret);
    }

    public Task SetSecretAsync(string secretName, string secretValue)
    {
        // For now, this is not supported (environment variables are read-only)
        _logger.LogWarning("SetSecretAsync called but not supported in current implementation");
        throw new NotSupportedException("SetSecret is not supported in environment variable mode. Use Azure Key Vault or AWS Secrets Manager.");
    }

    public Task DeleteSecretAsync(string secretName)
    {
        // For now, this is not supported (environment variables are read-only)
        _logger.LogWarning("DeleteSecretAsync called but not supported in current implementation");
        throw new NotSupportedException("DeleteSecret is not supported in environment variable mode. Use Azure Key Vault or AWS Secrets Manager.");
    }

    public Task<bool> SecretExistsAsync(string secretName)
    {
        var secret = GetSecretInternal(secretName);
        return Task.FromResult(!string.IsNullOrEmpty(secret));
    }

    public async Task<string> GetEncryptionKeyAsync()
    {
        return await GetSecretAsync("ENCRYPTION_KEY");
    }

    public async Task<string> GetJwtSecretKeyAsync()
    {
        return await GetSecretAsync("JWT__SecretKey");
    }

    private string? GetSecretInternal(string secretName)
    {
        // Try environment variable first
        var envValue = Environment.GetEnvironmentVariable(secretName);
        if (!string.IsNullOrEmpty(envValue))
        {
            _logger.LogDebug("Retrieved secret '{SecretName}' from environment variable", secretName);
            return envValue;
        }

        // Try configuration (appsettings.json)
        // Support both flat and nested keys (e.g., "JWT__SecretKey" -> "JWT:SecretKey")
        var configKey = secretName.Replace("__", ":");
        var configValue = _configuration[configKey];
        if (!string.IsNullOrEmpty(configValue))
        {
            _logger.LogDebug("Retrieved secret '{SecretName}' from configuration", secretName);
            return configValue;
        }

        _logger.LogDebug("Secret '{SecretName}' not found", secretName);
        return null;
    }
}

