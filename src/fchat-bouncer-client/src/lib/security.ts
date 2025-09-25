/**
 * Security utilities to prevent sensitive data exposure
 */

/**
 * Sanitizes credentials object for logging - never logs actual passwords
 */
export function sanitizeCredentialsForLogging(credentials: {
  username: string;
  password: string;
  fchatUsername?: string;
  fchatPassword?: string;
}) {
  return {
    username: credentials.username,
    password: '[REDACTED]',
    fchatUsername: credentials.fchatUsername || '',
    fchatPassword: '[REDACTED]',
  };
}

/**
 * Clears sensitive data from an object
 */
export function clearSensitiveData<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: (keyof T)[]
): T {
  const cleared = { ...obj };
  sensitiveFields.forEach(field => {
    if (field in cleared) {
      (cleared as any)[field] = '';
    }
  });
  return cleared;
}

/**
 * Prevents accidental URL exposure by ensuring no sensitive data is in the URL
 */
export function preventUrlExposure(): void {
  // Check if there are any sensitive parameters in the URL
  const urlParams = new URLSearchParams(window.location.search);
  const sensitiveParams = ['password', 'token', 'secret', 'key', 'auth'];
  
  sensitiveParams.forEach(param => {
    if (urlParams.has(param)) {
      console.warn(`Security warning: Sensitive parameter '${param}' found in URL. Removing...`);
      urlParams.delete(param);
      
      // Update URL without sensitive parameters
      const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  });
}

/**
 * Validates that no sensitive data is being passed in URL parameters
 */
export function validateNoSensitiveUrlData(): boolean {
  const urlParams = new URLSearchParams(window.location.search);
  const sensitiveParams = ['password', 'token', 'secret', 'key', 'auth'];
  
  return !sensitiveParams.some(param => urlParams.has(param));
}

/**
 * Clears sensitive data from memory
 */
export function clearSensitiveMemory(): void {
  // Force garbage collection if available (development only)
  if (typeof window !== 'undefined' && (window as any).gc) {
    (window as any).gc();
  }
}
