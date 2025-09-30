/**
 * IndexedDB service for storing character data
 * Uses keys like CHAR-CONN-Chad%20the%20Hyena and CHAR-LIGHT-Jukaka
 */

export interface CharacterConnectionData {
  characterName: string;
  isConnected: boolean;
  isActive: boolean;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: string;
  connectedAt: string;
  fchatUsername?: string;
  timestamp: number;
  type: 'CONN';
}

export interface LightweightCharacterData {
  character: string;
  gender: string;
  species: string;
  lastSeen: number;
  status?: 'online' | 'looking' | 'busy' | 'away' | 'dnd' | 'offline';
  statusMessage?: string;
  isOnline?: boolean;
  timestamp: number;
  type: 'LIGHT';
}

class CharacterIndexedDBService {
  private dbName = 'FChatBouncerCharacters';
  private dbVersion = 1;
  private storeName = 'characters';
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if IndexedDB is available
      if (!window.indexedDB) {
        const error = new Error('IndexedDB is not supported in this browser');
        console.error('Character IndexedDB not supported:', error);
        reject(error);
        return;
      }

      console.log('Opening Character IndexedDB:', this.dbName, 'version:', this.dbVersion);
      
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        const error = request.error || new Error('Unknown Character IndexedDB error');
        console.error('Failed to open Character IndexedDB:', error);
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          code: (error as any).code
        });
        reject(error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('Character IndexedDB initialized successfully:', {
          dbName: this.dbName,
          version: this.dbVersion,
          objectStoreNames: Array.from(this.db.objectStoreNames)
        });
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create the characters store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('characterName', 'characterName', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('isActive', 'isActive', { unique: false });
        }
      };
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  private generateKey(characterName: string, type: 'CONN' | 'LIGHT'): string {
    // URL encode the character name to handle special characters
    const encodedName = encodeURIComponent(characterName);
    return `CHAR-${type}-${encodedName}`;
  }

  // Character Connection Methods
  async storeConnection(connection: Omit<CharacterConnectionData, 'timestamp' | 'type'>): Promise<void> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const key = this.generateKey(connection.characterName, 'CONN');
      const data: CharacterConnectionData & { key: string } = {
        key,
        ...connection,
        timestamp: Date.now(),
        type: 'CONN'
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`Stored connection for ${connection.characterName}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`Failed to store connection for ${connection.characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getConnection(characterName: string): Promise<CharacterConnectionData | null> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const key = this.generateKey(characterName, 'CONN');
      
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log(`Retrieved connection for ${characterName}`);
          resolve(result);
        } else {
          console.log(`No connection found for ${characterName}`);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error(`Failed to get connection for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getAllConnections(): Promise<CharacterConnectionData[]> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('type');
      const request = index.getAll('CONN');

      request.onsuccess = () => {
        const results = request.result;
        console.log(`Retrieved ${results.length} connections`);
        resolve(results);
      };

      request.onerror = () => {
        console.error('Failed to get all connections:', request.error);
        reject(request.error);
      };
    });
  }

  async deleteConnection(characterName: string): Promise<void> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const key = this.generateKey(characterName, 'CONN');
      
      const request = store.delete(key);

      request.onsuccess = () => {
        console.log(`Deleted connection for ${characterName}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`Failed to delete connection for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  // Lightweight Character Methods
  async storeLightweightCharacter(characterData: Omit<LightweightCharacterData, 'timestamp' | 'type'>): Promise<void> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const key = this.generateKey(characterData.character, 'LIGHT');
      const data: LightweightCharacterData & { key: string } = {
        key,
        ...characterData,
        timestamp: Date.now(),
        type: 'LIGHT'
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`Stored lightweight character ${characterData.character}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`Failed to store lightweight character ${characterData.character}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getLightweightCharacter(characterName: string): Promise<LightweightCharacterData | null> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const key = this.generateKey(characterName, 'LIGHT');
      
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log(`Retrieved lightweight character ${characterName}`);
          resolve(result);
        } else {
          console.log(`No lightweight character found for ${characterName}`);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error(`Failed to get lightweight character ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getAllLightweightCharacters(): Promise<LightweightCharacterData[]> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('type');
      const request = index.getAll('LIGHT');

      request.onsuccess = () => {
        const results = request.result;
        console.log(`Retrieved ${results.length} lightweight characters`);
        resolve(results);
      };

      request.onerror = () => {
        console.error('Failed to get all lightweight characters:', request.error);
        reject(request.error);
      };
    });
  }

  async deleteLightweightCharacter(characterName: string): Promise<void> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const key = this.generateKey(characterName, 'LIGHT');
      
      const request = store.delete(key);

      request.onsuccess = () => {
        console.log(`Deleted lightweight character ${characterName}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`Failed to delete lightweight character ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  // General Methods
  async clearAllData(): Promise<void> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Cleared all character data from IndexedDB');
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to clear all character data:', request.error);
        reject(request.error);
      };
    });
  }

  async getStorageInfo(): Promise<{ connections: number; lightweight: number; estimatedSize: number }> {
    const connections = await this.getAllConnections();
    const lightweight = await this.getAllLightweightCharacters();
    
    const allData = [...connections, ...lightweight];
    const estimatedSize = allData.reduce((total, item) => {
      return total + JSON.stringify(item).length;
    }, 0);

    return {
      connections: connections.length,
      lightweight: lightweight.length,
      estimatedSize
    };
  }

  async cleanupOldLightweightCharacters(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    // maxAge in milliseconds, default 30 days
    const cutoffTime = Date.now() - maxAge;
    const characters = await this.getAllLightweightCharacters();
    const oldCharacters = characters.filter(char => char.lastSeen < cutoffTime);
    
    let deletedCount = 0;
    for (const character of oldCharacters) {
      try {
        await this.deleteLightweightCharacter(character.character);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete old lightweight character ${character.character}:`, error);
      }
    }
    
    console.log(`Cleaned up ${deletedCount} old lightweight characters`);
    return deletedCount;
  }
}

// Export singleton instance
export const characterIndexedDBService = new CharacterIndexedDBService();
export default characterIndexedDBService;
