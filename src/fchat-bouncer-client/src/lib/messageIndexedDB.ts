/**
 * IndexedDB service for storing message data
 * Uses keys like MSG-Chad%20the%20Hyena-ADH-2e4c003b5b2e488e35da-1234567890
 */

export interface MessageStorageData {
  messageId: string;
  characterName: string;
  channelId: string;
  message: any; // The actual message object
  timestamp: number;
  type: 'MESSAGE';
}

class MessageIndexedDBService {
  private dbName = 'FChatBouncerMessages';
  private dbVersion = 1;
  private storeName = 'messages';
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if IndexedDB is available
      if (!window.indexedDB) {
        const error = new Error('IndexedDB is not supported in this browser');
        console.error('Message IndexedDB not supported:', error);
        reject(error);
        return;
      }

      console.log('Opening Message IndexedDB:', this.dbName, 'version:', this.dbVersion);
      
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        const error = request.error || new Error('Unknown Message IndexedDB error');
        console.error('Failed to open Message IndexedDB:', error);
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          code: (error as any).code
        });
        reject(error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('Message IndexedDB initialized successfully:', {
          dbName: this.dbName,
          version: this.dbVersion,
          objectStoreNames: Array.from(this.db.objectStoreNames)
        });
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create the messages store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('characterName', 'characterName', { unique: false });
          store.createIndex('channelId', 'channelId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('messageId', 'messageId', { unique: false });
        }
      };
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  private generateKey(characterName: string, channelId: string, messageId: string): string {
    const encodedCharacter = encodeURIComponent(characterName);
    const encodedChannel = encodeURIComponent(channelId);
    const encodedMessageId = encodeURIComponent(messageId);
    return `MSG-${encodedCharacter}-${encodedChannel}-${encodedMessageId}`;
  }

  async storeMessage(characterName: string, channelId: string, message: any): Promise<void> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const messageId = message.id || `${Date.now()}-${Math.random()}`;
      const key = this.generateKey(characterName, channelId, messageId);
      const data: MessageStorageData & { key: string } = {
        key,
        messageId,
        characterName,
        channelId,
        message,
        timestamp: Date.now(),
        type: 'MESSAGE'
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`Stored message for ${characterName} in ${channelId}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`Failed to store message for ${characterName} in ${channelId}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getMessages(characterName: string, channelId?: string, limit?: number): Promise<any[]> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      
      let request: IDBRequest;
      
      if (channelId) {
        // Get messages for specific character and channel
        const index = store.index('characterName');
        const range = IDBKeyRange.only(characterName);
        request = index.getAll(range);
      } else {
        // Get all messages for character
        const index = store.index('characterName');
        const range = IDBKeyRange.only(characterName);
        request = index.getAll(range);
      }

      request.onsuccess = () => {
        let results = request.result;
        
        // Filter by channel if specified
        if (channelId) {
          results = results.filter((item: { channelId: string; }) => item.channelId === channelId);
        }
        
        // Sort by timestamp (oldest first)
        results.sort((a: { timestamp: number; }, b: { timestamp: number; }) => a.timestamp - b.timestamp);
        
        // Apply limit if specified
        if (limit) {
          results = results.slice(0, limit);
        }
        
        // Extract just the message objects
        const messages = results.map((item: { message: any; }) => item.message);
        
        console.log(`Retrieved ${messages.length} messages for ${characterName}${channelId ? ` in ${channelId}` : ''}`);
        resolve(messages);
      };

      request.onerror = () => {
        console.error(`Failed to get messages for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async deleteMessages(characterName: string, channelId?: string): Promise<number> {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('characterName');
      const range = IDBKeyRange.only(characterName);
      const request = index.getAll(range);

      request.onsuccess = () => {
        const results = request.result;
        let filteredResults = results;
        
        // Filter by channel if specified
        if (channelId) {
          filteredResults = results.filter(item => item.channelId === channelId);
        }
        
        // Delete each message
        let deletedCount = 0;
        const deletePromises = filteredResults.map(item => {
          return new Promise<void>((deleteResolve, deleteReject) => {
            const deleteRequest = store.delete(item.key);
            deleteRequest.onsuccess = () => {
              deletedCount++;
              deleteResolve();
            };
            deleteRequest.onerror = () => deleteReject(deleteRequest.error);
          });
        });
        
        Promise.all(deletePromises).then(() => {
          console.log(`Deleted ${deletedCount} messages for ${characterName}${channelId ? ` in ${channelId}` : ''}`);
          resolve(deletedCount);
        }).catch(error => {
          console.error(`Failed to delete messages for ${characterName}:`, error);
          reject(error);
        });
      };

      request.onerror = () => {
        console.error(`Failed to delete messages for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async clearAllMessages(): Promise<void> {
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
        console.log('Cleared all messages from IndexedDB');
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to clear all messages:', request.error);
        reject(request.error);
      };
    });
  }

  async getStorageInfo(): Promise<{ count: number; estimatedSize: number }> {
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
        const results = request.result;
        const estimatedSize = results.reduce((total, message) => {
          return total + JSON.stringify(message).length;
        }, 0);

        resolve({
          count: results.length,
          estimatedSize
        });
      };

      request.onerror = () => {
        console.error('Failed to get message storage info:', request.error);
        reject(request.error);
      };
    });
  }

  async cleanupOldMessages(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    // maxAge in milliseconds, default 7 days
    const cutoffTime = Date.now() - maxAge;
    
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;
        const oldMessages = results.filter(message => message.timestamp < cutoffTime);
        
        let deletedCount = 0;
        const deletePromises = oldMessages.map(message => {
          return new Promise<void>((deleteResolve, deleteReject) => {
            const deleteRequest = store.delete(message.key);
            deleteRequest.onsuccess = () => {
              deletedCount++;
              deleteResolve();
            };
            deleteRequest.onerror = () => deleteReject(deleteRequest.error);
          });
        });
        
        Promise.all(deletePromises).then(() => {
          console.log(`Cleaned up ${deletedCount} old messages`);
          resolve(deletedCount);
        }).catch(error => {
          console.error('Failed to cleanup old messages:', error);
          reject(error);
        });
      };

      request.onerror = () => {
        console.error('Failed to cleanup old messages:', request.error);
        reject(request.error);
      };
    });
  }
}

// Export singleton instance
export const messageIndexedDBService = new MessageIndexedDBService();
export default messageIndexedDBService;
