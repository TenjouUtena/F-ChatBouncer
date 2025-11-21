/**
 * IndexedDB service for storing profile data
 * Uses keys like PRO-BASIC-Chad%20the%20Hyena and PRO-FULL-Jukaka
 */

export interface ProfileStorageData {
  characterName: string;
  profileData: any;
  timestamp: number;
  type: 'BASIC' | 'FULL';
}

class IndexedDBService {
  private dbName = 'FChatBouncerProfiles';
  private dbVersion = 1;
  private storeName = 'profiles';
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if IndexedDB is available
      if (!window.indexedDB) {
        const error = new Error('IndexedDB is not supported in this browser');
        console.error('IndexedDB not supported:', error);
        reject(error);
        return;
      }

      console.log('Opening IndexedDB:', this.dbName, 'version:', this.dbVersion);
      
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        const error = request.error || new Error('Unknown IndexedDB error');
        console.error('Failed to open IndexedDB:', error);
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          code: (error as any).code
        });
        reject(error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully:', {
          dbName: this.dbName,
          version: this.dbVersion,
          objectStoreNames: Array.from(this.db.objectStoreNames)
        });
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create the profiles store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('characterName', 'characterName', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  private generateKey(characterName: string, type: 'BASIC' | 'FULL'): string {
    // URL encode the character name to handle special characters
    const encodedName = encodeURIComponent(characterName);
    return `PRO-${type}-${encodedName}`;
  }

  async storeProfile(characterName: string, profileData: any, type: 'BASIC' | 'FULL' = 'FULL'): Promise<void> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const key = this.generateKey(characterName, type);
      const data: ProfileStorageData & { key: string } = {
        key,
        characterName,
        profileData,
        timestamp: Date.now(),
        type
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.debug(`Stored ${type} profile for ${characterName}`);
        resolve();
      };

      request.onerror = () => {
        console.debug(`Failed to store ${type} profile for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getProfile(characterName: string, type: 'BASIC' | 'FULL' = 'FULL'): Promise<any | null> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const key = this.generateKey(characterName, type);
      
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve(result.profileData);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.debug(`Failed to get ${type} profile for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async hasProfile(characterName: string, type: 'BASIC' | 'FULL' = 'FULL'): Promise<boolean> {
    const profile = await this.getProfile(characterName, type);
    return profile !== null;
  }

  async deleteProfile(characterName: string, type: 'BASIC' | 'FULL' = 'FULL'): Promise<void> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const key = this.generateKey(characterName, type);
      
      const request = store.delete(key);

      request.onsuccess = () => {
        console.debug(`Deleted ${type} profile for ${characterName}`);
        resolve();
      };

      request.onerror = () => {
        console.debug(`Failed to delete ${type} profile for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getAllProfiles(type?: 'BASIC' | 'FULL'): Promise<ProfileStorageData[]> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result;
        
        // Filter by type if specified
        if (type) {
          results = results.filter(item => item.type === type);
        }
        
        console.debug(`Retrieved ${results.length} profiles${type ? ` of type ${type}` : ''}`);
        resolve(results);
      };

      request.onerror = () => {
        console.debug('Failed to get all profiles:', request.error);
        reject(request.error);
      };
    });
  }

  async getProfilesByCharacter(characterName: string): Promise<ProfileStorageData[]> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('characterName');
      const request = index.getAll(characterName);

      request.onsuccess = () => {
        const results = request.result;
        console.debug(`Retrieved ${results.length} profiles for ${characterName}`);
        resolve(results);
      };

      request.onerror = () => {
        console.debug(`Failed to get profiles for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async clearAllProfiles(): Promise<void> {
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
        console.debug('Cleared all profiles from IndexedDB');
        resolve();
      };

      request.onerror = () => {
        console.debug('Failed to clear all profiles:', request.error);
        reject(request.error);
      };
    });
  }

  async getStorageInfo(): Promise<{ count: number; estimatedSize: number }> {
    const profiles = await this.getAllProfiles();
    const estimatedSize = profiles.reduce((total, profile) => {
      return total + JSON.stringify(profile).length;
    }, 0);

    return {
      count: profiles.length,
      estimatedSize
    };
  }

  async cleanupOldProfiles(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    // maxAge in milliseconds, default 30 days
    const cutoffTime = Date.now() - maxAge;
    const profiles = await this.getAllProfiles();
    const oldProfiles = profiles.filter(profile => profile.timestamp < cutoffTime);
    
    let deletedCount = 0;
    for (const profile of oldProfiles) {
      try {
        await this.deleteProfile(profile.characterName, profile.type);
        deletedCount++;
      } catch (error) {
        console.debug(`Failed to delete old profile for ${profile.characterName}:`, error);
      }
    }
    
    console.debug(`Cleaned up ${deletedCount} old profiles`);
    return deletedCount;
  }
}

// Export singleton instance
export const indexedDBService = new IndexedDBService();
export default indexedDBService;
