'use client';

import React, { memo, useState, useCallback } from 'react';
import { Message } from '@/types';
import { MessageAction, MessageTheme } from '@/lib/messages/messageTypes';
import {
  formatMessageTimestamp,
  getMessageTypeStyles,
  getMessageStatusStyles,
  processMessageContent,
  messageContainsMention,
  shouldGroupMessages
} from '@/lib/messages/messageUtils';
import { darkMessageTheme, messageStates } from '@/lib/messages/messageThemes';
import { getCharacterNameStyle, getCharacterColor } from '@/lib/genderColors';
import { useChatStore } from '@/stores/chatStore';
import { useSpoilerHandler } from '@/hooks/useSpoilerHandler';
import MessageActions from './MessageActions';

interface MessageComponentProps {
  message: Message;
  previousMessage?: Message | null;
  currentUser?: string;
  theme?: Partial<MessageTheme>;
  showTimestamp?: boolean;
  showAvatar?: boolean;
  isSelected?: boolean;
  isGrouped?: boolean;
  actions?: MessageAction[];
  onMessageClick?: (message: Message) => void;
  onSenderClick?: (sender: string) => void;
  onSenderRightClick?: (sender: string, event: React.MouseEvent) => void;
  onMessageAction?: (action: string, message: Message) => void;
  className?: string;
  isHovered?: boolean;
}

function MessageComponent({
  message,
  previousMessage = null,
  currentUser,
  theme = {},
  showTimestamp = true,
  showAvatar = false,
  isSelected = false,
  isGrouped,
  actions = [],
  onMessageClick,
  onSenderClick,
  onSenderRightClick,
  onMessageAction,
  className = '',
  isHovered = false
}: MessageComponentProps) {
  // Get profile to determine gender for color coding
  const { getProfile, getProfileRequestStatus, isProfileStale, refreshProfile, requestProfileForCharacter } = useChatStore();
  const senderProfile = getProfile(message.sender);
  const senderGender = senderProfile?.gender || 'None';
  const profileStatus = getProfileRequestStatus(message.sender);
  const isStale = isProfileStale(message.sender);

  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Hook to handle spoiler interactions
  const spoilerContainerRef = useSpoilerHandler();

  // Merge theme with default
  const mergedTheme = { ...darkMessageTheme, ...theme };

  // Determine if this message should be grouped
  const shouldGroup = isGrouped ?? shouldGroupMessages(message, previousMessage);

  // Check if message mentions current user
  const hasMention = currentUser ? messageContainsMention(message, currentUser) : false;

  const isMe = currentUser === message.sender;

  // Get CSS classes
  const containerClasses = [
    mergedTheme.container,
    message.status ? mergedTheme.status[message.status] : '',
    isSelected ? messageStates.selected : '',
    shouldGroup ? messageStates.grouped : messageStates.standalone,
    hasMention ? 'ring-1 ring-yellow-500 bg-yellow-500/5' : '',
    isMe ? 'bg-green-500/5' : '',
    className
  ].filter(Boolean).join(' ');

  const messageTypeClasses = mergedTheme.messageType[message.messageType];

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (actions.length === 0) return;

    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  }, [actions.length]);

  // Handle message click
  const handleMessageClick = useCallback(() => {
    onMessageClick?.(message);
  }, [message, onMessageClick]);

  // Handle sender click
  const handleSenderClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Handle cache miss scenarios
    if (!senderProfile && profileStatus === 'idle') {
      // No profile and no request in progress - request it
      requestProfileForCharacter(message.sender);
    } else if (senderProfile && isStale && profileStatus !== 'requesting') {
      // Profile exists but is stale - refresh it
      await refreshProfile(message.sender);
    }

    onSenderClick?.(message.sender);
  }, [message.sender, onSenderClick, senderProfile, profileStatus, isStale, requestProfileForCharacter, refreshProfile]);

  // Handle sender right-click
  const handleSenderRightClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSenderRightClick?.(message.sender, e);
  }, [message.sender, onSenderRightClick]);

  // Helper to escape HTML entities for safe insertion
  const escapeHtml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Process message content
  const isMeAction = message.content.trim().toLowerCase().startsWith('/me');
  let processedContent = processMessageContent(message.content, message.messageType);
  if (isMeAction) {
    const rest = message.content.replace(/^\s*\/me\s*/i, '');
    const coloredName = `<span style="color:${getCharacterColor(senderGender)};font-weight:bold;">${escapeHtml(message.sender)}</span>`;
    const restProcessed = processMessageContent(rest, message.messageType);
    processedContent = `${coloredName} ${restProcessed}`;
  }

  // Extract Species from profile (case-insensitive) across sections
  const senderSpecies = React.useMemo(() => {
    if (!senderProfile) return '';
    const findKeyCI = (obj: Record<string, any> | undefined | null, key: string): string | '' => {
      if (!obj) return '';
      const target = key.toLowerCase();
      for (const [k, v] of Object.entries(obj)) {
        if (k.toLowerCase() === target) {
          return typeof v === 'string' ? v : JSON.stringify(v);
        }
      }
      return '';
    };
    return (
      findKeyCI(senderProfile.info, 'Species')
    );
  }, [senderProfile]);

  // Build rich tooltip content including all profile tiers
  const profileTooltip = React.useMemo(() => {
    const header = `${message.sender} (${senderGender})`;
    const statusSuffix = profileStatus === 'requesting'
      ? ' - Loading profile...'
      : (profileStatus === 'failed'
          ? ' - Failed to load profile'
          : (isStale ? ' - Profile data is stale' : ''));

    if (!senderProfile) {
      return `${header}${statusSuffix || ' - No profile loaded'}`;
    }

    const lines: string[] = [];
    lines.push(`${header}${statusSuffix}`);
    lines.push(`Last updated: ${new Date(senderProfile.timestamp).toLocaleString()}`);
    const pushSection = (record: Record<string, any>, title: string) => {
      const entries = Object.entries(record || {});
      if (entries.length === 0) return;
      lines.push(`\n${title}:`);
      for (const [key, value] of entries) {
        const printable = typeof value === 'string' ? value : JSON.stringify(value);
        lines.push(`- ${key}: ${printable}`);
      }
    };
    pushSection(senderProfile.info, 'Info');

    return lines.join('\n');
  }, [message.sender, senderGender, senderProfile, profileStatus, isStale]);

  // Close context menu
  const handleCloseContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  // Handle action selection
  const handleActionSelect = useCallback((actionId: string) => {
    const action = actions.find(a => a.id === actionId);
    if (action) {
      action.handler(message);
      onMessageAction?.(actionId, message);
    }
    handleCloseContextMenu();
  }, [actions, message, onMessageAction, handleCloseContextMenu]);

  return (
    <div
      className={`${containerClasses} relative`}
      onClick={handleMessageClick}
      onContextMenu={handleContextMenu}
      role="listitem"
      aria-label={`Message from ${message.sender} at ${formatMessageTimestamp(message.timestamp)}`}
    >
      {/* Avatar (if enabled and not grouped) */}
      {showAvatar && !shouldGroup && (
        <div className="flex-shrink-0 mr-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
            {message.sender.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Message Header (sender, timestamp, type) - only show if not grouped */}
        {!shouldGroup && (
          <div className={mergedTheme.header}>
            <button
              className={`${mergedTheme.sender} transition-colors flex items-center gap-1`}
              style={getCharacterNameStyle(senderGender)}
              onClick={handleSenderClick}
              onContextMenu={handleSenderRightClick}
              title={profileTooltip}
            >
              {message.sender}
              {senderSpecies && (
                <span className="text-gray-400 opacity-75 text-xs">({senderSpecies})</span>
              )}
              {profileStatus === 'requesting' && (
                <span className="text-xs opacity-60 animate-spin">⟳</span>
              )}
              {profileStatus === 'failed' && (
                <span className="text-xs opacity-60 text-red-400">⚠</span>
              )}
              {senderProfile && isStale && profileStatus !== 'requesting' && (
                <span className="text-xs opacity-60 text-yellow-400">⟳</span>
              )}
            </button>

            {showTimestamp && (
              <span
                className={mergedTheme.timestamp}
                title={formatMessageTimestamp(message.timestamp, 'long')}
              >
                {formatMessageTimestamp(message.timestamp)}
              </span>
            )}

            {message.messageType !== 'Chat' && (
              <span className={messageTypeClasses}>
                {message.messageType}
              </span>
            )}

            {message.status === 'edited' && (
              <span className="text-xs text-gray-500 italic">
                (edited)
              </span>
            )}
          </div>
        )}

        {/* Message Content */}
        <div
          ref={spoilerContainerRef}
          className={`${mergedTheme.content} ${shouldGroup ? 'ml-0' : ''}`}
          dangerouslySetInnerHTML={{ __html: processedContent }}
        />

        {/* Reply indicator */}
        {message.replyTo && (
          <div className="text-xs text-gray-500 mt-1 italic">
            Replying to message
          </div>
        )}

        {/* Status indicator */}
        {message.status === 'failed' && (
          <div className="text-xs text-red-400 mt-1 flex items-center">
            <span className="mr-1">⚠️</span>
            Failed to send
          </div>
        )}
      </div>

      {/* Quick Actions - Positioned in upper right corner */}
      {isHovered && actions.length > 0 && (
        <div className="absolute top-2 right-2 flex items-center space-x-1 bg-gray-800 rounded-md shadow-lg border border-gray-600 opacity-90 hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 rounded hover:bg-gray-600 text-gray-400 hover:text-gray-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const copyAction = actions.find(a => a.id === 'copy');
              if (copyAction) copyAction.handler(message);
            }}
            title="Copy message"
          >
            📋
          </button>
          <button
            className="p-1.5 rounded hover:bg-gray-600 text-gray-400 hover:text-gray-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenuPosition({ x: e.clientX, y: e.clientY });
            }}
            title="More actions"
          >
            ⋯
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenuPosition && (
        <MessageActions
          message={message}
          actions={actions}
          position={contextMenuPosition}
          onActionSelect={handleActionSelect}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
}

export default memo(MessageComponent);