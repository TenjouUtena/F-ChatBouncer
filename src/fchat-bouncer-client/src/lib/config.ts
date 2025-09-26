/**
 * Application configuration
 * Centralized configuration for API URLs and other settings
 */

interface AppConfig {
  apiUrl: string;
  signalRUrl: string;
  environment: 'development' | 'production';
}

/**
 * Get the API base URL based on environment
 */
function getApiUrl(): string {
  // Check for environment variable first (production)
  const envApiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envApiUrl) {
    return envApiUrl;
  }
  
  // Development fallback
  return 'http://localhost:5001';
}

/**
 * Get the SignalR hub URL based on environment
 */
function getSignalRUrl(): string {
  const apiUrl = getApiUrl();
  
  // If it's a full URL, use it directly
  if (apiUrl.startsWith('http')) {
    return `${apiUrl}/bouncerHub`;
  }
  
  // Development fallback
  return 'http://localhost:5001/bouncerHub';
}

/**
 * Get the current environment
 */
function getEnvironment(): 'development' | 'production' {
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }
  return 'development';
}

/**
 * Application configuration object
 */
export const config: AppConfig = {
  apiUrl: getApiUrl(),
  signalRUrl: getSignalRUrl(),
  environment: getEnvironment(),
};

/**
 * Check if running in development mode
 */
export const isDevelopment = config.environment === 'development';

/**
 * Check if running in production mode
 */
export const isProduction = config.environment === 'production';

/**
 * Get API endpoint URL
 */
export function getApiEndpoint(endpoint: string): string {
  return `${config.apiUrl}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}


export default config;
