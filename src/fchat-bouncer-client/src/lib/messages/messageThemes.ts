/**
 * Message theming and styling system
 */

import { MessageTheme, MessageType, MessageStatus } from './messageTypes';

export const darkMessageTheme: MessageTheme = {
  container: 'bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-700 transition-colors',
  header: 'flex items-baseline space-x-2 mb-1',
  content: 'text-gray-200 leading-relaxed',
  timestamp: 'text-xs text-gray-400 hover:text-gray-300 cursor-pointer',
  sender: 'font-semibold text-sm text-gray-100 hover:text-indigo-400 cursor-pointer',
  messageType: {
    'Chat': 'text-gray-400',
    'Action': 'text-purple-400',
    'System': 'text-yellow-400',
    'Private': 'text-blue-400',
    'Announcement': 'text-red-400',
    'Join': 'text-green-400',
    'Leave': 'text-orange-400',
    'Error': 'text-red-500',
    'Roll': 'text-cyan-400'
  },
  status: {
    'sending': 'opacity-50 animate-pulse',
    'sent': 'opacity-100',
    'delivered': 'opacity-100',
    'failed': 'border-l-4 border-red-500 opacity-75 bg-red-900/10',
    'edited': 'opacity-90 border-l-2 border-gray-500'
  }
};

export const lightMessageTheme: MessageTheme = {
  container: 'bg-white rounded-lg p-3 shadow-sm border border-gray-200 transition-colors',
  header: 'flex items-baseline space-x-2 mb-1',
  content: 'text-gray-800 leading-relaxed',
  timestamp: 'text-xs text-gray-500 hover:text-gray-700 cursor-pointer',
  sender: 'font-semibold text-sm text-gray-900 hover:text-indigo-600 cursor-pointer',
  messageType: {
    'Chat': 'text-gray-600',
    'Action': 'text-purple-600',
    'System': 'text-yellow-600',
    'Private': 'text-blue-600',
    'Announcement': 'text-red-600',
    'Join': 'text-green-600',
    'Leave': 'text-orange-600',
    'Error': 'text-red-700',
    'Roll': 'text-cyan-600'
  },
  status: {
    'sending': 'opacity-50 animate-pulse',
    'sent': 'opacity-100',
    'delivered': 'opacity-100',
    'failed': 'border-l-4 border-red-500 opacity-75 bg-red-50',
    'edited': 'opacity-90 border-l-2 border-gray-400'
  }
};

export const compactMessageTheme: MessageTheme = {
  container: 'bg-gray-800 rounded p-2 shadow-sm border border-gray-700 transition-colors',
  header: 'flex items-center space-x-2',
  content: 'text-gray-200 text-sm leading-tight ml-2',
  timestamp: 'text-xs text-gray-500 cursor-pointer',
  sender: 'font-medium text-xs text-gray-100 hover:text-indigo-400 cursor-pointer',
  messageType: {
    'Chat': 'text-gray-500',
    'Action': 'text-purple-500',
    'System': 'text-yellow-500',
    'Private': 'text-blue-500',
    'Announcement': 'text-red-500',
    'Join': 'text-green-500',
    'Leave': 'text-orange-500',
    'Error': 'text-red-600',
    'Roll': 'text-cyan-500'
  },
  status: {
    'sending': 'opacity-50',
    'sent': 'opacity-100',
    'delivered': 'opacity-100',
    'failed': 'border-l-2 border-red-500 opacity-75',
    'edited': 'opacity-90'
  }
};

/**
 * Get theme based on preference
 */
export function getMessageTheme(themeName: 'dark' | 'light' | 'compact' = 'dark'): MessageTheme {
  switch (themeName) {
    case 'light':
      return lightMessageTheme;
    case 'compact':
      return compactMessageTheme;
    case 'dark':
    default:
      return darkMessageTheme;
  }
}

/**
 * Merge custom theme with base theme
 */
export function mergeMessageTheme(baseTheme: MessageTheme, customTheme: Partial<MessageTheme>): MessageTheme {
  return {
    ...baseTheme,
    ...customTheme,
    messageType: { ...baseTheme.messageType, ...customTheme.messageType },
    status: { ...baseTheme.status, ...customTheme.status }
  };
}

/**
 * CSS classes for message animations
 */
export const messageAnimations = {
  enter: 'animate-in slide-in-from-bottom-2 fade-in duration-200',
  exit: 'animate-out slide-out-to-bottom-2 fade-out duration-150',
  highlight: 'animate-pulse duration-1000',
  mention: 'bg-yellow-500/20 border-yellow-500/50 animate-pulse duration-500'
};

/**
 * CSS classes for message states
 */
export const messageStates = {
  selected: 'ring-2 ring-indigo-500 bg-indigo-500/10',
  hovered: 'bg-gray-750', // Consistent hover background without layout changes
  focused: 'ring-1 ring-gray-400',
  grouped: 'mt-1', // Reduced margin for grouped messages
  standalone: 'mt-3' // Normal margin for standalone messages
};