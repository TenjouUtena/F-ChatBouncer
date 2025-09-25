/**
 * Message components exports
 */

export { default as MessageComponent } from './MessageComponent';
export { default as MessageList } from './MessageList';
export { default as MessageActions } from './MessageActions';

// Re-export types and utilities for convenience
export type {
  Message,
  MessageAction,
  MessageTheme,
  MessageListProps,
  MessageContextMenuProps
} from '@/lib/messages/messageTypes';

export {
  formatMessageTimestamp,
  getMessageTypeStyles,
  processMessageContent,
  getDefaultMessageActions
} from '@/lib/messages/messageUtils';

export {
  getMessageTheme,
  darkMessageTheme,
  lightMessageTheme,
  compactMessageTheme
} from '@/lib/messages/messageThemes';