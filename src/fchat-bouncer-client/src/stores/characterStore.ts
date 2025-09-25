import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CharacterConnection {
  characterName: string;
  isConnected: boolean;
  isActive: boolean;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: string;
  connectedAt: string;
  fchatUsername?: string;
}

interface CharacterStore {
  // State
  connections: CharacterConnection[];
  activeCharacter: string | null;
  connectionStatus: Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>;
  
  // Actions
  addConnection: (connection: CharacterConnection) => void;
  removeConnection: (characterName: string) => void;
  updateConnection: (characterName: string, updates: Partial<CharacterConnection>) => void;
  setActiveCharacter: (characterName: string) => void;
  clearActiveCharacter: () => void;
  updateConnectionStatus: (characterName: string, status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  setConnections: (connections: CharacterConnection[]) => void;
  getConnection: (characterName: string) => CharacterConnection | null;
  getActiveConnection: () => CharacterConnection | null;
  isCharacterConnected: (characterName: string) => boolean;
  getConnectedCharacters: () => CharacterConnection[];
  clearAllConnections: () => void;
}

export const useCharacterStore = create<CharacterStore>()(
  persist(
    (set, get) => ({
      // Initial state
      connections: [],
      activeCharacter: null,
      connectionStatus: {},

      // Actions
      addConnection: (connection: CharacterConnection) => {
        set((state) => ({
          connections: [...state.connections.filter(c => c.characterName !== connection.characterName), connection],
          connectionStatus: {
            ...state.connectionStatus,
            [connection.characterName]: connection.status
          }
        }));
      },

      removeConnection: (characterName: string) => {
        set((state) => {
          const newConnections = state.connections.filter(c => c.characterName !== characterName);
          const newConnectionStatus = { ...state.connectionStatus };
          delete newConnectionStatus[characterName];
          
          // If we removed the active character, clear it or set a new one
          let newActiveCharacter = state.activeCharacter;
          if (state.activeCharacter === characterName) {
            newActiveCharacter = newConnections.length > 0 ? newConnections[0].characterName : null;
          }

          return {
            connections: newConnections,
            activeCharacter: newActiveCharacter,
            connectionStatus: newConnectionStatus
          };
        });
      },

      updateConnection: (characterName: string, updates: Partial<CharacterConnection>) => {
        set((state) => ({
          connections: state.connections.map(c => 
            c.characterName === characterName 
              ? { ...c, ...updates }
              : c
          ),
          connectionStatus: {
            ...state.connectionStatus,
            [characterName]: updates.status || state.connectionStatus[characterName]
          }
        }));
      },

      setActiveCharacter: (characterName: string) => {
        console.log('CharacterStore: Setting active character to:', characterName);
        set((state) => {
          console.log('CharacterStore: Previous active character:', state.activeCharacter);
          console.log('CharacterStore: Available connections:', state.connections.map(c => c.characterName));
          return {
            activeCharacter: characterName,
            connections: state.connections.map(c => ({
              ...c,
              isActive: c.characterName === characterName
            }))
          };
        });
      },

      clearActiveCharacter: () => {
        set((state) => ({
          activeCharacter: null,
          connections: state.connections.map(c => ({
            ...c,
            isActive: false
          }))
        }));
      },

      updateConnectionStatus: (characterName: string, status: 'connecting' | 'connected' | 'disconnected' | 'error') => {
        set((state) => ({
          connectionStatus: {
            ...state.connectionStatus,
            [characterName]: status
          },
          connections: state.connections.map(c => 
            c.characterName === characterName 
              ? { ...c, status, isConnected: status === 'connected' }
              : c
          )
        }));
      },

      setConnections: (connections: CharacterConnection[]) => {
        set(() => ({
          connections,
          connectionStatus: connections.reduce((acc, conn) => {
            acc[conn.characterName] = conn.status;
            return acc;
          }, {} as Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>)
        }));
      },

      getConnection: (characterName: string) => {
        return get().connections.find(c => c.characterName === characterName) || null;
      },

      getActiveConnection: () => {
        const { activeCharacter, connections } = get();
        if (!activeCharacter) return null;
        return connections.find(c => c.characterName === activeCharacter) || null;
      },

      isCharacterConnected: (characterName: string) => {
        const connection = get().getConnection(characterName);
        return connection?.isConnected || false;
      },

      getConnectedCharacters: () => {
        return get().connections.filter(c => c.isConnected);
      },

      clearAllConnections: () => {
        set(() => ({
          connections: [],
          activeCharacter: null,
          connectionStatus: {}
        }));
      }
    }),
    {
      name: 'character-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        connections: state.connections,
        activeCharacter: state.activeCharacter
      })
    }
  )
);
