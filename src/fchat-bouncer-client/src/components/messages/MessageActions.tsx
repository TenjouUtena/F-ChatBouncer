'use client';

import React, { useEffect, useRef } from 'react';
import { Message } from '@/types';
import { MessageAction } from '@/lib/messages/messageTypes';

interface MessageActionsProps {
  message: Message;
  actions: MessageAction[];
  position: { x: number; y: number };
  onActionSelect: (actionId: string) => void;
  onClose: () => void;
}

export default function MessageActions({
  message,
  actions,
  position,
  onActionSelect,
  onClose
}: MessageActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Filter actions based on visibility
  const visibleActions = actions.filter(action =>
    !action.visible || action.visible(message)
  );

  if (visibleActions.length === 0) {
    return null;
  }

  // Adjust position to keep menu in viewport
  const adjustedPosition = { ...position };
  if (typeof window !== 'undefined') {
    const menuWidth = 200; // Estimated menu width
    const menuHeight = visibleActions.length * 40; // Estimated menu height

    if (position.x + menuWidth > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - menuWidth - 10;
    }

    if (position.y + menuHeight > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - menuHeight - 10;
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Context Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-1 min-w-[180px]"
        style={{
          left: adjustedPosition.x,
          top: adjustedPosition.y
        }}
      >
        {visibleActions.map((action, index) => {
          const isDisabled = action.disabled?.(message) ?? false;

          return (
            <button
              key={action.id}
              className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between ${
                isDisabled
                  ? 'text-gray-500 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-700 hover:text-white'
              }`}
              onClick={() => !isDisabled && onActionSelect(action.id)}
              disabled={isDisabled}
            >
              <span className="flex items-center">
                {action.icon && (
                  <span className="mr-2 text-base">{action.icon}</span>
                )}
                {action.label}
              </span>

              {action.shortcut && !isDisabled && (
                <span className="text-xs text-gray-400 ml-4">
                  {action.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}