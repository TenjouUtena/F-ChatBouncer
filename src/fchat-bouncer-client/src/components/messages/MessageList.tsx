'use client';

import React, { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { Message } from '@/types';
import { MessageAction, MessageListProps } from '@/lib/messages/messageTypes';
import { filterMessagesByChannel, getDefaultMessageActions } from '@/lib/messages/messageUtils';
import { getMessageTheme, messageStates } from '@/lib/messages/messageThemes';
import MessageComponent from './MessageComponent';
import UserContextMenu from '../UserContextMenu';
import ProfileModal from '../ProfileModal';
import { useChannelMessages } from '@/hooks/useChannelMessages';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import { useFriendsStore } from '@/stores/friendsStore';
import { useAuthStore } from '@/stores/authStore';
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
  groupConsecutive = true
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
  
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const channelMessages = useChannelMessages({
    characterName: activeCharacter || undefined,
    channelId: selectedChannel || undefined,
    limit: 50
  });
  const usingStoreMessages = Boolean(activeCharacter && selectedChannel);
  const containerRef = usingStoreMessages ? channelMessages.containerRef : fallbackRef;

  const displayedMessages = useMemo(() => {
    try {
      if (usingStoreMessages) {
        return channelMessages.messages || [];
      }
      
      if (!selectedChannel) return messages || [];
      return filterMessagesByChannel(messages || [], selectedChannel);
    } catch (error) {
      console.error('Error building displayedMessages useMemo:', error);
      return [];
    }
  }, [usingStoreMessages, channelMessages.messages, messages, selectedChannel]);

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

  // Scroll functions exposed via ref
  React.useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (usingStoreMessages) {
        channelMessages.scrollToBottom('smooth');
        return;
      }
      const element = containerRef.current;
      element?.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    },
    scrollToBottomFast: () => {
      if (usingStoreMessages) {
        channelMessages.scrollToBottom('auto');
        return;
      }
      const element = containerRef.current;
      element?.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
    },
    isNearBottom: (thresholdPx: number = 120) => {
      if (usingStoreMessages) {
        return channelMessages.isNearBottom(thresholdPx);
      }
      const el = containerRef.current;
      if (!el) return true;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      return distanceFromBottom <= thresholdPx;
    },
    scrollToMessage: (messageId: string) => {
      const element = document.getElementById(`message-${messageId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }));

  // Render empty state
  if (displayedMessages.length === 0) {
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
        </div>
      </div>
    );
  }

  // Simple rendering (non-virtualized)
  if (!virtualized) {
    return (
      <div ref={containerRef} className="h-full overflow-y-auto px-4 py-2 space-y-1">
        {displayedMessages.map((message, index) => {
          const previousMessage = index > 0 ? displayedMessages[index - 1] : null;
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