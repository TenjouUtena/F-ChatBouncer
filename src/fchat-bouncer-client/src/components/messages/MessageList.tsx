'use client';

import React, { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { Message } from '@/types';
import { MessageAction, MessageListProps } from '@/lib/messages/messageTypes';
import { filterMessagesByChannel, getDefaultMessageActions } from '@/lib/messages/messageUtils';
import { getMessageTheme, messageStates } from '@/lib/messages/messageThemes';
import MessageComponent from './MessageComponent';
import UserContextMenu from '../UserContextMenu';
import ProfileModal from '../ProfileModal';
import { useLazyMessages } from '@/hooks/useLazyMessages';
import { useBackscrollService } from '@/hooks/useBackscrollService';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import { useFriendsStore } from '@/stores/friendsStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { api } from '@/lib/api';

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
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileCharacter, setSelectedProfileCharacter] = useState<string>('');

  const { activeCharacter } = useCharacterIndexedDBStore();
  const { bookmarks, addBookmark, removeBookmark } = useFriendsStore();
  const { token } = useAuthStore();
  const { getProfile } = useChatStore();
  
  // Create fallback ref for when lazy loading is not used
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  
  // Always call the hook, but conditionally use its results
  const lazyMessages = useLazyMessages({
    characterName: activeCharacter || '',
    channelId: selectedChannel || '',
    initialLimit: 20,
    loadMoreThreshold: 100
  });

  // Initialize backscroll service
  const backscrollService = useBackscrollService({
    characterName: activeCharacter || '',
    channelId: selectedChannel || '',
    batchSize: 20
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
  const handleSenderClick = useCallback((sender: string, event: React.MouseEvent) => {
    // Show context menu instead of opening PM directly
    setUserContextMenu({
      username: sender,
      position: { x: event.clientX, y: event.clientY }
    });
  }, []);

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

  const handleOpenInternalProfile = useCallback((username: string) => {
    setSelectedProfileCharacter(username);
    setShowProfileModal(true);
  }, []);

  const handleCloseProfileModal = useCallback(() => {
    setShowProfileModal(false);
    setSelectedProfileCharacter('');
  }, []);

  // Close context menu
  const handleCloseContextMenu = useCallback(() => {
    setUserContextMenu(null);
  }, []);

  // Handle bookmark actions
  const handleAddBookmark = useCallback(async (username: string) => {
    if (!token) {
      console.error('No authentication token available');
      return;
    }

    try {
      await api.addBookmark(token, username);
      addBookmark(username);
      console.log('Bookmark added for:', username);
    } catch (error) {
      console.error('Error adding bookmark:', error);
    }
  }, [token, addBookmark]);

  const handleRemoveBookmark = useCallback(async (username: string) => {
    if (!token) {
      console.error('No authentication token available');
      return;
    }

    try {
      await api.removeBookmark(token, username);
      removeBookmark(username);
      console.log('Bookmark removed for:', username);
    } catch (error) {
      console.error('Error removing bookmark:', error);
    }
  }, [token, removeBookmark]);

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
          <div className="text-sm mb-4">
            {selectedChannel
              ? `Start chatting in #${selectedChannel}!`
              : 'Select a channel to view messages.'
            }
          </div>
          
          {/* Backscroll Button - Show only when there should be messages */}
          {shouldUseLazyLoading && selectedChannel && activeCharacter && (
            <button
              onClick={() => backscrollService.actions.loadMore()}
              disabled={backscrollService.state.isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                         text-white text-sm rounded-md transition-colors duration-200
                         flex items-center space-x-2 mx-auto"
            >
              {backscrollService.state.isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <span>🔙</span>
                  <span>Load Backscroll</span>
                </>
              )}
            </button>
          )}
          
          {/* Error Display */}
          {backscrollService.state.error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-600 rounded-md">
              <div className="text-red-300 text-sm">{backscrollService.state.error}</div>
              <button
                onClick={() => backscrollService.actions.clearError()}
                className="text-red-400 hover:text-red-300 text-xs mt-1"
              >
                Dismiss
              </button>
            </div>
          )}
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
        
        {/* Central Backscroll Button */}
        {shouldUseLazyLoading && (backscrollService.state.hasMoreLocal || backscrollService.state.hasMoreServer) && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => backscrollService.actions.loadMore()}
              disabled={backscrollService.state.isLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                         text-white text-sm rounded-lg transition-colors duration-200
                         flex items-center space-x-3 shadow-lg hover:shadow-xl
                         disabled:cursor-not-allowed"
            >
              {backscrollService.state.isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Loading backscroll...</span>
                </>
              ) : (
                <>
                  <span className="text-lg">🔙</span>
                  <div className="text-left">
                    <div className="font-medium">Load Backscroll</div>
                    <div className="text-xs opacity-75">
                      {backscrollService.loadedCount} of {backscrollService.totalCount} messages
                    </div>
                  </div>
                </>
              )}
            </button>
          </div>
        )}

        {/* Server-only backscroll button */}
        {shouldUseLazyLoading && !backscrollService.state.hasMoreLocal && backscrollService.state.hasMoreServer && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => backscrollService.actions.requestFromServer()}
              disabled={backscrollService.state.isLoading}
              className="px-4 py-2 text-gray-500 hover:text-gray-300 border border-gray-600 rounded-md 
                         hover:border-gray-500 transition-colors duration-200 text-xs"
            >
              Load from Server
            </button>
          </div>
        )}

        {/* Error Display */}
        {backscrollService.state.error && (
          <div className="mx-4 mb-4 p-3 bg-red-900/50 border border-red-600 rounded-md">
            <div className="text-red-300 text-sm">{backscrollService.state.error}</div>
            <button
              onClick={() => backscrollService.actions.clearError()}
              className="text-red-400 hover:text-red-300 text-xs mt-1"
            >
              Dismiss
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
            onOpenInternalProfile={handleOpenInternalProfile}
            onAddBookmark={handleAddBookmark}
            onRemoveBookmark={handleRemoveBookmark}
            isBookmarked={bookmarks.includes(userContextMenu.username)}
            onClose={handleCloseContextMenu}
          />
        )}

        {/* Profile Modal */}
        <ProfileModal
          isOpen={showProfileModal}
          onClose={handleCloseProfileModal}
          //profileData={selectedProfileCharacter ? getProfile(selectedProfileCharacter) : null}
          characterName={selectedProfileCharacter}
        />
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