'use client';

import { useState, useEffect } from 'react';

interface UnknownChannelNotificationProps {
  channel: string;
  messageCount: number;
  onJoin: () => void;
  onDismiss: () => void;
  autoHideDelay?: number;
}

export default function UnknownChannelNotification({
  channel,
  messageCount,
  onJoin,
  onDismiss,
  autoHideDelay = 5000
}: UnknownChannelNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade out animation
    }, autoHideDelay);

    return () => clearTimeout(timer);
  }, [autoHideDelay, onDismiss]);

  const handleJoin = () => {
    setIsVisible(false);
    setTimeout(onJoin, 150); // Quick fade before action
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  if (!isVisible) {
    return (
      <div className="fixed top-4 right-4 bg-yellow-600 text-white p-4 rounded-lg shadow-lg border border-yellow-500 opacity-0 transition-opacity duration-300 z-50">
        {/* Placeholder for smooth exit */}
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 bg-yellow-600 text-white p-4 rounded-lg shadow-lg border border-yellow-500 transition-opacity duration-300 z-50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-2">
            <span className="mr-2">💬</span>
            <span className="font-semibold">New message{messageCount > 1 ? 's' : ''} in #{channel}</span>
          </div>
          <p className="text-sm text-yellow-100">
            {messageCount} new message{messageCount > 1 ? 's' : ''} from a channel you haven&apos;t joined.
          </p>
        </div>

        <button
          onClick={handleDismiss}
          className="ml-3 text-yellow-200 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex space-x-2 mt-3">
        <button
          onClick={handleJoin}
          className="bg-yellow-500 hover:bg-yellow-400 text-yellow-900 px-3 py-1 rounded text-sm font-medium transition-colors"
        >
          Join Channel
        </button>
        <button
          onClick={handleDismiss}
          className="bg-yellow-700 hover:bg-yellow-600 text-yellow-100 px-3 py-1 rounded text-sm transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}