import { create } from 'zustand';
import { characterIndexedDBService, CharacterConnectionData } from '@/lib/characterIndexedDB';

export interface CharacterConnection {
  characterName: string;
  isConnected: boolean;
  isActive: boolean;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: string;
  connectedAt: string;
  fchatUsername?: string;
}

interface CharacterIndexedDBStore {
  // In-memory cache for quick access
  connections: CharacterConnection[];
  activeCharacter: string | null;
  connectionStatus: Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>;
  
  // Actions
  initialize: () => Promise<void>;
  addConnection: (connection: CharacterConnection) => Promise<void>;
  removeConnection: (characterName: string) => Promise<void>;
  updateConnection: (characterName: string, updates: Partial<CharacterConnection>) => Promise<void>;
  setActiveCharacter: (characterName: string) => Promise<void>;
  clearActiveCharacter: () => Promise<void>;
  updateConnectionStatus: (characterName: string, status: 'connecting' | 'connected' | 'disconnected' | 'error') => Promise<void>;
  setConnections: (connections: CharacterConnection[], preserveActiveCharacter?: string) => Promise<void>;
  getConnection: (characterName: string) => CharacterConnection | null;
  getActiveConnection: () => CharacterConnection | null;
  isCharacterConnected: (characterName: string) => boolean;
  getConnectedCharacters: () => CharacterConnection[];
  clearAllConnections: () => Promise<void>;
  getStorageInfo: () => Promise<{ connections: number; lightweight: number; estimatedSize: number }>;
}

export const useCharacterIndexedDBStore = create<CharacterIndexedDBStore>((set, get) => ({
  // Initial state
  connections: [],
  activeCharacter: null,
  connectionStatus: {},

  initialize: async () => {
    try {
      await characterIndexedDBService.initialize();
      console.log('Character IndexedDB store initialized');
      
      // Load existing connections
      const connections = await characterIndexedDBService.getAllConnections();
      const activeConnection = connections.find(conn => conn.isActive);
      
      set({
        connections: connections.map(conn => ({
          characterName: conn.characterName,
          isConnected: conn.isConnected,
          isActive: conn.isActive,
          status: conn.status,
          lastActivity: conn.lastActivity,
          connectedAt: conn.connectedAt,
          fchatUsername: conn.fchatUsername
        })),
        activeCharacter: activeConnection?.characterName || null,
        connectionStatus: connections.reduce((acc, conn) => {
          acc[conn.characterName] = conn.status;
          return acc;
        }, {} as Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>)
      });
    } catch (error) {
      console.error('Failed to initialize character IndexedDB store:', error);
      throw error;
    }
  },

  addConnection: async (connection: CharacterConnection) => {
    try {
      // Store in IndexedDB
      await characterIndexedDBService.storeConnection({
        characterName: connection.characterName,
        isConnected: connection.isConnected,
        isActive: connection.isActive,
        status: connection.status,
        lastActivity: connection.lastActivity,
        connectedAt: connection.connectedAt,
        fchatUsername: connection.fchatUsername
      });
      
      // Update in-memory cache
      set((state) => ({
        connections: [...state.connections.filter(c => c.characterName !== connection.characterName), connection],
        connectionStatus: {
          ...state.connectionStatus,
          [connection.characterName]: connection.status
        }
      }));
      
      console.log(`Connection stored for ${connection.characterName}`);
    } catch (error) {
      console.error(`Failed to store connection for ${connection.characterName}:`, error);
      throw error;
    }
  },

  removeConnection: async (characterName: string) => {
    try {
      // Remove from IndexedDB
      await characterIndexedDBService.deleteConnection(characterName);
      
      // Update in-memory cache
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
      
      console.log(`Connection removed for ${characterName}`);
    } catch (error) {
      console.error(`Failed to remove connection for ${characterName}:`, error);
      throw error;
    }
  },

  updateConnection: async (characterName: string, updates: Partial<CharacterConnection>) => {
    try {
      const currentConnection = get().getConnection(characterName);
      if (!currentConnection) {
        throw new Error(`Connection not found for ${characterName}`);
      }

      const updatedConnection = { ...currentConnection, ...updates };
      
      // Update in IndexedDB
      await characterIndexedDBService.storeConnection({
        characterName: updatedConnection.characterName,
        isConnected: updatedConnection.isConnected,
        isActive: updatedConnection.isActive,
        status: updatedConnection.status,
        lastActivity: updatedConnection.lastActivity,
        connectedAt: updatedConnection.connectedAt,
        fchatUsername: updatedConnection.fchatUsername
      });
      
      // Update in-memory cache
      set((state) => ({
        connections: state.connections.map(c => 
          c.characterName === characterName 
            ? updatedConnection
            : c
        ),
        connectionStatus: {
          ...state.connectionStatus,
          [characterName]: updates.status || state.connectionStatus[characterName]
        }
      }));
      
      console.log(`Connection updated for ${characterName}`);
    } catch (error) {
      console.error(`Failed to update connection for ${characterName}:`, error);
      throw error;
    }
  },

  setActiveCharacter: async (characterName: string) => {
    try {
      console.log('CharacterIndexedDBStore: Setting active character to:', characterName);
      
      // Update all connections to set the correct active state
      const connections = get().connections;
      const updatePromises = connections.map(conn => {
        const isActive = conn.characterName === characterName;
        if (conn.isActive !== isActive) {
          return get().updateConnection(conn.characterName, { isActive });
        }
        return Promise.resolve();
      });
      
      await Promise.all(updatePromises);
      
      // Update in-memory cache
      set((state) => ({
        activeCharacter: characterName,
        connections: state.connections.map(c => ({
          ...c,
          isActive: c.characterName === characterName
        }))
      }));
      
      console.log(`Active character set to ${characterName}`);
    } catch (error) {
      console.error(`Failed to set active character to ${characterName}:`, error);
      throw error;
    }
  },

  clearActiveCharacter: async () => {
    try {
      // Update all connections to set isActive to false
      const connections = get().connections;
      const updatePromises = connections.map(conn => {
        if (conn.isActive) {
          return get().updateConnection(conn.characterName, { isActive: false });
        }
        return Promise.resolve();
      });
      
      await Promise.all(updatePromises);
      
      // Update in-memory cache
      set((state) => ({
        activeCharacter: null,
        connections: state.connections.map(c => ({
          ...c,
          isActive: false
        }))
      }));
      
      console.log('Active character cleared');
    } catch (error) {
      console.error('Failed to clear active character:', error);
      throw error;
    }
  },

  updateConnectionStatus: async (characterName: string, status: 'connecting' | 'connected' | 'disconnected' | 'error') => {
    try {
      await get().updateConnection(characterName, { 
        status, 
        isConnected: status === 'connected' 
      });
      
      console.log(`Connection status updated for ${characterName}: ${status}`);
    } catch (error) {
      console.error(`Failed to update connection status for ${characterName}:`, error);
      throw error;
    }
  },

  setConnections: async (connections: CharacterConnection[], preserveActiveCharacter?: string) => {
    try {
      // Save the active character to preserve if specified
      const activeToPreserve = preserveActiveCharacter || get().activeCharacter;
      
      // Clear existing connections from IndexedDB only
      const existingConnections = get().connections;
      for (const connection of existingConnections) {
        await characterIndexedDBService.deleteConnection(connection.characterName);
      }
      
      // Add new connections to IndexedDB
      for (const connection of connections) {
        await characterIndexedDBService.storeConnection({
          characterName: connection.characterName,
          isConnected: connection.isConnected,
          isActive: connection.isActive,
          status: connection.status,
          lastActivity: connection.lastActivity,
          connectedAt: connection.connectedAt,
          fchatUsername: connection.fchatUsername
        });
      }
      
      // Update in-memory state in one atomic operation to prevent intermediate renders
      set({
        connections: connections,
        activeCharacter: activeToPreserve,
        connectionStatus: connections.reduce((acc, conn) => {
          acc[conn.characterName] = conn.status;
          return acc;
        }, {} as Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>)
      });
      
      console.log(`Set ${connections.length} connections, preserved active character: ${activeToPreserve}`);
    } catch (error) {
      console.error('Failed to set connections:', error);
      throw error;
    }
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

  clearAllConnections: async () => {
    try {
      // Clear from IndexedDB
      const connections = get().connections;
      for (const connection of connections) {
        await characterIndexedDBService.deleteConnection(connection.characterName);
      }
      
      // Clear in-memory cache
      set({
        connections: [],
        activeCharacter: null,
        connectionStatus: {}
      });
      
      console.log('All connections cleared');
    } catch (error) {
      console.error('Failed to clear all connections:', error);
      throw error;
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
