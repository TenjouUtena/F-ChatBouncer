'use client';

import { useEffect, useRef } from 'react';
import { useProfileStore } from '@/stores/profileStore';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import { useLightweightCharacterIndexedDBStore } from '@/stores/lightweightCharacterIndexedDBStore';
import { useChatStore } from '@/stores/chatStore';
import { messageIndexedDBService } from '@/lib/messageIndexedDB';
import { markIndexedDBReady, markIndexedDBFailed } from '@/lib/indexeddbReady';

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
        
        console.log('Initializing IndexedDB stores...');
        
        // Get store instances and initialize them
        const profileStore = useProfileStore.getState();
        const characterStore = useCharacterIndexedDBStore.getState();
        const lightweightStore = useLightweightCharacterIndexedDBStore.getState();
        const chatStore = useChatStore.getState();
        
        // Initialize all IndexedDB stores in parallel
        await Promise.all([
          profileStore.initialize(),
          characterStore.initialize(),
          lightweightStore.initialize(),
          messageIndexedDBService.initialize()
        ]);
        
        console.log('All IndexedDB stores initialized successfully');
        markIndexedDBReady();
        chatStore.handleIndexedDBReady();
        
        // Load limited messages from IndexedDB into memory for open channels only
        // Get characters with selected channels (open channels)
        const characterSelectedChannels = chatStore.characterSelectedChannels || {};
        
        // Load limited messages for each character's open channels
        for (const [characterName, openChannels] of Object.entries(characterSelectedChannels)) {
          if (openChannels.length > 0) {
            try {
              // Load 100 messages per channel (configurable limit)
              await chatStore.loadLimitedMessagesFromIndexedDB(characterName, openChannels);
            } catch (error) {
              console.error(`Failed to load limited messages for ${characterName}:`, error);
            }
          }
        }
        
        console.log('=== Storage Initialization Completed ===');
        
      } catch (error) {
        console.error('Failed to initialize IndexedDB stores:', error);
        markIndexedDBFailed(error);
        const chatStore = useChatStore.getState();
        chatStore.handleIndexedDBFailure(error);
        console.warn('Application will continue with limited storage functionality');
      }
    };

    initializeStores();
  }, []); // Empty dependency array - only run once

  // This component doesn't render anything
  return null;
}
