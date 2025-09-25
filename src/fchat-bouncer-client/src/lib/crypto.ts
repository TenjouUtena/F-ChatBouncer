/**
 * Secure credential storage using Web Crypto API
 */

interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
}

/**
 * Generate a cryptographic key from a password
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt sensitive data using AES-GCM
 */
export async function encryptData(plaintext: string, password: string): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate random salt and IV
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt the data
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
    salt: arrayBufferToBase64(salt.buffer),
  };
}

/**
 * Decrypt sensitive data using AES-GCM
 */
export async function decryptData(encryptedData: EncryptedData, password: string): Promise<string> {
  const decoder = new TextDecoder();

  // Convert base64 back to ArrayBuffer
  const encrypted = base64ToArrayBuffer(encryptedData.encrypted);
  const iv = base64ToArrayBuffer(encryptedData.iv);
  const salt = base64ToArrayBuffer(encryptedData.salt);

  // Derive key from password
  const key = await deriveKey(password, new Uint8Array(salt));

  // Decrypt the data
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    encrypted
  );

  return decoder.decode(decrypted);
}

/**
 * Generate a device-specific key for credential encryption
 */
export async function generateDeviceKey(): Promise<string> {
  // Create a device fingerprint from available browser data
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset().toString(),
  ].join('|');

  // Hash the fingerprint to create a consistent key
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);

  return arrayBufferToBase64(hashBuffer);
}

/**
 * Secure storage for encrypted credentials
 */
export class SecureStorage {
  private static readonly STORAGE_KEY = 'fchat-bouncer-encrypted-credentials';
  private deviceKey: string | null = null;

  async initialize(): Promise<void> {
    this.deviceKey = await generateDeviceKey();
  }

  async storeCredentials(credentials: {
    username: string;
    password: string;
    fchatUsername?: string;
    fchatPassword?: string;
  }): Promise<void> {
    if (!this.deviceKey) {
      throw new Error('SecureStorage not initialized');
    }

    const plaintext = JSON.stringify(credentials);
    const encrypted = await encryptData(plaintext, this.deviceKey);

    localStorage.setItem(SecureStorage.STORAGE_KEY, JSON.stringify(encrypted));
  }

  async retrieveCredentials(): Promise<{
    username: string;
    password: string;
    fchatUsername?: string;
    fchatPassword?: string;
  } | null> {
    if (!this.deviceKey) {
      throw new Error('SecureStorage not initialized');
    }

    const storedData = localStorage.getItem(SecureStorage.STORAGE_KEY);
    if (!storedData) {
      return null;
    }

    try {
      const encryptedData: EncryptedData = JSON.parse(storedData);
      const plaintext = await decryptData(encryptedData, this.deviceKey);
      return JSON.parse(plaintext);
    } catch (error) {
      console.error('Failed to decrypt stored credentials:', error);
      // Clear corrupted data
      this.clearCredentials();
      return null;
    }
  }

  clearCredentials(): void {
    localStorage.removeItem(SecureStorage.STORAGE_KEY);
  }

  hasStoredCredentials(): boolean {
    return localStorage.getItem(SecureStorage.STORAGE_KEY) !== null;
  }
}

/**
 * Helper functions for base64 conversion
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Export singleton instance
export const secureStorage = new SecureStorage();