'use client';

import { MessageSquare, MessageSquareMore, Hash } from 'lucide-react';
import { TypingState } from '@/types';

interface TypingIndicatorProps {
  typingState: TypingState | null;
  isPM?: boolean;
  className?: string;
}

export default function TypingIndicator({ typingState, isPM = true, className = '' }: TypingIndicatorProps) {
  if (!typingState) {
    return null;
  }

  const getIcon = () => {
    switch (typingState.status) {
      case 'typing':
        return isPM ? (
          <MessageSquare 
            size={16} 
            className="text-gray-400 animate-bounce" 
          />
        ) : (
          <Hash 
            size={16} 
            className="text-gray-400 animate-bounce" 
          />
        );
      case 'paused':
        return isPM ? (
          <MessageSquareMore 
            size={16} 
            className="text-gray-400" 
          />
        ) : (
          <Hash 
            size={16} 
            className="text-gray-400" 
          />
        );
      case 'clear':
      default:
        return isPM ? (
          <MessageSquare 
            size={16} 
            className="text-gray-400" 
          />
        ) : (
          <Hash 
            size={16} 
            className="text-gray-400" 
          />
        );
    }
  };

  const getText = () => {
    switch (typingState.status) {
      case 'typing':
        return 'typing...';
      case 'paused':
        return 'entered text';
      case 'clear':
      default:
        return '';
    }
  };

  return (
    <div className={`flex items-center ${className}`}>
      <span className="mr-1">
        {getIcon()}
      </span>
      <span className="text-xs text-gray-400 opacity-75">
        {getText()}
      </span>
    </div>
  );
}
