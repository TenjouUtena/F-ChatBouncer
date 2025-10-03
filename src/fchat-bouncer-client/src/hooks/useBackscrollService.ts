import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { Message } from '@/types';

export interface BackscrollState {
  isLoading: boolean;
  hasMoreLocal: boolean;
  hasMoreServer: boolean;
  error: string | null;
}

export interface BackscrollActions {
  loadMore: () => Promise<void>;
  requestFromServer: () => Promise<void>;
  clearError: () => void;
}

interface UseBackscrollOptions {
  characterName: string;
  channelId: string;
  batchSize?: number;
}

interface UseBackscrollReturn {
  state: BackscrollState;
  actions: BackscrollActions;
  loadedCount: number;
  totalCount: number;
}

export function useBackscrollService({
  characterName,
  channelId,
  batchSize = 20
}: UseBackscrollOptions): UseBackscrollReturn {
  const {
    getMessagesForChannel,
    getLocalMessagesForChannel,
    hasMoreLocalMessages,
    loadMoreMessages,
    getLazyLoadingState,
    setLazyLoadingState,
    addMessages
  } = useChatStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestTimeRef = useRef<number>(0);
  const isRequestingRef = useRef(false);

  // Prevent duplicate requests
  const canMakeRequest = useCallback(() => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    
    // Prevent requests if:
    // 1. Already requesting
    // 2. Requested within last 500ms (debounce)
    // 3. Already loading
    if (isRequestingRef.current || timeSinceLastRequest < 500 || isLoading) {
      return false;
    }
    
    return true;
  }, [isLoading]);

  // Check available sources
  const getBackscrollState = useCallback((): BackscrollState => {
    if (!characterName || !channelId) {
      return {
        isLoading,
        hasMoreLocal: false,
        hasMoreServer: false,
        error
      };
    }

    const lazyState = getLazyLoadingState(characterName, channelId);
    const hasMoreLocal = hasMoreLocalMessages(
      characterName, 
      channelId, 
      lazyState.oldestMessageTime || undefined
    );

    return {
      isLoading,
      hasMoreLocal,
      hasMoreServer: lazyState.hasMore,
      error
    };
  }, [characterName, channelId, isLoading, error, getLazyLoadingState, hasMoreLocalMessages]);

  // Load more messages with intelligent source selection
  const loadMore = useCallback(async () => {
    if (!characterName || !channelId || !canMakeRequest()) {
      console.log('Backscroll: Skipping load more - conditions not met');
      return;
    }

    setIsLoading(true);
    setError(null);
    isRequestingRef.current = true;
    lastRequestTimeRef.current = Date.now();

    try {
      console.log('Backscroll: Starting intelligent load more...');
      
      const currentState = getBackscrollState();
      console.log('Backscroll: Current state:', currentState);

      if (currentState.hasMoreLocal) {
        // Load from local storage first
        await loadFromLocal();
      } else if (currentState.hasMoreServer) {
        // Request from server
        await loadFromServer();
      } else {
        console.log('Backscroll: No more messages available from any source');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Failed to load messages: ${errorMessage}`);
      console.error('Backscroll: Error during load more:', err);
    } finally {
      setIsLoading(false);
      isRequestingRef.current = false;
    }
  }, [characterName, channelId, canMakeRequest, getBackscrollState]);

  // Load messages from local storage
  const loadFromLocal = useCallback(async () => {
    console.log('Backscroll: Loading from local storage...');
    
    const lazyState = getLazyLoadingState(characterName, channelId);
    const currentMessages = getMessagesForChannel(characterName, channelId);
    const sortedMessages = [...currentMessages].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Expand the visible message count
    const newLoadedCount = Math.min(
      lazyState.loadedMessageCount + batchSize, 
      currentMessages.length
    );

    // Get the oldest displayed message
    const displayedMessages = sortedMessages.slice(-newLoadedCount);
    const oldestDisplayedMessage = displayedMessages[0];

    // Check if we still have more local messages
    const newHasMoreLocal = newLoadedCount < currentMessages.length || 
      hasMoreLocalMessages(
        characterName, 
        channelId, 
        oldestDisplayedMessage ? new Date(oldestDisplayedMessage.timestamp) : undefined
      );

    console.log('Backscroll: Local load complete', {
      oldCount: lazyState.loadedMessageCount,
      newCount: newLoadedCount,
      totalMessages: currentMessages.length,
      hasMore: newHasMoreLocal
    });

    // Update state
    setLazyLoadingState(characterName, channelId, {
      hasMore: newHasMoreLocal || lazyState.hasMore,
      isLoading: false,
      oldestMessageTime: oldestDisplayedMessage ? new Date(oldestDisplayedMessage.timestamp) : lazyState.oldestMessageTime,
      loadedMessageCount: newLoadedCount
    });
  }, [characterName, channelId, batchSize, getLazyLoadingState, getMessagesForChannel, hasMoreLocalMessages, setLazyLoadingState]);

  // Load messages from server
  const loadFromServer = useCallback(async () => {
    console.log('Backscroll: Loading from server...');
    
    // Set loading state in the store
    setLazyLoadingState(characterName, channelId, { isLoading: true });

    try {
      // Request from backend via existing SignalR method
      await loadMoreMessages(characterName, channelId);
      
      // The SignalR response will trigger message addition and state updates
      console.log('Backscroll: Server request sent successfully');
    } catch (err) {
      throw new Error(`Server request failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [characterName, channelId, loadMoreMessages, setLazyLoadingState]);

  // Dedicated server-only request
  const requestFromServer = useCallback(async () => {
    if (!characterName || !channelId || !canMakeRequest()) {
      return;
    }

    setIsLoading(true);
    setError(null);
    isRequestingRef.current = true;
    lastRequestTimeRef.current = Date.now();

    try {
      await loadFromServer();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Server request failed: ${errorMessage}`);
      console.error('Backscroll: Server request error:', err);
    } finally {
      setIsLoading(false);
      isRequestingRef.current = false;
    }
  }, [characterName, channelId, canMakeRequest, loadFromServer]);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Get current counts
  const { loadedCount, totalCount } = (() => {
    if (!characterName || !channelId) {
      return { loadedCount: 0, totalCount: 0 };
    }

    const messages = getMessagesForChannel(characterName, channelId);
    const lazyState = getLazyLoadingState(characterName, channelId);
    
    return {
      loadedCount: lazyState.loadedMessageCount || 0,
      totalCount: messages.length
    };
  })();

  const state = getBackscrollState();
  const actions = {
    loadMore,
    requestFromServer,
    clearError
  };

  return {
    state,
    actions,
    loadedCount,
    totalCount
  };
}
