import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { Message } from '@/types';

interface UseLazyMessagesOptions {
  characterName: string;
  channelId: string;
  initialLimit?: number;
  loadMoreThreshold?: number; // Distance from top to trigger loading more messages
}

interface UseLazyMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  scrollToBottom: () => void;
  isNearTop: (threshold?: number) => boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useLazyMessages({
  characterName,
  channelId,
  initialLimit = 20,
  loadMoreThreshold = 100
}: UseLazyMessagesOptions): UseLazyMessagesReturn {
  const {
    getMessagesForChannel,
    getDisplayMessagesForChannel,
    loadMoreMessages,
    getLazyLoadingState,
    setLazyLoadingState,
    initializeLazyLoading,
    addMessages,
    trimChannelMessages,
    getLocalMessagesForChannel,
    hasMoreLocalMessages
  } = useChatStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [shouldLoadMore, setShouldLoadMore] = useState(false);

  // Get current state - only if we have valid character and channel
  const lazyState = characterName && channelId ? getLazyLoadingState(characterName, channelId) : {
    hasMore: false,
    isLoading: false,
    oldestMessageTime: null,
    loadedMessageCount: 0
  };
  // Get all stored messages (unlimited) for scrollback logic
  const allStoredMessages = (characterName && channelId ? getMessagesForChannel(characterName, channelId) : []) || [];
  
  // For display, we'll calculate the messages to show based on lazy loading state in useMemo
  const messages = allStoredMessages; // We'll slice this in useMemo based on loadedMessageCount

  // Initialize lazy loading on first render
  useEffect(() => {
    if (!isInitialized && characterName && channelId) {
      console.log('Initializing lazy loading...', {
        characterName,
        channelId,
        displayMessageCount: messages.length,
        totalStoredMessages: allStoredMessages.length
      });
      
      // Initialize even if no messages yet - this sets up the state properly
      initializeLazyLoading(characterName, channelId, messages);
      setIsInitialized(true);
      
      // After initialization, check if we should update the loadedMessageCount
      setTimeout(() => {
        const state = getLazyLoadingState(characterName, channelId);
        const totalMessages = getMessagesForChannel(characterName, channelId);
        
        console.log('Post-initialization check:', {
          state,
          totalMessages: totalMessages.length,
          shouldHaveMore: totalMessages.length > state.loadedMessageCount
        });
        
        // Sanity check: if loadedMessageCount is greater than actual messages, reset it
        if (state.loadedMessageCount > totalMessages.length) {
          console.log('Lazy loading state corrupted - loadedMessageCount > actual messages. Resetting...');
          const correctLoadedCount = Math.min(totalMessages.length, 20);
          setLazyLoadingState(characterName, channelId, { 
            hasMore: totalMessages.length > 20,
            loadedMessageCount: correctLoadedCount
          });
        }
        // If we have more messages than we're displaying, update the loadedMessageCount
        else if (totalMessages.length > state.loadedMessageCount) {
          console.log('Updating loadedMessageCount to show all available messages');
          setLazyLoadingState(characterName, channelId, { 
            hasMore: true,
            loadedMessageCount: totalMessages.length
          });
        }
      }, 100);
    }
  }, [characterName, channelId, messages, isInitialized, initializeLazyLoading, getLazyLoadingState, getMessagesForChannel, setLazyLoadingState]);

  // Simplified load more function - now delegates to centralized backscroll service
  const loadMore = useCallback(async () => {
    console.log('useLazyMessages: Delegating load more to centralized service');
    
    if (!characterName) return;
    
    try {
      // For backward compatibility, still handle basic loading
      if (!lazyState.isLoading) {
        console.log('useLazyMessages: Loading from server via SignalR');
        setLazyLoadingState(characterName, channelId, { isLoading: true });
        await loadMoreMessages(characterName, channelId);
      }
    } catch (error) {
      console.error('useLazyMessages: Failed to load more messages:', error);
      setLazyLoadingState(characterName, channelId, { isLoading: false });
    }
  }, [characterName, channelId, lazyState.isLoading, loadMoreMessages, setLazyLoadingState]);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  // Check if near top of container
  const isNearTop = useCallback((threshold: number = loadMoreThreshold) => {
    if (!containerRef.current) return false;
    
    const { scrollTop } = containerRef.current;
    const isNear = scrollTop <= threshold;
    
    // Debug logging
    if (isNear) {
      console.log('Lazy loading: Near top detected', { scrollTop, threshold, isNear });
    }
    
    return isNear;
  }, [loadMoreThreshold]);

  // Handle scroll events to detect when to load more messages and trim messages
  const handleScroll = useCallback(() => {
    if (!containerRef.current) {
      console.log('Lazy loading: No container ref');
      return;
    }
    
    const container = containerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const distanceFromTop = scrollTop;
   
    // Check if we're near the bottom (for message trimming)
    const isNearBottom = distanceFromBottom <= 50;

    // Only trim when we're at the bottom AND we have more than 150 messages loaded
    // This prevents trimming during scrollback operations
    // Skip trimming for PM channels (they start with PRI-)
    // At 150 messages, trim to 100, this should stop trim spam so much.
    if (isNearBottom && allStoredMessages.length > 150 && !channelId.startsWith('PRI-')) {
      console.log('Near bottom with many messages, trimming to 100');
      trimChannelMessages(characterName, channelId, 100);
    }
    
    // Check if we're near the top (for loading more messages)
    const isNearTop = distanceFromTop <= loadMoreThreshold;
    
    // Load more messages if we're near the top
    if (isNearTop && !lazyState.isLoading) {
      // Check if we have more messages (local or server)
      const hasMoreLocal = hasMoreLocalMessages(characterName, channelId, lazyState.oldestMessageTime || undefined);
      const hasMoreServer = lazyState.hasMore;
      
      console.log('Scrollback check:', {
        isNearTop,
        isLoading: lazyState.isLoading,
        hasMoreLocal,
        hasMoreServer,
        oldestMessageTime: lazyState.oldestMessageTime,
        totalStoredMessages: allStoredMessages.length,
        displayMessages: messages.length
      });
      
      if (hasMoreLocal || hasMoreServer) {
        console.log('Lazy loading: Near top, triggering load more', { hasMoreLocal, hasMoreServer });
        setShouldLoadMore(true);
      }
    }
  }, [isNearTop, loadMoreThreshold, lazyState.isLoading, lazyState.hasMore, messages.length, trimChannelMessages, characterName, channelId, hasMoreLocalMessages, lazyState.oldestMessageTime, allStoredMessages.length]);

  // Load more messages when threshold is reached
  useEffect(() => {
    if (shouldLoadMore) {
      console.log('Lazy loading: Loading more messages...');
      loadMore();
      setShouldLoadMore(false);
    }
  }, [shouldLoadMore, loadMore]);

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // Handle incoming history messages from SignalR
  useEffect(() => {
    if (!characterName || !channelId) {
      return;
    }

    const handleReceiveHistory = (data: { channel: string; messages: Message[]; hasMore: boolean }) => {
      console.log('useLazyMessages: Received history', { 
        channel: data.channel, 
        messageCount: data.messages.length, 
        hasMore: data.hasMore,
        targetChannel: channelId 
      });
      
      if (data.channel === channelId) {
        // Add new messages to the store
        addMessages(data.messages, characterName);
        
        // Update lazy loading state
        const newMessages = data.messages;
        if (newMessages.length > 0) {
          const sortedMessages = [...newMessages].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          
          const oldestMessage = sortedMessages[0];
          const currentState = getLazyLoadingState(characterName, channelId);
          
          console.log('useLazyMessages: Updating lazy loading state', {
            hasMore: data.hasMore,
            newOldestMessageTime: oldestMessage?.timestamp,
            currentOldestMessageTime: currentState.oldestMessageTime,
            newMessageCount: newMessages.length
          });
          
          setLazyLoadingState(characterName, channelId, {
            hasMore: data.hasMore,
            isLoading: false,
            oldestMessageTime: oldestMessage ? new Date(oldestMessage.timestamp) : currentState.oldestMessageTime,
            loadedMessageCount: currentState.loadedMessageCount + newMessages.length
          });
        } else {
          // No more messages available
          console.log('useLazyMessages: No more messages available - setting hasMore to false');
          setLazyLoadingState(characterName, channelId, {
            hasMore: false,
            isLoading: false
          });
        }
      }
    };

    // Import signalr connection and set up listener
    import('@/lib/signalr').then(({ signalRService }) => {
      if (signalRService.isConnected) {
        signalRService.onReceiveHistory(handleReceiveHistory);
        
        return () => {
          signalRService.removeListener('ReceiveHistory');
        };
      }
    });
  }, [characterName, channelId, addMessages, getLazyLoadingState, setLazyLoadingState]);

  // Ensure we always return a valid object with stable references
  const result = useMemo(() => {
    // Get the current loaded message count from lazy loading state
    const loadedCount = lazyState.loadedMessageCount || initialLimit;
    
    // Show the most recent messages up to the loaded count
    // Messages are already sorted by timestamp, so we take the last N messages
    const displayMessages = (messages || []).slice(-loadedCount);
    
    const result = {
      messages: displayMessages,
      isLoading: lazyState.isLoading,
      hasMore: lazyState.hasMore,
      loadMore,
      scrollToBottom,
      isNearTop,
      containerRef
    };
    return result;
  }, [messages, initialLimit, lazyState.isLoading, lazyState.hasMore, lazyState.loadedMessageCount, loadMore, scrollToBottom, isNearTop, containerRef, characterName, channelId]);

  return result;
}
