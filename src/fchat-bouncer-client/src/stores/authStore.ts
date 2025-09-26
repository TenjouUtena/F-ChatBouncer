import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AuthState, User, Character, Friend } from '@/types';
import { api } from '@/lib/api';
import { useFriendsStore } from './friendsStore';

// Auto-refresh timer
let refreshTimer: NodeJS.Timeout | null = null;

// Function to start auto-refresh timer
function startAutoRefresh(refreshAccessToken: () => Promise<string | null>) {
  // Clear existing timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  // Set timer to refresh token 5 minutes before expiration (55 minutes for 60-minute tokens)
  const refreshInterval = 55 * 60 * 1000; // 55 minutes in milliseconds
  
  refreshTimer = setTimeout(async () => {
    try {
      console.log('Auto-refreshing token...');
      await refreshAccessToken();
      // Restart the timer for the next refresh
      startAutoRefresh(refreshAccessToken);
    } catch (error) {
      console.error('Auto-refresh failed:', error);
      // If auto-refresh fails, the user will be logged out
    }
  }, refreshInterval);
}

// Function to stop auto-refresh timer
function stopAutoRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

interface AuthStore extends AuthState {
  login: (user: User, token: string, refreshToken: string) => void;
  logout: () => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setRefreshToken: (refreshToken: string) => void;
  setAvailableCharacters: (characters: Character[]) => void;
  setChannelsSelected: (selected: boolean) => void;
  setFriendsAndBookmarks: (friends: Friend[], bookmarks: string[], bookmarksWithStatus: Friend[]) => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      availableCharacters: [],
      areChannelsSelected: false,

      login: (user: User, token: string, refreshToken: string) => {
        set({
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          availableCharacters: [],
          areChannelsSelected: false,
        });
        
        // Start auto-refresh timer
        startAutoRefresh(get().refreshAccessToken);
      },

      logout: () => {
        // Stop auto-refresh timer
        stopAutoRefresh();
        
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          availableCharacters: [],
          areChannelsSelected: false,
        });
      },

      setUser: (user: User) => {
        set({ user });
      },

      setToken: (token: string) => {
        set({ token });
      },

      setRefreshToken: (refreshToken: string) => {
        set({ refreshToken });
      },

      setAvailableCharacters: (characters: Character[]) => {
        set({ availableCharacters: characters });
      },

      setChannelsSelected: (selected: boolean) => {
        set({ areChannelsSelected: selected });
      },

      setFriendsAndBookmarks: async (friends: Friend[], bookmarks: string[], bookmarksWithStatus: Friend[]) => {
        // Update the friends store with the new data
        useFriendsStore.getState().setFriends(friends);
        useFriendsStore.getState().setBookmarks(bookmarks);
        useFriendsStore.getState().setBookmarksWithStatus(bookmarksWithStatus);

        // Fetch memos for all friends in the background
        const state = get();
        if (state.token) {
          const { updateFriendMemo } = useFriendsStore.getState();
          
          // Fetch memos for all friends
          const memoPromises = friends.map(async (friend) => {
            try {
              const memoResponse = await api.getMemo(state.token!, friend.name);
              if (memoResponse.hasMemo && memoResponse.memo) {
                updateFriendMemo(friend.name, memoResponse.memo);
              }
            } catch (error) {
              console.warn(`Failed to fetch memo for ${friend.name}:`, error);
            }
          });

          // Also fetch memos for bookmarks with status
          const bookmarkMemoPromises = bookmarksWithStatus.map(async (bookmark) => {
            try {
              const memoResponse = await api.getMemo(state.token!, bookmark.name);
              if (memoResponse.hasMemo && memoResponse.memo) {
                updateFriendMemo(bookmark.name, memoResponse.memo);
              }
            } catch (error) {
              console.warn(`Failed to fetch memo for bookmark ${bookmark.name}:`, error);
            }
          });

          // Execute all memo fetches in parallel
          Promise.all([...memoPromises, ...bookmarkMemoPromises]).catch(error => {
            console.warn('Some memo fetches failed:', error);
          });
        }
      },

      refreshAccessToken: async () => {
        const state = get();
        if (!state.refreshToken || !state.user) {
          console.log('No refresh token or user available for refresh');
          get().logout();
          return null;
        }

        try {
          console.log('Attempting to refresh token...');
          const response = await api.refreshToken(state.user.id, state.refreshToken);
          
          // Update tokens in store
          set({
            token: response.token,
            refreshToken: response.refreshToken
          });
          
          // Restart auto-refresh timer with new token
          startAutoRefresh(get().refreshAccessToken);
          
          console.log('Token refreshed successfully');
          return response.token;
        } catch (error) {
          console.log('Token refresh failed:', error);
          
          // Refresh failed, logout the user
          get().logout();
          
          // Dispatch a custom event to notify components about the logout
          window.dispatchEvent(new CustomEvent('auth:token-expired', {
            detail: { reason: 'Refresh token expired' }
          }));
          
          return null;
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // Start auto-refresh timer if user is already authenticated
        if (state?.isAuthenticated && state?.user && state?.refreshToken) {
          console.log('Restoring session, starting auto-refresh timer');
          startAutoRefresh(state.refreshAccessToken);
        }
      },
    }
  )
);