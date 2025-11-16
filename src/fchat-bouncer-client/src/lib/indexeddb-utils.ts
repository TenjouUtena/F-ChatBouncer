/**
 * IndexedDB utility functions for checking availability and handling fallbacks
 */

export interface IndexedDBCapabilities {
  isSupported: boolean;
  error?: string;
  details?: any;
}

/**
 * Check if IndexedDB is available and working
 */
export async function checkIndexedDBSupport(): Promise<IndexedDBCapabilities> {
  try {
    // Check basic availability
    if (!window.indexedDB) {
      return {
        isSupported: false,
        error: 'IndexedDB is not available in this browser'
      };
    }

    // Try to open a test database
    const testDbName = 'fchat-bouncer-test-' + Date.now();
    const testDbVersion = 1;
    
    return new Promise((resolve) => {
      const request = indexedDB.open(testDbName, testDbVersion);
      
      request.onerror = () => {
        const error = request.error || new Error('Unknown IndexedDB error');
        resolve({
          isSupported: false,
          error: `Failed to open test database: ${error.message}`,
          details: {
            name: error.name,
            message: error.message,
            code: (error as any).code
          }
        });
      };
      
      request.onsuccess = () => {
        const db = request.result;
        setTimeout(() => {
          db.close();
        }, 1000);
        
        // Clean up test database
        const deleteRequest = indexedDB.deleteDatabase(testDbName);
        deleteRequest.onsuccess = () => {
          resolve({
            isSupported: true
          });
        };
        deleteRequest.onerror = () => {
          // Even if cleanup fails, IndexedDB is working
          resolve({
            isSupported: true
          });
        };
      };
      
      request.onupgradeneeded = () => {
        // Test database created successfully
        const db = request.result;
        setTimeout(() => {
          db.close();
        }, 1000);
        
        // Clean up test database
        const deleteRequest = indexedDB.deleteDatabase(testDbName);
        deleteRequest.onsuccess = () => {
          resolve({
            isSupported: true
          });
        };
        deleteRequest.onerror = () => {
          // Even if cleanup fails, IndexedDB is working
          resolve({
            isSupported: true
          });
        };
      };
    });
  } catch (error) {
    return {
      isSupported: false,
      error: `IndexedDB check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

/**
 * Get storage quota information if available
 */
export async function getStorageQuota(): Promise<{ quota?: number; usage?: number }> {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        quota: estimate.quota,
        usage: estimate.usage
      };
    }
  } catch (error) {
    console.warn('Failed to get storage quota:', error);
  }
  return {};
}

/**
 * Log IndexedDB status for debugging
 */
export async function logIndexedDBStatus(): Promise<void> {
  console.log('=== IndexedDB Status Check ===');
  
  const support = await checkIndexedDBSupport();
  console.log('IndexedDB Support:', support);
  
  const quota = await getStorageQuota();
  console.log('Storage Quota:', quota);
  
  // Check existing databases
  if (window.indexedDB && 'databases' in indexedDB) {
    try {
      const databases = await indexedDB.databases();
      console.log('Existing IndexedDB databases:', databases);
    } catch (error) {
      console.log('Could not list existing databases:', error);
    }
  }
  
  console.log('=== End IndexedDB Status Check ===');
}

/**
 * Check if we're in a private/incognito mode that might limit IndexedDB
 */
export function isPrivateMode(): boolean {
  try {
    // Try to access localStorage - in private mode, it might throw or be limited
    const testKey = '__private_mode_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return false;
  } catch {
    return true;
  }
}
