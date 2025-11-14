using System.Security.Cryptography;
using System.Text;
using FChatBouncer.Server.Configuration;

namespace FChatBouncer.Server.Services;

/// <summary>
/// Service for encrypting and decrypting sensitive data using AES-256-GCM
/// Provides authenticated encryption with associated data (AEAD)
/// </summary>
public class EncryptionService : IEncryptionService
{
    private readonly byte[] _key;
    private readonly ILogger<EncryptionService> _logger;
    private const int NonceSize = 12; // 96 bits recommended for AES-GCM
    private const int TagSize = 16; // 128 bits authentication tag

    public EncryptionService(IConfiguration configuration, ILogger<EncryptionService> logger)
    {
        _logger = logger;
        
        // Get encryption key from environment variable or configuration
        var encryptionKey = Environment.GetEnvironmentVariable("ENCRYPTION_KEY")
            ?? configuration.GetValue<string>("Security:EncryptionKey");
        
        if (string.IsNullOrEmpty(encryptionKey))
        {
            _logger.LogWarning("ENCRYPTION_KEY not set, generating temporary key (NOT FOR PRODUCTION)");
            // Generate a temporary key for development
            _key = new byte[32]; // 256 bits
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(_key);
            _logger.LogWarning("Generated temporary encryption key: {Key}", Convert.ToBase64String(_key));
        }
        else
        {
            try
            {
                // Try to decode as base64 first
                _key = Convert.FromBase64String(encryptionKey);
                if (_key.Length != 32)
                {
                    throw new InvalidOperationException("Encryption key must be 32 bytes (256 bits)");
                }
            }
            catch (FormatException)
            {
                // If not base64, use the string itself and hash it to get 32 bytes
                _logger.LogWarning("Encryption key is not valid base64, deriving key from string");
                using var sha256 = SHA256.Create();
                _key = sha256.ComputeHash(Encoding.UTF8.GetBytes(encryptionKey));
            }
        }
    }

    public string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText))
            throw new ArgumentNullException(nameof(plainText));

        try
        {
            var plainBytes = Encoding.UTF8.GetBytes(plainText);
            
            // Generate random nonce
            var nonce = new byte[NonceSize];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(nonce);
            }
            
            // Prepare buffers
            var ciphertext = new byte[plainBytes.Length];
            var tag = new byte[TagSize];
            
            // Encrypt using AES-GCM
            using (var aesGcm = new AesGcm(_key, TagSize))
            {
                aesGcm.Encrypt(nonce, plainBytes, ciphertext, tag);
            }
            
            // Combine nonce + tag + ciphertext
            var result = new byte[NonceSize + TagSize + ciphertext.Length];
            Buffer.BlockCopy(nonce, 0, result, 0, NonceSize);
            Buffer.BlockCopy(tag, 0, result, NonceSize, TagSize);
            Buffer.BlockCopy(ciphertext, 0, result, NonceSize + TagSize, ciphertext.Length);
            
            return Convert.ToBase64String(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to encrypt data");
            throw new CryptographicException("Encryption failed", ex);
        }
    }

    public string Decrypt(string encryptedText)
    {
        if (string.IsNullOrEmpty(encryptedText))
            throw new ArgumentNullException(nameof(encryptedText));

        try
        {
            var encryptedBytes = Convert.FromBase64String(encryptedText);
            
            if (encryptedBytes.Length < NonceSize + TagSize)
                throw new CryptographicException("Invalid encrypted data format");
            
            // Extract nonce, tag, and ciphertext
            var nonce = new byte[NonceSize];
            var tag = new byte[TagSize];
            var ciphertext = new byte[encryptedBytes.Length - NonceSize - TagSize];
            
            Buffer.BlockCopy(encryptedBytes, 0, nonce, 0, NonceSize);
            Buffer.BlockCopy(encryptedBytes, NonceSize, tag, 0, TagSize);
            Buffer.BlockCopy(encryptedBytes, NonceSize + TagSize, ciphertext, 0, ciphertext.Length);
            
            // Decrypt using AES-GCM
            var plainBytes = new byte[ciphertext.Length];
            using (var aesGcm = new AesGcm(_key, TagSize))
            {
                aesGcm.Decrypt(nonce, ciphertext, tag, plainBytes);
            }
            
            return Encoding.UTF8.GetString(plainBytes);
        }
        catch (CryptographicException ex)
        {
            _logger.LogError(ex, "Failed to decrypt data - data may be corrupted or key is incorrect");
            throw new CryptographicException("Decryption failed - data may be corrupted or key is incorrect", ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decrypt data");
            throw new CryptographicException("Decryption failed", ex);
        }
    }

    public string EncryptCredentials(string username, string password)
    {
        if (string.IsNullOrEmpty(username))
            throw new ArgumentNullException(nameof(username));
        if (string.IsNullOrEmpty(password))
            throw new ArgumentNullException(nameof(password));

        var credentials = $"{username}:{password}";
        return Encrypt(credentials);
    }

    public (string Username, string Password) DecryptCredentials(string encryptedCredentials)
    {
        if (string.IsNullOrEmpty(encryptedCredentials))
            throw new ArgumentNullException(nameof(encryptedCredentials));

        var decrypted = Decrypt(encryptedCredentials);
        var parts = decrypted.Split(':', 2);
        
        if (parts.Length != 2)
            throw new CryptographicException("Invalid credential format");
        
        return (parts[0], parts[1]);
    }

    public bool ValidateEncryptedData(string encryptedText)
    {
        if (string.IsNullOrEmpty(encryptedText))
            return false;

        try
        {
            Decrypt(encryptedText);
            return true;
        }
        catch
        {
            return false;
        }
    }
}

