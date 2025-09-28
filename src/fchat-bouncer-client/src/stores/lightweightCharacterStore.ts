import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { LightweightCharacterData } from '@/types';

interface LightweightCharacterStore {
  // Lightweight character data (gender + species only)
  characters: Record<string, LightweightCharacterData>;
  
  // Methods
  addCharacter: (character: string, gender: string, species: string) => void;
  getCharacter: (character: string) => LightweightCharacterData | null;
  hasCharacter: (character: string) => boolean;
  updateLastSeen: (character: string) => void;
  cleanupOldCharacters: () => void;
  getStorageSize: () => number;
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
      
      addCharacter: (character: string, gender: string, species: string) => {
        set((state) => {
          // Clean up old characters before adding new one
          const cleanedCharacters = cleanupOldCharacters(state.characters);
          
          const newCharacterData: LightweightCharacterData = {
            character,
            gender,
            species,
            lastSeen: Date.now()
          };
          
          return {
            characters: {
              ...cleanedCharacters,
              [character]: newCharacterData
            }
          };
        });
      },
      
      getCharacter: (character: string) => {
        const state = get();
        return state.characters[character] || null;
      },
      
      hasCharacter: (character: string) => {
        const state = get();
        return character in state.characters;
      },
      
      updateLastSeen: (character: string) => {
        set((state) => {
          const characterData = state.characters[character];
          if (characterData) {
            return {
              characters: {
                ...state.characters,
                [character]: {
                  ...characterData,
                  lastSeen: Date.now()
                }
              }
            };
          }
          return state;
        });
      },
      
      cleanupOldCharacters: () => {
        set((state) => {
          console.log('Performing lightweight character cleanup...');
          const cleanedCharacters = cleanupOldCharacters(state.characters);
          
          console.log(`Lightweight character cleanup completed. Characters: ${Object.keys(state.characters).length} -> ${Object.keys(cleanedCharacters).length}`);
          
          return {
            ...state,
            characters: cleanedCharacters
          };
        });
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
        characters: state.characters
      })
    }
  )
);
