import { create } from 'zustand';
import { characterIndexedDBService, LightweightCharacterData } from '@/lib/characterIndexedDB';
import { LightweightCharacterData as LightweightCharacterDataType } from '@/types';

interface LightweightCharacterIndexedDBStore {
  // In-memory cache for quick access
  characters: Record<string, LightweightCharacterDataType>;
  
  // Methods
  initialize: () => Promise<void>;
  addCharacter: (character: string, gender: string, species: string) => Promise<void>;
  getCharacter: (character: string) => LightweightCharacterDataType | null;
  hasCharacter: (character: string) => boolean;
  updateLastSeen: (character: string) => Promise<void>;
  cleanupOldCharacters: () => Promise<number>;
  getStorageSize: () => number;
  getStorageInfo: () => Promise<{ connections: number; lightweight: number; estimatedSize: number }>;
}

// Storage limits
const MAX_LIGHTWEIGHT_CHARACTERS = 5000;
const CHARACTER_STALE_DAYS = 30; // Remove characters not seen in 30 days

export const useLightweightCharacterIndexedDBStore = create<LightweightCharacterIndexedDBStore>((set, get) => ({
  // Initial state
  characters: {},

  initialize: async () => {
    try {
      await characterIndexedDBService.initialize();
      console.log('Lightweight Character IndexedDB store initialized');
      
      // Load existing lightweight characters
      const characters = await characterIndexedDBService.getAllLightweightCharacters();
      
      const characterMap = characters.reduce((acc, char) => {
        acc[char.character] = {
          character: char.character,
          gender: char.gender,
          species: char.species,
          lastSeen: char.lastSeen
        };
        return acc;
      }, {} as Record<string, LightweightCharacterDataType>);
      
      set({ characters: characterMap });
      console.log(`Loaded ${characters.length} lightweight characters from IndexedDB`);
    } catch (error) {
      console.error('Failed to initialize lightweight character IndexedDB store:', error);
      throw error;
    }
  },

  addCharacter: async (character: string, gender: string, species: string) => {
    try {
      const newCharacterData: LightweightCharacterDataType = {
        character,
        gender,
        species,
        lastSeen: Date.now()
      };
      
      // Store in IndexedDB
      await characterIndexedDBService.storeLightweightCharacter({
        character,
        gender,
        species,
        lastSeen: Date.now()
      });
      
      // Update in-memory cache
      set((state) => ({
        characters: {
          ...state.characters,
          [character]: newCharacterData
        }
      }));
      
      console.log(`Lightweight character stored: ${character}`);
    } catch (error) {
      console.error(`Failed to store lightweight character ${character}:`, error);
      throw error;
    }
  },

  getCharacter: (character: string) => {
    return get().characters[character] || null;
  },

  hasCharacter: (character: string) => {
    return character in get().characters;
  },

  updateLastSeen: async (character: string) => {
    try {
      const characterData = get().characters[character];
      if (!characterData) {
        console.warn(`Cannot update last seen for unknown character: ${character}`);
        return;
      }

      const updatedData = {
        ...characterData,
        lastSeen: Date.now()
      };
      
      // Update in IndexedDB
      await characterIndexedDBService.storeLightweightCharacter({
        character: updatedData.character,
        gender: updatedData.gender,
        species: updatedData.species,
        lastSeen: updatedData.lastSeen
      });
      
      // Update in-memory cache
      set((state) => ({
        characters: {
          ...state.characters,
          [character]: updatedData
        }
      }));
      
      console.log(`Last seen updated for ${character}`);
    } catch (error) {
      console.error(`Failed to update last seen for ${character}:`, error);
      throw error;
    }
  },

  cleanupOldCharacters: async () => {
    try {
      console.log('Performing lightweight character cleanup...');
      
      // Clean up in IndexedDB
      const deletedCount = await characterIndexedDBService.cleanupOldLightweightCharacters(
        CHARACTER_STALE_DAYS * 24 * 60 * 60 * 1000
      );
      
      // Also clean up in-memory cache
      const now = Date.now();
      const staleThreshold = now - (CHARACTER_STALE_DAYS * 24 * 60 * 60 * 1000);
      
      set((state) => {
        const cleanedCharacters = Object.fromEntries(
          Object.entries(state.characters).filter(([, data]) => data.lastSeen > staleThreshold)
        );
        
        return {
          characters: cleanedCharacters
        };
      });
      
      console.log(`Lightweight character cleanup completed. Deleted ${deletedCount} old characters from IndexedDB`);
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old lightweight characters:', error);
      return 0;
    }
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
    try {
      return await characterIndexedDBService.getStorageInfo();
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { connections: 0, lightweight: 0, estimatedSize: 0 };
    }
  }
}));
