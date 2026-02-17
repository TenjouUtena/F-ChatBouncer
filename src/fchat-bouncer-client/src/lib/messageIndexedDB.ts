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
  private initializingPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if IndexedDB is available
      if (!window.indexedDB) {
        const error = new Error('IndexedDB is not supported in this browser');
        console.error('Message IndexedDB not supported:', error);
        reject(error);
        return;
      }

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

        // Reset our reference when the browser closes the connection
        // (e.g. version change from another tab, memory pressure, tab lifecycle)
        this.db.onclose = () => {
          console.warn('Message IndexedDB connection closed unexpectedly');
          this.db = null;
        };

        this.db.onversionchange = () => {
          console.warn('Message IndexedDB version change detected, closing connection');
          this.db?.close();
          this.db = null;
        };

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
    if (this.db) {
      return;
    }

    if (!this.initializingPromise) {
      this.initializingPromise = this.initialize()
        .catch((error) => {
          // Reset the promise if initialization failed so future attempts can retry
          this.initializingPromise = null;
          throw error;
        })
        .then(() => {
          // Clear the promise once initialization succeeds
          this.initializingPromise = null;
        });
    }

    await this.initializingPromise;
  }

  private async reconnect(): Promise<void> {
    this.db = null;
    await this.ensureInitialized();
  }

  private async getTransaction(mode: IDBTransactionMode): Promise<IDBTransaction> {
    await this.ensureInitialized();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      return this.db.transaction([this.storeName], mode);
    } catch (error: any) {
      if (error?.name === 'InvalidStateError') {
        console.warn('Message IndexedDB connection stale, reconnecting...');
        await this.reconnect();
        if (!this.db) {
          throw new Error('Database reconnection failed');
        }
        return this.db.transaction([this.storeName], mode);
      }
      throw error;
    }
  }

  private generateKey(characterName: string, channelId: string, messageId: string): string {
    const encodedCharacter = encodeURIComponent(characterName);
    const encodedChannel = encodeURIComponent(channelId);
    const encodedMessageId = encodeURIComponent(messageId);
    return `MSG-${encodedCharacter}-${encodedChannel}-${encodedMessageId}`;
  }

  async storeMessage(characterName: string, channelId: string, message: any): Promise<void> {
    const transaction = await this.getTransaction('readwrite');
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

    return new Promise((resolve, reject) => {
      const request = store.put(data);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error(`Failed to store message for ${characterName} in ${channelId}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getMessages(characterName: string, channelId?: string, limit?: number): Promise<any[]> {
    const transaction = await this.getTransaction('readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      
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

        // TODO: Check why messages are being retrieved multiple times.
        
        console.log(`Retrieved ${messages.length} messages for ${characterName}${channelId ? ` in ${channelId}` : ''}`);
        resolve(messages);
      };

      request.onerror = () => {
        console.error(`Failed to get messages for ${characterName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getRecentMessagesForChannel(characterName: string, channelId: string, limit: number = 100): Promise<any[]> {
    const transaction = await this.getTransaction('readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const index = store.index('characterName');
      const range = IDBKeyRange.only(characterName);
      const request = index.getAll(range);

      request.onsuccess = () => {
        let results = request.result;
        
        // Filter by channel
        results = results.filter((item: { channelId: string; }) => item.channelId === channelId);
        
        // Sort by timestamp (newest first)
        results.sort((a: { timestamp: number; }, b: { timestamp: number; }) => b.timestamp - a.timestamp);
        
        // Take the most recent messages
        const recentResults = results.slice(0, limit);
        
        // Sort by timestamp (oldest first) for consistent ordering
        recentResults.sort((a: { timestamp: number; }, b: { timestamp: number; }) => a.timestamp - b.timestamp);
        
        // Extract just the message objects
        const messages = recentResults.map((item: { message: any; }) => item.message);
        
        console.log(`Retrieved ${messages.length} recent messages for ${characterName} in ${channelId} (limit: ${limit})`);
        resolve(messages);
      };

      request.onerror = () => {
        console.error(`Failed to get recent messages for ${characterName} in ${channelId}:`, request.error);
        reject(request.error);
      };
    });
  }

  async getLimitedMessagesForOpenChannels(characterName: string, openChannels: string[], limitPerChannel: number = 100): Promise<{
    channelMessages: Record<string, any[]>;
    totalMessages: number;
  }> {
    await this.ensureInitialized();
    
    const channelMessages: Record<string, any[]> = {};
    let totalMessages = 0;

    // Load messages for each open channel
    for (const channelId of openChannels) {
      try {
        const messages = await this.getRecentMessagesForChannel(characterName, channelId, limitPerChannel);
        channelMessages[channelId] = messages;
        totalMessages += messages.length;
      } catch (error) {
        console.error(`Failed to load messages for channel ${channelId}:`, error);
        channelMessages[channelId] = [];
      }
    }

    console.log(`Loaded ${totalMessages} total messages for ${characterName} across ${openChannels.length} channels (limit: ${limitPerChannel} per channel)`);
    
    return {
      channelMessages,
      totalMessages
    };
  }

  async deleteMessages(characterName: string, channelId?: string): Promise<number> {
    const transaction = await this.getTransaction('readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
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
    const transaction = await this.getTransaction('readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
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
    const transaction = await this.getTransaction('readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
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
    
    const transaction = await this.getTransaction('readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
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

  async getDeduplicationPreview(characterName?: string): Promise<{
    totalMessages: number;
    duplicatesFound: number;
    characterBreakdown: Array<{
      characterName: string;
      totalMessages: number;
      duplicatesFound: number;
      channels: Array<{
        channelId: string;
        totalMessages: number;
        duplicatesFound: number;
      }>;
    }>;
  }> {
    const transaction = await this.getTransaction('readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;
        let filteredResults = results;
        
        // Filter by character if specified
        if (characterName) {
          filteredResults = results.filter(item => item.characterName === characterName);
        }

        // Group by character and channel
        const characterMap = new Map<string, Map<string, any[]>>();
        
        filteredResults.forEach(message => {
          const charName = message.characterName;
          const channelId = message.channelId;
          
          if (!characterMap.has(charName)) {
            characterMap.set(charName, new Map());
          }
          
          const channelMap = characterMap.get(charName)!;
          if (!channelMap.has(channelId)) {
            channelMap.set(channelId, []);
          }
          
          channelMap.get(channelId)!.push(message);
        });

        let totalMessages = 0;
        let totalDuplicates = 0;
        const characterBreakdown: Array<{
          characterName: string;
          totalMessages: number;
          duplicatesFound: number;
          channels: Array<{
            channelId: string;
            totalMessages: number;
            duplicatesFound: number;
          }>;
        }> = [];

        characterMap.forEach((channelMap, charName) => {
          let charTotalMessages = 0;
          let charTotalDuplicates = 0;
          const channels: Array<{
            channelId: string;
            totalMessages: number;
            duplicatesFound: number;
          }> = [];

          channelMap.forEach((messages, channelId) => {
            const channelTotal = messages.length;
            const channelDuplicates = this.findDuplicatesInMessages(messages);
            
            charTotalMessages += channelTotal;
            charTotalDuplicates += channelDuplicates.length;
            
            channels.push({
              channelId,
              totalMessages: channelTotal,
              duplicatesFound: channelDuplicates.length
            });
          });

          totalMessages += charTotalMessages;
          totalDuplicates += charTotalDuplicates;

          characterBreakdown.push({
            characterName: charName,
            totalMessages: charTotalMessages,
            duplicatesFound: charTotalDuplicates,
            channels
          });
        });

        resolve({
          totalMessages,
          duplicatesFound: totalDuplicates,
          characterBreakdown
        });
      };

      request.onerror = () => {
        console.error('Failed to get deduplication preview:', request.error);
        reject(request.error);
      };
    });
  }

  async deduplicateMessages(characterName?: string): Promise<{
    totalMessages: number;
    duplicatesRemoved: number;
    characterBreakdown: Array<{
      characterName: string;
      totalMessages: number;
      duplicatesRemoved: number;
    }>;
  }> {
    const transaction = await this.getTransaction('readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;
        let filteredResults = results;
        
        // Filter by character if specified
        if (characterName) {
          filteredResults = results.filter(item => item.characterName === characterName);
        }

        // Group by character and channel
        const characterMap = new Map<string, Map<string, any[]>>();
        
        filteredResults.forEach(message => {
          const charName = message.characterName;
          const channelId = message.channelId;
          
          if (!characterMap.has(charName)) {
            characterMap.set(charName, new Map());
          }
          
          const channelMap = characterMap.get(charName)!;
          if (!channelMap.has(channelId)) {
            channelMap.set(channelId, []);
          }
          
          channelMap.get(channelId)!.push(message);
        });

        let totalMessages = 0;
        let totalDuplicatesRemoved = 0;
        const characterBreakdown: Array<{
          characterName: string;
          totalMessages: number;
          duplicatesRemoved: number;
        }> = [];

        const deletePromises: Promise<void>[] = [];

        characterMap.forEach((channelMap, charName) => {
          let charTotalMessages = 0;
          let charTotalDuplicates = 0;

          channelMap.forEach((messages, channelId) => {
            const duplicates = this.findDuplicatesInMessages(messages);
            charTotalMessages += messages.length;
            charTotalDuplicates += duplicates.length;

            // Delete duplicate messages
            duplicates.forEach(duplicate => {
              const deletePromise = new Promise<void>((deleteResolve, deleteReject) => {
                const deleteRequest = store.delete(duplicate.key);
                deleteRequest.onsuccess = () => {
                  deleteResolve();
                };
                deleteRequest.onerror = () => deleteReject(deleteRequest.error);
              });
              deletePromises.push(deletePromise);
            });
          });

          totalMessages += charTotalMessages;
          totalDuplicatesRemoved += charTotalDuplicates;

          characterBreakdown.push({
            characterName: charName,
            totalMessages: charTotalMessages,
            duplicatesRemoved: charTotalDuplicates
          });
        });

        Promise.all(deletePromises).then(() => {
          console.log(`Deduplication completed: ${totalDuplicatesRemoved} duplicates removed from ${totalMessages} total messages`);
          resolve({
            totalMessages,
            duplicatesRemoved: totalDuplicatesRemoved,
            characterBreakdown
          });
        }).catch(error => {
          console.error('Failed to deduplicate messages:', error);
          reject(error);
        });
      };

      request.onerror = () => {
        console.error('Failed to deduplicate messages:', request.error);
        reject(request.error);
      };
    });
  }

  private findDuplicatesInMessages(messages: any[]): any[] {
    const duplicates: any[] = [];
    const seen = new Set<string>();
    
    // Sort messages by timestamp to keep the most recent version
    const sortedMessages = [...messages].sort((a, b) => b.timestamp - a.timestamp);
    
    for (const message of sortedMessages) {
      const msg = message.message;
      
      // Create a unique key for deduplication
      const duplicateKey = `${msg.id || ''}-${msg.timestamp}-${msg.sender}-${msg.content}-${msg.channel}`;
      
      if (seen.has(duplicateKey)) {
        duplicates.push(message);
      } else {
        seen.add(duplicateKey);
      }
    }
    
    return duplicates;
  }
}

// Export singleton instance
export const messageIndexedDBService = new MessageIndexedDBService();
export default messageIndexedDBService;
