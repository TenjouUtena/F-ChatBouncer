/**
 * Enhanced message types and interfaces for the F-Chat bouncer
 */

import type { Message } from '@/types';

// Re-export the unified Message type from main types
export type { Message } from '@/types';

export type MessageType = 'Chat' | 'Action' | 'System' | 'Private' | 'Announcement' | 'Join' | 'Leave' | 'Error' | 'Roll';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed' | 'edited';

export interface MessageAction {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  handler: (message: Message) => void;
  visible?: (message: Message) => boolean;
  disabled?: (message: Message) => boolean;
}

export interface MessageTheme {
  container: string;
  header: string;
  content: string;
  timestamp: string;
  sender: string;
  messageType: Record<MessageType, string>;
  status: Record<MessageStatus, string>;
}

export interface MessageContextMenuProps {
  message: Message;
  actions: MessageAction[];
  onClose: () => void;
  position: { x: number; y: number };
}

export interface MessageListProps {
  messages: Message[];
  selectedChannel?: string;
  onMessageAction?: (action: string, message: Message) => void;
  onMessageSelect?: (message: Message) => void;
  selectedMessages?: string[];
  theme?: Partial<MessageTheme>;
  virtualized?: boolean;
  showTimestamps?: boolean;
  showAvatars?: boolean;
  groupConsecutive?: boolean;
  enableLazyLoading?: boolean;
}