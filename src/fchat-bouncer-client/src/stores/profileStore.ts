import { create } from 'zustand';
import { ProfileData } from '@/types';
import { indexedDBService } from '@/lib/indexeddb';
import { ProfileMigration } from '@/lib/profileMigration';

interface ProfileStore {
  // In-memory cache for quick access
  profiles: Record<string, ProfileData>;
  profileRequestStatus: Record<string, 'idle' | 'requesting' | 'failed' | 'success'>;
  profileLastRequested: Record<string, number>;
  isIndexedDBAvailable: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  addProfile: (characterName: string, profileData: ProfileData) => Promise<void>;
  getProfile: (characterName: string) => Promise<ProfileData | null>;
  hasProfile: (characterName: string) => Promise<boolean>;
  deleteProfile: (characterName: string) => Promise<void>;
  clearAllProfiles: () => Promise<void>;
  getProfileRequestStatus: (characterName: string) => 'idle' | 'requesting' | 'failed' | 'success';
  setProfileRequestStatus: (characterName: string, status: 'idle' | 'requesting' | 'failed' | 'success') => void;
  isProfileStale: (characterName: string) => boolean;
  getStorageInfo: () => Promise<{ count: number; estimatedSize: number }>;
  cleanupOldProfiles: (maxAge?: number) => Promise<number>;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  // Initial state
  profiles: {},
  profileRequestStatus: {},
  profileLastRequested: {},
  isIndexedDBAvailable: false,

  initialize: async () => {
    try {
      await indexedDBService.initialize();
      set({ isIndexedDBAvailable: true });
      console.log('Profile store initialized with IndexedDB');
      
      // Check for and migrate legacy profiles
      const hasLegacy = await ProfileMigration.hasLegacyProfiles();
      if (hasLegacy) {
        console.log('Found legacy profiles, starting migration...');
        const result = await ProfileMigration.migrateProfiles();
        console.log(`Migration completed: ${result.migrated} profiles migrated, ${result.errors} errors`);
      }
    } catch (error) {
      console.error('Failed to initialize profile store with IndexedDB:', error);
      set({ isIndexedDBAvailable: false });
      console.warn('Profile store will operate in memory-only mode');
      // Don't throw error - allow the store to continue with limited functionality
    }
  },

  addProfile: async (characterName: string, profileData: ProfileData) => {
    try {
      // Store in IndexedDB if available
      if (get().isIndexedDBAvailable) {
        await indexedDBService.storeProfile(characterName, profileData, 'FULL');
      }
      
      // Always update in-memory cache
      set((state) => ({
        profiles: {
          ...state.profiles,
          [characterName]: profileData
        },
        profileRequestStatus: {
          ...state.profileRequestStatus,
          [characterName]: 'success'
        },
        profileLastRequested: {
          ...state.profileLastRequested,
          [characterName]: Date.now()
        }
      }));
      
      console.log(`Profile stored for ${characterName}${get().isIndexedDBAvailable ? ' (IndexedDB)' : ' (memory only)'}`);
    } catch (error) {
      console.error(`Failed to store profile for ${characterName}:`, error);
      throw error;
    }
  },

  getProfile: async (characterName: string) => {
    try {
      // First check in-memory cache
      const cachedProfile = get().profiles[characterName];
      if (cachedProfile) {
        return cachedProfile;
      }

      // If not in cache and IndexedDB is available, try to load from IndexedDB
      if (get().isIndexedDBAvailable) {
        const profileData = await indexedDBService.getProfile(characterName, 'FULL');
        if (profileData) {
          // Update cache
          set((state) => ({
            profiles: {
              ...state.profiles,
              [characterName]: profileData
            }
          }));
          return profileData;
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get profile for ${characterName}:`, error);
      return null;
    }
  },

  hasProfile: async (characterName: string) => {
    // Check cache first
    if (characterName in get().profiles) {
      return true;
    }

    // Check IndexedDB if available
    if (get().isIndexedDBAvailable) {
      try {
        return await indexedDBService.hasProfile(characterName, 'FULL');
      } catch (error) {
        console.error(`Failed to check if profile exists for ${characterName}:`, error);
        return false;
      }
    }

    return false;
  },

  deleteProfile: async (characterName: string) => {
    try {
      // Remove from IndexedDB if available
      if (get().isIndexedDBAvailable) {
        await indexedDBService.deleteProfile(characterName, 'FULL');
      }
      
      // Remove from cache
      set((state) => {
        const newProfiles = { ...state.profiles };
        delete newProfiles[characterName];
        
        const newStatus = { ...state.profileRequestStatus };
        delete newStatus[characterName];
        
        const newLastRequested = { ...state.profileLastRequested };
        delete newLastRequested[characterName];
        
        return {
          profiles: newProfiles,
          profileRequestStatus: newStatus,
          profileLastRequested: newLastRequested
        };
      });
      
      console.log(`Profile deleted for ${characterName}${get().isIndexedDBAvailable ? ' (IndexedDB)' : ' (memory only)'}`);
    } catch (error) {
      console.error(`Failed to delete profile for ${characterName}:`, error);
      throw error;
    }
  },

  clearAllProfiles: async () => {
    try {
      // Clear IndexedDB if available
      if (get().isIndexedDBAvailable) {
        await indexedDBService.clearAllProfiles();
      }
      
      // Clear cache
      set({
        profiles: {},
        profileRequestStatus: {},
        profileLastRequested: {}
      });
      
      console.log(`All profiles cleared${get().isIndexedDBAvailable ? ' (IndexedDB)' : ' (memory only)'}`);
    } catch (error) {
      console.error('Failed to clear all profiles:', error);
      throw error;
    }
  },

  getProfileRequestStatus: (characterName: string) => {
    return get().profileRequestStatus[characterName] || 'idle';
  },

  setProfileRequestStatus: (characterName: string, status: 'idle' | 'requesting' | 'failed' | 'success') => {
    set((state) => ({
      profileRequestStatus: {
        ...state.profileRequestStatus,
        [characterName]: status
      }
    }));
  },

  isProfileStale: (characterName: string) => {
    const lastRequested = get().profileLastRequested[characterName];
    if (!lastRequested) return true;
    
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    return Date.now() - lastRequested > maxAge;
  },

  getStorageInfo: async () => {
    try {
      if (get().isIndexedDBAvailable) {
        return await indexedDBService.getStorageInfo();
      } else {
        // Return memory-only stats
        const profiles = get().profiles;
        const count = Object.keys(profiles).length;
        const estimatedSize = JSON.stringify(profiles).length;
        return { count, estimatedSize };
      }
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { count: 0, estimatedSize: 0 };
    }
  },

  cleanupOldProfiles: async (maxAge?: number) => {
    try {
      let deletedCount = 0;
      
      if (get().isIndexedDBAvailable) {
        deletedCount = await indexedDBService.cleanupOldProfiles(maxAge);
      }
      
      // Also clean up cache for deleted profiles
      const cutoffTime = Date.now() - (maxAge || 30 * 24 * 60 * 60 * 1000);
      set((state) => {
        const newProfiles = { ...state.profiles };
        const newStatus = { ...state.profileRequestStatus };
        const newLastRequested = { ...state.profileLastRequested };
        
        Object.keys(newProfiles).forEach(characterName => {
          const lastRequested = newLastRequested[characterName];
          if (lastRequested && lastRequested < cutoffTime) {
            delete newProfiles[characterName];
            delete newStatus[characterName];
            delete newLastRequested[characterName];
            deletedCount++;
          }
        });
        
        return {
          profiles: newProfiles,
          profileRequestStatus: newStatus,
          profileLastRequested: newLastRequested
        };
      });
      
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old profiles:', error);
      return 0;
    }
  }
}));
