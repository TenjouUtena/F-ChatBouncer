namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for encrypting and decrypting sensitive data using AES-256-GCM
/// </summary>
public interface IEncryptionService
{
    /// <summary>
    /// Encrypts a plain text string
    /// </summary>
    /// <param name="plainText">The text to encrypt</param>
    /// <returns>Base64-encoded encrypted data with nonce and tag</returns>
    string Encrypt(string plainText);
    
    /// <summary>
    /// Decrypts an encrypted string
    /// </summary>
    /// <param name="encryptedText">Base64-encoded encrypted data</param>
    /// <returns>The decrypted plain text</returns>
    string Decrypt(string encryptedText);
    
    /// <summary>
    /// Encrypts credentials (username:password format)
    /// </summary>
    /// <param name="username">Username</param>
    /// <param name="password">Password</param>
    /// <returns>Base64-encoded encrypted credentials</returns>
    string EncryptCredentials(string username, string password);
    
    /// <summary>
    /// Decrypts credentials and returns tuple of (username, password)
    /// </summary>
    /// <param name="encryptedCredentials">Base64-encoded encrypted credentials</param>
    /// <returns>Tuple of (username, password)</returns>
    (string Username, string Password) DecryptCredentials(string encryptedCredentials);
    
    /// <summary>
    /// Validates that encrypted data can be decrypted (integrity check)
    /// </summary>
    /// <param name="encryptedText">Base64-encoded encrypted data</param>
    /// <returns>True if data is valid and can be decrypted</returns>
    bool ValidateEncryptedData(string encryptedText);
}

