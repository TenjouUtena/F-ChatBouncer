'use client';

import { useState, useEffect } from 'react';

interface TypingToastNotificationProps {
  fromCharacter: string;
  status: 'typing' | 'paused' | 'clear';
  onDismiss: () => void;
  autoHideDelay?: number;
}

export default function TypingToastNotification({
  fromCharacter,
  status,
  onDismiss,
  autoHideDelay = 3000
}: TypingToastNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade out animation
    }, autoHideDelay);

    return () => clearTimeout(timer);
  }, [autoHideDelay, onDismiss]);

  const getStatusText = () => {
    switch (status) {
      case 'typing':
        return 'is typing...';
      case 'paused':
        return 'entered text';
      case 'clear':
      default:
        return '';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'typing':
        return '⌨️';
      case 'paused':
        return '📝';
      case 'clear':
      default:
        return '💬';
    }
  };

  if (!isVisible) {
    return (
      <div className="fixed top-4 right-4 bg-blue-600 text-white p-3 rounded-lg shadow-lg border border-blue-500 opacity-0 transition-opacity duration-300 z-50">
        {/* Placeholder for smooth exit */}
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 bg-blue-600 text-white p-3 rounded-lg shadow-lg border border-blue-500 transition-opacity duration-300 z-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="mr-2 text-lg">{getStatusIcon()}</span>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">{fromCharacter}</span>
            <span className="text-xs text-blue-100">{getStatusText()}</span>
          </div>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onDismiss, 150);
          }}
          className="ml-3 text-blue-200 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
