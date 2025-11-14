namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for retrieving secrets from secure storage (Azure Key Vault, AWS Secrets Manager, etc.)
/// This interface prepares for Phase 2 integration with cloud secret management
/// </summary>
public interface ISecretsService
{
    /// <summary>
    /// Retrieves a secret by name
    /// </summary>
    /// <param name="secretName">Name of the secret to retrieve</param>
    /// <returns>The secret value</returns>
    Task<string> GetSecretAsync(string secretName);
    
    /// <summary>
    /// Retrieves a secret by name, or returns null if not found
    /// </summary>
    /// <param name="secretName">Name of the secret to retrieve</param>
    /// <returns>The secret value or null if not found</returns>
    Task<string?> GetSecretOrDefaultAsync(string secretName);
    
    /// <summary>
    /// Stores or updates a secret
    /// </summary>
    /// <param name="secretName">Name of the secret</param>
    /// <param name="secretValue">Value to store</param>
    Task SetSecretAsync(string secretName, string secretValue);
    
    /// <summary>
    /// Deletes a secret
    /// </summary>
    /// <param name="secretName">Name of the secret to delete</param>
    Task DeleteSecretAsync(string secretName);
    
    /// <summary>
    /// Checks if a secret exists
    /// </summary>
    /// <param name="secretName">Name of the secret to check</param>
    /// <returns>True if the secret exists</returns>
    Task<bool> SecretExistsAsync(string secretName);
    
    /// <summary>
    /// Retrieves the encryption key for the application
    /// </summary>
    /// <returns>The encryption key</returns>
    Task<string> GetEncryptionKeyAsync();
    
    /// <summary>
    /// Retrieves the JWT secret key
    /// </summary>
    /// <returns>The JWT secret key</returns>
    Task<string> GetJwtSecretKeyAsync();
}

