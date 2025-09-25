'use client';

import React, { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { Message } from '@/types';
import { MessageAction, MessageListProps } from '@/lib/messages/messageTypes';
import { filterMessagesByChannel, getDefaultMessageActions } from '@/lib/messages/messageUtils';
import { getMessageTheme, messageStates } from '@/lib/messages/messageThemes';
import MessageComponent from './MessageComponent';
import UserContextMenu from '../UserContextMenu';
import { useLazyMessages } from '@/hooks/useLazyMessages';
import { useCharacterStore } from '@/stores/characterStore';

interface MessageListRef {
  scrollToBottom: () => void;
  scrollToBottomFast: () => void;
  isNearBottom: (thresholdPx?: number) => boolean;
  scrollToMessage: (messageId: string) => void;
}

const MessageList = forwardRef<MessageListRef, MessageListProps>(({
  messages,
  selectedChannel,
  onMessageAction,
  onMessageSelect,
  selectedMessages = [],
  theme,
  virtualized = false,
  showTimestamps = true,
  showAvatars = false,
  groupConsecutive = true,
  enableLazyLoading = true
}, ref) => {
  const [currentUser] = useState('currentUser'); // This would come from auth context
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null);
  const [userContextMenu, setUserContextMenu] = useState<{
    username: string;
    position: { x: number; y: number };
  } | null>(null);

  const { activeCharacter } = useCharacterStore();
  
  // Create fallback ref for when lazy loading is not used
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  
  // Always call the hook, but conditionally use its results
  const lazyMessages = useLazyMessages({
    characterName: activeCharacter || '',
    channelId: selectedChannel || '',
    initialLimit: 20,
    loadMoreThreshold: 100
  });

  // Use lazy loading if enabled and we have a selected channel and active character
  const shouldUseLazyLoading = enableLazyLoading && selectedChannel && activeCharacter;
  
  // Ensure lazyMessages is always defined
  const safeLazyMessages = lazyMessages || {
    messages: [],
    isLoading: false,
    hasMore: false,
    loadMore: () => Promise.resolve(),
    scrollToBottom: () => {},
    isNearTop: () => false,
    containerRef: fallbackRef
  };
  
   const containerRef = shouldUseLazyLoading ? safeLazyMessages.containerRef : fallbackRef;

  // Get messages to display - use lazy loading if enabled, otherwise filter normally
  const filteredMessages = useMemo(() => {
    try {
      if (shouldUseLazyLoading) {
        return safeLazyMessages.messages || [];
      }
      
      if (!selectedChannel) return messages || [];
      return filterMessagesByChannel(messages || [], selectedChannel);
    } catch (error) {
      console.error('Error in filteredMessages useMemo:', error);
      return [];
    }
  }, [shouldUseLazyLoading, safeLazyMessages.messages, messages, selectedChannel]);

  // Get theme
  const messageTheme = useMemo(() => {
    const baseTheme = getMessageTheme('dark');
    return theme ? { ...baseTheme, ...theme } : baseTheme;
  }, [theme]);

  // Get default actions
  const defaultActions = useMemo(() => getDefaultMessageActions(), []);

  // Handle message actions
  const handleMessageAction = useCallback((action: string, message: Message) => {
    onMessageAction?.(action, message);
  }, [onMessageAction]);

  // Handle message selection
  const handleMessageClick = useCallback((message: Message) => {
    onMessageSelect?.(message);
  }, [onMessageSelect]);

  // Handle sender click (left-click = open PM)
  const handleSenderClick = useCallback((sender: string) => {
    // Open PM channel
    const pmChannelId = `PRI-${sender}`;
    console.log('Opening PM with:', sender, 'Channel:', pmChannelId);
    // This will be passed up to ChatInterface to handle PM opening
    onMessageAction?.('openPM', { sender, pmChannelId } as any);
  }, [onMessageAction]);

  // Handle sender right-click (show context menu)
  const handleSenderRightClick = useCallback((sender: string, event: React.MouseEvent) => {
    setUserContextMenu({
      username: sender,
      position: { x: event.clientX, y: event.clientY }
    });
  }, []);

  // Handle PM from context menu
  const handleOpenPM = useCallback((username: string) => {
    const pmChannelId = `PRI-${username}`;
    console.log('Opening PM from context menu with:', username, 'Channel:', pmChannelId);
    onMessageAction?.('openPM', { sender: username, pmChannelId } as any);
  }, [onMessageAction]);

  // Handle profile from context menu
  const handleOpenProfile = useCallback((username: string) => {
    const profileUrl = `https://www.f-list.net/c/${encodeURIComponent(username.toLowerCase())}/`;
    console.log('Opening profile for:', username, 'URL:', profileUrl);
    window.open(profileUrl, '_blank', 'noopener,noreferrer');
  }, []);

  // Close context menu
  const handleCloseContextMenu = useCallback(() => {
    setUserContextMenu(null);
  }, []);

  // Scroll functions
  React.useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (shouldUseLazyLoading) {
        safeLazyMessages.scrollToBottom();
      } else {
        // This would scroll to the bottom of the message list
        const element = document.getElementById('message-list-end');
        element?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    scrollToBottomFast: () => {
      if (shouldUseLazyLoading) {
        safeLazyMessages.scrollToBottom();
      } else {
        const element = document.getElementById('message-list-end');
        element?.scrollIntoView({ behavior: 'auto' });
      }
    },
    isNearBottom: (thresholdPx: number = 120) => {
      const el = containerRef.current;
      if (!el) return true;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      return distanceFromBottom <= thresholdPx;
    },
    scrollToMessage: (messageId: string) => {
      // This would scroll to a specific message
      const element = document.getElementById(`message-${messageId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }));

  // Render empty state
  if (filteredMessages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-6xl mb-4">💬</div>
          <div className="text-lg mb-2">No messages yet</div>
          <div className="text-sm">
            {selectedChannel
              ? `Start chatting in #${selectedChannel}!`
              : 'Select a channel to view messages.'
            }
          </div>
        </div>
      </div>
    );
  }

  // Simple rendering (non-virtualized)
  if (!virtualized) {
    return (
      <div ref={containerRef} className="h-full overflow-y-auto px-4 py-2 space-y-1">
        {/* Enhanced debug info for scrollback */}
        {shouldUseLazyLoading && (
          <div className="text-xs text-gray-500 mb-2 p-2 bg-gray-800 rounded">
            <div className="font-semibold">Enhanced Scrollback Debug:</div>
            <div>• Character: {activeCharacter}</div>
            <div>• Channel: {selectedChannel}</div>
            <div>• Messages: {safeLazyMessages.messages.length}</div>
            <div>• Loading: {safeLazyMessages.isLoading ? 'Yes' : 'No'}</div>
            <div>• Has More: {safeLazyMessages.hasMore ? 'Yes' : 'No'}</div>
            <div>• Scroll Top: {containerRef.current?.scrollTop ?? 'N/A'}</div>
            <div>• Scroll Height: {containerRef.current?.scrollHeight ?? 'N/A'}</div>
            <div>• Client Height: {containerRef.current?.clientHeight ?? 'N/A'}</div>
            <div>• Distance from Bottom: {containerRef.current ? 
              (containerRef.current.scrollHeight - containerRef.current.scrollTop - containerRef.current.clientHeight) : 'N/A'}</div>
            <div>• Distance from Top: {containerRef.current?.scrollTop ?? 'N/A'}</div>
            <div>• Near Bottom: {containerRef.current ? 
              ((containerRef.current.scrollHeight - containerRef.current.scrollTop - containerRef.current.clientHeight) <= 50) : 'N/A'}</div>
            <div>• Near Top: {containerRef.current ? 
              (containerRef.current.scrollTop <= 100) : 'N/A'}</div>
          </div>
        )}
        {/* Loading indicator for lazy loading */}
        {shouldUseLazyLoading && safeLazyMessages.isLoading && safeLazyMessages.hasMore && (
          <div className="flex justify-center py-4">
            <div className="flex items-center space-x-2 text-gray-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
              <span className="text-sm">Loading more backscroll...</span>
            </div>
          </div>
        )}

        {/* Load more button if there are more messages but not loading */}
        {shouldUseLazyLoading && !safeLazyMessages.isLoading && safeLazyMessages.hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={safeLazyMessages.loadMore}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-gray-600 rounded-md hover:border-gray-500 transition-colors"
            >
              Load more backscroll
            </button>
          </div>
        )}
        
        {/* Enhanced test buttons for scrollback debugging */}
        {shouldUseLazyLoading && (
          <div className="flex justify-center py-2 space-x-2 flex-wrap">
            <button
              onClick={async () => {
                console.log('Manual backend test - requesting message history');
                try {
                  const { signalRService } = await import('@/lib/signalr');
                  if (signalRService.isConnected) {
                    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
                    console.log('Requesting history from backend:', { selectedChannel, since });
                    await signalRService.requestHistory(selectedChannel || '', since, 50);
                  } else {
                    console.log('SignalR not connected');
                  }
                } catch (error) {
                  console.error('Backend test failed:', error);
                }
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-md hover:border-gray-600 transition-colors"
            >
              Test Backend
            </button>
            <button
              onClick={() => {
                console.log('Manual load more test');
                safeLazyMessages.loadMore();
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-md hover:border-gray-600 transition-colors"
            >
              Test Load More
            </button>
            <button
              onClick={() => {
                console.log('Check local messages');
                import('@/stores/chatStore').then(({ useChatStore }) => {
                  const store = useChatStore.getState();
                  const allMessages = store.getMessagesForChannel(activeCharacter || '', selectedChannel || '');
                  const lazyState = store.getLazyLoadingState(activeCharacter || '', selectedChannel || '');
                  const localMessages = store.getLocalMessagesForChannel(activeCharacter || '', selectedChannel || '', lazyState.oldestMessageTime || undefined, 20);
                  const hasMoreLocal = store.hasMoreLocalMessages(activeCharacter || '', selectedChannel || '', lazyState.oldestMessageTime || undefined);
                  
                  console.log('Local messages check:', {
                    allMessages: allMessages.length,
                    loadedCount: lazyState.loadedMessageCount,
                    oldestMessageTime: lazyState.oldestMessageTime,
                    localMessages: localMessages.length,
                    hasMoreLocal,
                    lazyState
                  });
                });
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-md hover:border-gray-600 transition-colors"
            >
              Check Local
            </button>
            <button
              onClick={() => {
                console.log('Manual fix hasMore state');
                import('@/stores/chatStore').then(({ useChatStore }) => {
                  const store = useChatStore.getState();
                  const totalMessages = store.getMessagesForChannel(activeCharacter || '', selectedChannel || '');
                  const lazyState = store.getLazyLoadingState(activeCharacter || '', selectedChannel || '');
                  
                  console.log('Current state:', {
                    totalMessages: totalMessages.length,
                    loadedCount: lazyState.loadedMessageCount,
                    hasMore: lazyState.hasMore
                  });
                  
                  if (totalMessages.length > lazyState.loadedMessageCount) {
                    console.log('Setting hasMore to true');
                    store.setLazyLoadingState(activeCharacter || '', selectedChannel || '', { hasMore: true });
                  } else {
                    console.log('No need to set hasMore - all messages are loaded');
                  }
                });
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-md hover:border-gray-600 transition-colors"
            >
              Fix HasMore
            </button>
            <button
              onClick={() => {
                console.log('Manual reinitialize lazy loading');
                import('@/stores/chatStore').then(({ useChatStore }) => {
                  const store = useChatStore.getState();
                  const messages = store.getMessagesForChannel(activeCharacter || '', selectedChannel || '');
                  store.initializeLazyLoading(activeCharacter || '', selectedChannel || '', messages);
                });
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-md hover:border-gray-600 transition-colors"
            >
              Reinit Lazy
            </button>
            <button
              onClick={() => {
                console.log('Scroll to bottom');
                safeLazyMessages.scrollToBottom();
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-md hover:border-gray-600 transition-colors"
            >
              Scroll Bottom
            </button>
            <button
              onClick={() => {
                console.log('Force load more from local');
                import('@/stores/chatStore').then(({ useChatStore }) => {
                  const store = useChatStore.getState();
                  const lazyState = store.getLazyLoadingState(activeCharacter || '', selectedChannel || '');
                  console.log('Lazy Loading: Lazy State:', lazyState);
                  // Get more messages from local storage
                  const localMessages = store.getLocalMessagesForChannel(
                    activeCharacter || '', 
                    selectedChannel || '', 
                    lazyState.oldestMessageTime || undefined, 
                    20
                  );
                  
                  if (localMessages.length > 0) {
                    const sortedMessages = [...localMessages].sort((a, b) => 
                      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    );
                    
                    const oldestMessage = sortedMessages[0];
                    
                    store.setLazyLoadingState(activeCharacter || '', selectedChannel || '', {
                      hasMore: store.hasMoreLocalMessages(activeCharacter || '', selectedChannel || '', oldestMessage ? new Date(oldestMessage.timestamp) : lazyState.oldestMessageTime || undefined),
                      isLoading: false,
                      oldestMessageTime: oldestMessage ? new Date(oldestMessage.timestamp) : lazyState.oldestMessageTime,
                      loadedMessageCount: lazyState.loadedMessageCount + localMessages.length
                    });
                    
                    console.log(`Force loaded ${localMessages.length} messages from local storage`);
                  } else {
                    console.log('No more local messages available');
                  }
                });
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-md hover:border-gray-600 transition-colors"
            >
              Force Load Local
            </button>
            <button
              onClick={() => {
                console.log('Lazy Loading: Reset Loading....');
                safeLazyMessages.isLoading = false;
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-md hover:border-gray-600 transition-colors"
            >
              Reset Loading....
            </button>
          </div>
        )}

        {filteredMessages.map((message, index) => {
          const previousMessage = index > 0 ? filteredMessages[index - 1] : null;
          const isSelected = selectedMessages.includes(message.id);
          const isGrouped = groupConsecutive && index > 0 &&
            message.sender === previousMessage?.sender &&
            message.messageType === 'Chat' &&
            previousMessage?.messageType === 'Chat';

          return (
            <div
              key={`${message.id}-${index}`}
              onMouseEnter={() => setHoveredMessage(message.id)}
              onMouseLeave={() => setHoveredMessage(null)}
            >
              <MessageComponent
                message={message}
                previousMessage={previousMessage}
                currentUser={currentUser}
                theme={messageTheme}
                showTimestamp={showTimestamps}
                showAvatar={showAvatars}
                isSelected={isSelected}
                isGrouped={isGrouped}
                actions={defaultActions}
                onMessageClick={handleMessageClick}
                onSenderClick={handleSenderClick}
                onSenderRightClick={handleSenderRightClick}
                onMessageAction={handleMessageAction}
                className={hoveredMessage === message.id ? messageStates.hovered : ''}
                isHovered={hoveredMessage === message.id}
              />
            </div>
          );
        })}
        <div id="message-list-end" />

        {/* User Context Menu */}
        {userContextMenu && (
          <UserContextMenu
            username={userContextMenu.username}
            position={userContextMenu.position}
            onOpenPM={handleOpenPM}
            onOpenProfile={handleOpenProfile}
            onClose={handleCloseContextMenu}
          />
        )}
      </div>
    );
  }

  // TODO: Implement virtualized rendering for performance with large message lists
  // This would use react-window or similar for thousands of messages
  return (
    <div className="h-full overflow-y-auto px-4 py-2">
      <div className="text-center text-gray-500 py-8">
        Virtualized rendering not yet implemented
      </div>
    </div>
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;