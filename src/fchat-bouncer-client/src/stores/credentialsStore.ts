/**
 * Secure credential storage store
 */

import { create } from 'zustand';
import { secureStorage } from '@/lib/crypto';
import { LoginCredentials } from '@/types';

interface CredentialsState {
  isInitialized: boolean;
  hasStoredCredentials: boolean;
  rememberCredentials: boolean;
}

interface CredentialsStore extends CredentialsState {
  initialize: () => Promise<void>;
  storeCredentials: (credentials: LoginCredentials, remember: boolean) => Promise<void>;
  retrieveCredentials: () => Promise<LoginCredentials | null>;
  clearCredentials: () => void;
  setRememberCredentials: (remember: boolean) => void;
}

export const useCredentialsStore = create<CredentialsStore>((set, get) => ({
  isInitialized: false,
  hasStoredCredentials: false,
  rememberCredentials: false,

  initialize: async () => {
    try {
      await secureStorage.initialize();
      const hasStored = secureStorage.hasStoredCredentials();
      set({
        isInitialized: true,
        hasStoredCredentials: hasStored,
        rememberCredentials: hasStored, // If we have stored credentials, user previously chose to remember
      });
    } catch (error) {
      console.error('Failed to initialize secure storage:', error);
      set({ isInitialized: true, hasStoredCredentials: false });
    }
  },

  storeCredentials: async (credentials: LoginCredentials, remember: boolean) => {
    if (!get().isInitialized) {
      throw new Error('Credentials store not initialized');
    }

    if (remember) {
      try {
        await secureStorage.storeCredentials(credentials);
        set({
          hasStoredCredentials: true,
          rememberCredentials: true,
        });
      } catch (error) {
        console.error('Failed to store credentials:', error);
        throw new Error('Failed to store credentials securely');
      }
    } else {
      // User chose not to remember, clear any existing stored credentials
      secureStorage.clearCredentials();
      set({
        hasStoredCredentials: false,
        rememberCredentials: false,
      });
    }
  },

  retrieveCredentials: async (): Promise<LoginCredentials | null> => {
    if (!get().isInitialized || !get().hasStoredCredentials) {
      return null;
    }

    try {
      return await secureStorage.retrieveCredentials();
    } catch (error) {
      console.error('Failed to retrieve credentials:', error);
      // Clear corrupted credentials
      secureStorage.clearCredentials();
      set({ hasStoredCredentials: false, rememberCredentials: false });
      return null;
    }
  },

  clearCredentials: () => {
    secureStorage.clearCredentials();
    set({
      hasStoredCredentials: false,
      rememberCredentials: false,
    });
  },

  setRememberCredentials: (remember: boolean) => {
    set({ rememberCredentials: remember });
  },
}));