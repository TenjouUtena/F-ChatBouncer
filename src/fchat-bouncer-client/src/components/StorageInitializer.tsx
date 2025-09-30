'use client';

import { useEffect, useRef } from 'react';
import { migrateExistingProfileData, cleanupOldStorageEntries } from '@/lib/storageMigration';
import { useProfileStore } from '@/stores/profileStore';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import { useLightweightCharacterIndexedDBStore } from '@/stores/lightweightCharacterIndexedDBStore';
import { checkIndexedDBSupport, logIndexedDBStatus, isPrivateMode } from '@/lib/indexeddb-utils';

export default function StorageInitializer() {
  const initializedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (initializedRef.current) {
      return;
    }

    const initializeStores = async () => {
      try {
        initializedRef.current = true;
        console.log('=== Storage Initialization Started ===');
        
        // Check IndexedDB support first
        const support = await checkIndexedDBSupport();
        if (!support.isSupported) {
          console.error('IndexedDB not supported:', support.error);
          console.warn('Falling back to localStorage only. Some features may be limited.');
          return;
        }

        // Check for private mode
        if (isPrivateMode()) {
          console.warn('Private/Incognito mode detected. IndexedDB may have limited functionality.');
        }

        // Log detailed status for debugging
        await logIndexedDBStatus();
        
        console.log('Initializing IndexedDB stores...');
        
        // Get store instances and initialize them
        const profileStore = useProfileStore.getState();
        const characterStore = useCharacterIndexedDBStore.getState();
        const lightweightStore = useLightweightCharacterIndexedDBStore.getState();
        
        // Initialize all IndexedDB stores in parallel
        await Promise.all([
          profileStore.initialize(),
          characterStore.initialize(),
          lightweightStore.initialize()
        ]);
        
        console.log('All IndexedDB stores initialized successfully');
        
        // Run migration and cleanup after stores are initialized
        migrateExistingProfileData();
        cleanupOldStorageEntries();
        
        console.log('=== Storage Initialization Completed ===');
        
      } catch (error) {
        console.error('Failed to initialize IndexedDB stores:', error);
        console.warn('Application will continue with limited storage functionality');
        
        // Still try to run migration and cleanup even if IndexedDB failed
        try {
          migrateExistingProfileData();
          cleanupOldStorageEntries();
        } catch (migrationError) {
          console.error('Migration/cleanup failed:', migrationError);
        }
      }
    };

    initializeStores();
  }, []); // Empty dependency array - only run once

  // This component doesn't render anything
  return null;
}
