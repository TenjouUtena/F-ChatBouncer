import { LoginCredentials, User, Character, ProfileResponse, Friend, FChatCredentialsRequest } from '@/types';
import { sanitizeCredentialsForLogging } from '@/lib/security';
import { config } from '@/lib/config';

const API_BASE = config.apiUrl + '/api';

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface RefreshResponse {
  token: string;
  refreshToken: string;
}

export interface CharacterListResponse {
  characters: Character[];
}

export interface FriendsResponse {
  friends: Friend[];
  bookmarks: string[];
  bookmarksWithStatus: Friend[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Token refresh callback type
type TokenRefreshCallback = () => Promise<string | null>;

// Global token refresh callback - will be set by auth store
let tokenRefreshCallback: TokenRefreshCallback | null = null;
let isRefreshing = false;

export function setTokenRefreshCallback(callback: TokenRefreshCallback) {
  tokenRefreshCallback = callback;
}

async function fetchWithError(url: string, options?: RequestInit, retryCount: number = 0): Promise<Response> {
  const maxRetries = 2;
  
  try {
    const response = await fetch(url, options);

    // Handle 401 Unauthorized - try to refresh token
    if (response.status === 401 && tokenRefreshCallback && retryCount < maxRetries && !isRefreshing) {
      console.log('Token expired, attempting refresh...');
      isRefreshing = true;
      
      try {
        const newToken = await tokenRefreshCallback();
        
        if (newToken && options?.headers) {
          // Retry with new token
          const newOptions = {
            ...options,
            headers: {
              ...options.headers,
              'Authorization': `Bearer ${newToken}`
            }
          };
          
          console.log('Retrying request with refreshed token...');
          return fetchWithError(url, newOptions, retryCount + 1);
        } else {
          console.error('Token refresh failed - user will be logged out');
          throw new ApiError(401, 'Session expired - please log in again');
        }
      } finally {
        isRefreshing = false;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText || `HTTP ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error');
  }
}

export const api = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    // Create a sanitized copy for logging (never log actual passwords)
    const sanitizedCredentials = sanitizeCredentialsForLogging(credentials);
    
    console.log('Attempting login for user:', sanitizedCredentials.username);
    
    const response = await fetchWithError(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    return response.json();
  },

  async googleLogin(): Promise<void> {
    // Redirect to Google OAuth
    window.location.href = `${API_BASE}/auth/google`;
  },

  async updateFChatCredentials(token: string, credentials: FChatCredentialsRequest): Promise<void> {
    await fetchWithError(`${API_BASE}/auth/update-fchat-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(credentials),
    });
  },

  async register(credentials: LoginCredentials): Promise<LoginResponse> {
    // Create a sanitized copy for logging (never log actual passwords)
    const sanitizedCredentials = sanitizeCredentialsForLogging(credentials);
    
    console.log('Attempting registration for user:', sanitizedCredentials.username);
    
    const response = await fetchWithError(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    return response.json();
  },

  async getStatus(token: string): Promise<any> {
    const response = await fetchWithError(`${API_BASE}/user/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.json();
  },

  async refreshToken(userId: string, refreshToken: string): Promise<RefreshResponse> {
    const response = await fetchWithError(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, refreshToken }),
    });

    return response.json();
  },

  async getCharacters(token: string): Promise<CharacterListResponse> {
    const response = await fetchWithError(`${API_BASE}/fchat/characters`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.json();
  },

  async selectCharacter(token: string, characterName: string): Promise<void> {
    await fetchWithError(`${API_BASE}/fchat/character/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ characterName }),
    });
  },

  async getProfile(token: string, characterName: string, allowStale: boolean = true): Promise<ProfileResponse> {
    const response = await fetchWithError(`${API_BASE}/fchat/profile/${encodeURIComponent(characterName)}?allowStale=${allowStale}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.json();
  },

  async getProfileWithRetry(token: string, characterName: string, allowStale: boolean = true, maxRetries: number = 3): Promise<ProfileResponse> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.getProfile(token, characterName, allowStale);
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a rate limiting error (server now returns 429 for rate limiting)
        const isRateLimited = error instanceof ApiError && 
          (error.status === 429 || (error.status === 500 && error.message.includes('Rate limited')));
        
        // If it's a rate limit error or server error (5xx), retry with exponential backoff
        if (error instanceof ApiError && (error.status === 429 || error.status >= 500 || isRateLimited)) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          
          if (isRateLimited) {
            console.log(`Profile request rate limited (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
          } else {
            console.log(`Profile request failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
          }
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // For other errors (like 401), don't retry
        throw error;
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  },

  async requestProfile(token: string, characterName: string): Promise<void> {
    await fetchWithError(`${API_BASE}/fchat/profile/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ characterName }),
    });
  },

  async getFriends(token: string): Promise<FriendsResponse> {
    const response = await fetchWithError(`${API_BASE}/fchat/friends`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.json();
  },

  // Character Diagnostic API methods
  async getCharacterDiagnostic(token: string, characterName: string): Promise<any> {
    const response = await fetchWithError(`${API_BASE}/character/diagnostic/${encodeURIComponent(characterName)}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.json();
  },

  async searchCharactersDiagnostic(token: string, query: string, limit: number = 50): Promise<any> {
    const response = await fetchWithError(`${API_BASE}/character/diagnostic/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.json();
  },

  async getCharacterStats(token: string): Promise<any> {
    const response = await fetchWithError(`${API_BASE}/character/diagnostic/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.json();
  },

  async requestProfileManually(token: string, characterName: string): Promise<any> {
    const response = await fetchWithError(`${API_BASE}/character/diagnostic/request-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ characterName }),
    });

    return response.json();
  },

  async searchCharacters(token: string, searchCriteria: any): Promise<void> {
    await fetchWithError(`${API_BASE}/fchat/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(searchCriteria),
    });
  },

  async addBookmark(token: string, characterName: string): Promise<void> {
    await fetchWithError(`${API_BASE}/fchat/bookmark/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ characterName }),
    });
  },

  async removeBookmark(token: string, characterName: string): Promise<void> {
    await fetchWithError(`${API_BASE}/fchat/bookmark/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ characterName }),
    });
  },

  // Logs API methods
  async getCharactersWithLogs(token: string): Promise<any> {
    const response = await fetchWithError(`${API_BASE}/logs/characters`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  async getChannelsWithLogs(token: string): Promise<any> {
    const response = await fetchWithError(`${API_BASE}/logs/channels`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  async getCharacterLogs(token: string, characterName: string, since?: string, until?: string, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (since) params.append('since', since);
    if (until) params.append('until', until);
    if (limit) params.append('limit', limit.toString());
    
    const response = await fetchWithError(`${API_BASE}/logs/character/${encodeURIComponent(characterName)}?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  async getChannelLogs(token: string, channelName: string, since?: string, until?: string, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (since) params.append('since', since);
    if (until) params.append('until', until);
    if (limit) params.append('limit', limit.toString());
    
    const response = await fetchWithError(`${API_BASE}/logs/channel/${encodeURIComponent(channelName)}?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  async searchLogs(token: string, characterName?: string, channelName?: string, content?: string, messageType?: string, since?: string, until?: string, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (characterName) params.append('characterName', characterName);
    if (channelName) params.append('channelName', channelName);
    if (content) params.append('content', content);
    if (messageType) params.append('messageType', messageType);
    if (since) params.append('since', since);
    if (until) params.append('until', until);
    if (limit) params.append('limit', limit.toString());
    
    const response = await fetchWithError(`${API_BASE}/logs/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },
};