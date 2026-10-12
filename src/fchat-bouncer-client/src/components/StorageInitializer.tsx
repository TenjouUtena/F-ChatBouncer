'use client';

import { useEffect, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useChatStore } from '@/stores/chatStore';
import { openDb } from '@/lib/db';
import { messageIndexedDBService } from '@/lib/messageIndexedDB';
import { markIndexedDBReady, markIndexedDBFailed } from '@/lib/indexeddbReady';

// Databases and keys from before the single "fchat-bouncer" database.
// TODO: remove this cleanup a release after v2 ships.
const LEGACY_DATABASES = ['FChatBouncerProfiles', 'FChatBouncerCharacters'];
const LEGACY_LOCAL_STORAGE_KEYS = ['character-gender-cache'];

function removeLegacyStorage(): void {
  for (const name of LEGACY_DATABASES) {
    indexedDB.deleteDatabase(name);
  }
  for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable in private mode
    }
  }
}

export default function StorageInitializer() {
  const initializedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    const initializeStores = async () => {
      const chatStore = useChatStore.getState();

      try {
        removeLegacyStorage();

        await openDb();
        await Promise.all([
          useConnectionStore.getState().initialize(),
          useCharacterStore.getState().load(),
          messageIndexedDBService.initialize()
        ]);

        markIndexedDBReady();
        chatStore.handleIndexedDBReady();

        // Load limited messages from IndexedDB into memory for open channels only
        const characterSelectedChannels = chatStore.characterSelectedChannels || {};
        for (const [characterName, openChannels] of Object.entries(characterSelectedChannels)) {
          if (openChannels.length > 0) {
            try {
              await chatStore.loadLimitedMessagesFromIndexedDB(characterName, openChannels);
            } catch (error) {
              console.error(`Failed to load limited messages for ${characterName}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to initialize IndexedDB stores:', error);
        markIndexedDBFailed(error);
        chatStore.handleIndexedDBFailure(error);
      }
    };

    initializeStores();
  }, []);

  // This component doesn't render anything
  return null;
}
