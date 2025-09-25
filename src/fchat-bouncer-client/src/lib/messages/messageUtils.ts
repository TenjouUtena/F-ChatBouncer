/**
 * Utility functions for message processing and formatting
 */

import { Message } from '@/types';
import { MessageType, MessageStatus } from './messageTypes';
import { bbcodeToHtml, getPlainText } from '../bbcode';
import * as he from 'he';

/**
 * Format a timestamp for message display
 */
export function formatMessageTimestamp(timestamp: string, format: 'short' | 'long' | 'relative' = 'short'): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  switch (format) {
    case 'relative':
      if (diffMinutes < 1) return 'just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();

    case 'long':
      return date.toLocaleString();

    case 'short':
    default:
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
  }
}

/**
 * Get CSS classes for message type styling
 */
export function getMessageTypeStyles(messageType: MessageType, isDark = true): string {
  const baseClasses = isDark ? 'text-xs font-medium' : 'text-xs font-medium';

  switch (messageType) {
    case 'System':
    case 'Join':
    case 'Leave':
      return `${baseClasses} text-yellow-400`;
    case 'Action':
      return `${baseClasses} text-purple-400`;
    case 'Private':
      return `${baseClasses} text-blue-400`;
    case 'Announcement':
      return `${baseClasses} text-red-400`;
    case 'Error':
      return `${baseClasses} text-red-500`;
    case 'Roll':
      return `${baseClasses} text-cyan-400`;
    case 'Chat':
    default:
      return `${baseClasses} text-gray-400`;
  }
}

/**
 * Get CSS classes for message status
 */
export function getMessageStatusStyles(status: MessageStatus): string {
  switch (status) {
    case 'sending':
      return 'opacity-50';
    case 'failed':
      return 'border-l-4 border-red-500 opacity-75';
    case 'edited':
      return 'opacity-90';
    case 'sent':
    case 'delivered':
    default:
      return '';
  }
}

/**
 * Process message content for display
 */
export function processMessageContent(content: string, messageType: MessageType): string {
  // First decode any HTML entities that might be in the content
  const decodedContent = he.decode(content);
  
  // Convert BBCode to HTML for rich text display
  let processedContent = bbcodeToHtml(decodedContent);

  // Handle different message types
  switch (messageType) {
    case 'Action':
      // Action messages are typically in third person
      processedContent = `<em>${processedContent}</em>`;
      break;
    case 'System':
    case 'Join':
    case 'Leave':
      // System messages might have special formatting
      processedContent = `<span class="italic">${processedContent}</span>`;
      break;
    case 'Roll':
      // Dice roll messages get special styling with dice emoji
      processedContent = `<span class="font-mono bg-cyan-900/20 px-2 py-1 rounded border border-cyan-500/30">🎲 ${processedContent}</span>`;
      break;
  }

  return processedContent;
}

/**
 * Extract mentions from message content
 */
export function extractMentions(content: string): string[] {
  // Decode HTML entities first to ensure mentions are properly extracted
  const decodedContent = he.decode(content);
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(decodedContent)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Check if a message mentions a specific user
 */
export function messageContainsMention(message: Message, username: string): boolean {
  const mentions = extractMentions(message.content);
  return mentions.includes(username);
}

/**
 * Get plain text preview of a message (for notifications, search, etc.)
 */
export function getMessagePreview(message: Message, maxLength = 100): string {
  let preview = getPlainText(message.content);

  if (message.messageType === 'Action') {
    preview = `${message.sender} ${preview}`;
  }

  if (preview.length > maxLength) {
    preview = preview.substring(0, maxLength) + '...';
  }

  return preview;
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if two messages should be grouped together (consecutive messages from same user)
 */
export function shouldGroupMessages(currentMessage: Message, previousMessage: Message | null, maxGroupTimeMs = 300000): boolean {
  if (!previousMessage) return false;

  const timeDiff = new Date(currentMessage.timestamp).getTime() - new Date(previousMessage.timestamp).getTime();

  return (
    currentMessage.sender === previousMessage.sender &&
    currentMessage.messageType === previousMessage.messageType &&
    (currentMessage.messageType === 'Chat' || currentMessage.messageType === 'Roll') && // Only group chat and roll messages
    timeDiff < maxGroupTimeMs // Within 5 minutes
  );
}

/**
 * Filter messages by channel
 */
export function filterMessagesByChannel(messages: Message[], channel: string): Message[] {
  return messages.filter(message => message.channel === channel);
}

/**
 * Search messages by content
 */
export function searchMessages(messages: Message[], query: string): Message[] {
  const lowercaseQuery = query.toLowerCase();
  return messages.filter(message => {
    const content = getPlainText(message.content).toLowerCase();
    const sender = message.sender.toLowerCase();
    return content.includes(lowercaseQuery) || sender.includes(lowercaseQuery);
  });
}

/**
 * Get default message actions
 */
export function getDefaultMessageActions(): import('./messageTypes').MessageAction[] {
  return [
    {
      id: 'copy',
      label: 'Copy Message',
      shortcut: 'Ctrl+C',
      handler: (message) => {
        navigator.clipboard.writeText(getPlainText(message.content));
      }
    },
    {
      id: 'copy-link',
      label: 'Copy Link',
      handler: (message) => {
        const url = `#${message.channel}/${message.id}`;
        navigator.clipboard.writeText(url);
      }
    },
    {
      id: 'quote',
      label: 'Quote',
      handler: (message) => {
        // This would be handled by the parent component
        console.log('Quote message:', message.id);
      },
      visible: (message) => message.messageType === 'Chat'
    }
  ];
}