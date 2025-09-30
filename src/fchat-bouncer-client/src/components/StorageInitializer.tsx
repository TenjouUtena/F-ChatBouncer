'use client';

import { useEffect, useRef } from 'react';
import { migrateExistingProfileData, cleanupOldStorageEntries } from '@/lib/storageMigration';
import { useProfileStore } from '@/stores/profileStore';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import { useLightweightCharacterIndexedDBStore } from '@/stores/lightweightCharacterIndexedDBStore';
import { useChatStore } from '@/stores/chatStore';
import { messageIndexedDBService } from '@/lib/messageIndexedDB';
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
          lightweightStore.initialize(),
          messageIndexedDBService.initialize()
        ]);
        
        console.log('All IndexedDB stores initialized successfully');
        
        // Test IndexedDB functionality
        try {
          const testMessage = {
            id: 'test-' + Date.now(),
            content: 'Test message',
            sender: 'TestUser',
            channel: 'test-channel',
            timestamp: new Date().toISOString(),
            messageType: 'Chat'
          };
          
          await messageIndexedDBService.storeMessage('TestCharacter', 'test-channel', testMessage);
          const retrievedMessages = await messageIndexedDBService.getMessages('TestCharacter', 'test-channel', 1);
          console.log('IndexedDB test successful:', retrievedMessages.length > 0 ? 'PASS' : 'FAIL');
          
          // Clean up test data
          await messageIndexedDBService.deleteMessages('TestCharacter', 'test-channel');
        } catch (testError) {
          console.error('IndexedDB test failed:', testError);
        }
        
        // Run migration and cleanup after stores are initialized
        migrateExistingProfileData();
        cleanupOldStorageEntries();
        
        // Load messages from IndexedDB into memory
        const chatStore = useChatStore.getState();
        await chatStore.loadAllMessagesFromIndexedDB();
        
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
