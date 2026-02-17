import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { LightweightCharacterData } from '@/types';
import { useLightweightCharacterIndexedDBStore } from './lightweightCharacterIndexedDBStore';

interface LightweightCharacterStore {
  // Lightweight character data (gender + species only) - now delegated to IndexedDB store
  characters: Record<string, LightweightCharacterData>;
  
  // Methods - now delegated to IndexedDB store
  initialize: () => Promise<void>;
  addCharacter: (character: string, gender: string, species: string) => Promise<void>;
  getCharacter: (character: string) => LightweightCharacterData | null;
  hasCharacter: (character: string) => boolean;
  updateLastSeen: (character: string) => Promise<void>;
  updateStatus: (character: string, status: 'online' | 'looking' | 'busy' | 'away' | 'dnd' | 'offline', statusMessage?: string) => Promise<void>;
  cleanupOldCharacters: () => Promise<number>;
  getStorageSize: () => number;
  getStorageInfo: () => Promise<{ connections: number; lightweight: number; estimatedSize: number }>;
}

// Storage limits
const MAX_LIGHTWEIGHT_CHARACTERS = 5000;
const CHARACTER_STALE_DAYS = 30; // Remove characters not seen in 30 days

function cleanupOldCharacters(characters: Record<string, LightweightCharacterData>): Record<string, LightweightCharacterData> {
  const characterEntries = Object.entries(characters);
  
  if (characterEntries.length <= MAX_LIGHTWEIGHT_CHARACTERS) {
    return characters;
  }
  
  const now = Date.now();
  const staleThreshold = now - (CHARACTER_STALE_DAYS * 24 * 60 * 60 * 1000);
  
  // Filter out stale characters first
  const activeCharacters = characterEntries.filter(([, data]) => data.lastSeen > staleThreshold);
  
  // If still over limit, remove oldest
  if (activeCharacters.length > MAX_LIGHTWEIGHT_CHARACTERS) {
    const sortedCharacters = activeCharacters.sort(([, a], [, b]) => a.lastSeen - b.lastSeen);
    const charactersToKeep = sortedCharacters.slice(-MAX_LIGHTWEIGHT_CHARACTERS);
    
    console.log(`Cleaned up ${activeCharacters.length - MAX_LIGHTWEIGHT_CHARACTERS} old lightweight characters`);
    return Object.fromEntries(charactersToKeep);
  }
  
  const removedCount = characterEntries.length - activeCharacters.length;
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} stale lightweight characters`);
  }
  
  return Object.fromEntries(activeCharacters);
}

function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.code === DOMException.QUOTA_EXCEEDED_ERR) {
      console.warn('localStorage quota exceeded for lightweight characters, attempting cleanup...');
      
      // Try to free up space by removing old data
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const currentKey = localStorage.key(i);
        if (currentKey && currentKey !== key && currentKey.startsWith('character-gender-cache')) {
          keysToRemove.push(currentKey);
        }
      }
      
      // Remove old storage entries
      keysToRemove.forEach(k => localStorage.removeItem(k));
      
      try {
        localStorage.setItem(key, value);
        console.log('Successfully stored lightweight characters after cleanup');
        return true;
      } catch (retryError) {
        console.error('Still unable to store lightweight characters after cleanup:', retryError);
        return false;
      }
    }
    console.error('localStorage error for lightweight characters:', error);
    return false;
  }
}

export const useLightweightCharacterStore = create<LightweightCharacterStore>()(
  persist(
    (set, get) => ({
      characters: {},
      
      // Actions - now delegated to IndexedDB store
      initialize: async () => {
        try {
          const indexedDBStore = useLightweightCharacterIndexedDBStore.getState();
          await indexedDBStore.initialize();
          
          // Sync state from IndexedDB store
          const indexedDBState = indexedDBStore;
          set({
            characters: indexedDBState.characters
          });
        } catch (error) {
          console.error('Failed to initialize lightweight character store:', error);
          throw error;
        }
      },
      
      addCharacter: async (character: string, gender: string, species: string) => {
        const indexedDBStore = useLightweightCharacterIndexedDBStore.getState();
        await indexedDBStore.addCharacter(character, gender, species);
        
        // Sync state
        const indexedDBState = indexedDBStore;
        set({
          characters: indexedDBState.characters
        });
      },
      
      getCharacter: (character: string) => {
        return get().characters[character] || null;
      },
      
      hasCharacter: (character: string) => {
        return character in get().characters;
      },
      
      updateLastSeen: async (character: string) => {
        const indexedDBStore = useLightweightCharacterIndexedDBStore.getState();
        await indexedDBStore.updateLastSeen(character);
        
        // Sync state
        const indexedDBState = indexedDBStore;
        set({
          characters: indexedDBState.characters
        });
      },
      
      updateStatus: async (character: string, status: 'online' | 'looking' | 'busy' | 'away' | 'dnd' | 'offline', statusMessage?: string) => {
        const indexedDBStore = useLightweightCharacterIndexedDBStore.getState();
        await indexedDBStore.updateStatus(character, status, statusMessage);
        
        // Sync state
        const indexedDBState = indexedDBStore;
        set({
          characters: indexedDBState.characters
        });
      },
      
      cleanupOldCharacters: async () => {
        const indexedDBStore = useLightweightCharacterIndexedDBStore.getState();
        const deletedCount = await indexedDBStore.cleanupOldCharacters();
        
        // Sync state
        const indexedDBState = indexedDBStore;
        set({
          characters: indexedDBState.characters
        });
        
        return deletedCount;
      },
      
      getStorageSize: () => {
        try {
          const currentState = get();
          const data = { characters: currentState.characters };
          return new Blob([JSON.stringify(data)]).size;
        } catch (error) {
          console.error('Error calculating lightweight character storage size:', error);
          return 0;
        }
      },

      getStorageInfo: async () => {
        const indexedDBStore = useLightweightCharacterIndexedDBStore.getState();
        return await indexedDBStore.getStorageInfo();
      }
    }),
    {
      name: 'character-gender-cache',
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            if (typeof window === 'undefined') return null;
            return localStorage.getItem(name);
          } catch (error) {
            console.error('Error reading lightweight characters from localStorage:', error);
            return null;
          }
        },
        setItem: (name: string, value: string) => {
          if (typeof window !== 'undefined') {
            safeSetItem(name, value);
          }
        },
        removeItem: (name: string) => {
          try {
            if (typeof window !== 'undefined') {
              localStorage.removeItem(name);
            }
          } catch (error) {
            console.error('Error removing lightweight characters from localStorage:', error);
          }
        }
      })),
      partialize: (state) => ({
        // Note: lightweight characters are now stored in IndexedDB, not localStorage
        // Only keep minimal state for backward compatibility
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Initialize IndexedDB store after rehydration
          const indexedDBStore = useLightweightCharacterIndexedDBStore.getState();
          indexedDBStore.initialize().catch(error => {
            console.error('Failed to initialize lightweight character IndexedDB store after rehydration:', error);
          });
        }
      }
    }
  )
);
