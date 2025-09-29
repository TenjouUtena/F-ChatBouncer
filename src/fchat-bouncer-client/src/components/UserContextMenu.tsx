'use client';

import { useState, useEffect, useRef } from 'react';

interface UserContextMenuProps {
  username: string;
  position: { x: number; y: number };
  onOpenPM: (username: string) => void;
  onOpenProfile: (username: string) => void;
  onOpenInternalProfile: (username: string) => void;
  onAddBookmark?: (username: string) => void;
  onRemoveBookmark?: (username: string) => void;
  isBookmarked?: boolean;
  onClose: () => void;
}

export default function UserContextMenu({
  username,
  position,
  onOpenPM,
  onOpenProfile,
  onOpenInternalProfile,
  onAddBookmark,
  onRemoveBookmark,
  isBookmarked = false,
  onClose
}: UserContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Adjust position to keep menu in viewport
    const adjustPosition = () => {
      if (!menuRef.current || typeof window === 'undefined') return;

      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = position.x;
      let newY = position.y;

      // Adjust X position if menu would overflow right edge
      if (position.x + rect.width > viewportWidth) {
        newX = viewportWidth - rect.width - 10;
      }

      // Adjust Y position if menu would overflow bottom edge
      if (position.y + rect.height > viewportHeight) {
        newY = viewportHeight - rect.height - 10;
      }

      // Ensure menu doesn't go off left or top edge
      newX = Math.max(10, newX);
      newY = Math.max(10, newY);

      setAdjustedPosition({ x: newX, y: newY });
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    // Adjust position after component mounts
    setTimeout(adjustPosition, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, position]);

  const handleProfileClickInternal = () => {
    //onOpenProfile(username);
    onOpenInternalProfile(username);
    onClose();
  };

  const handlePMClick = () => {
    onOpenPM(username);
    onClose();
  };

  const handleProfileClick = () => {
    onOpenProfile(username);
    onClose();
  };

  const handleAddBookmarkClick = () => {
    onAddBookmark?.(username);
    onClose();
  };

  const handleRemoveBookmarkClick = () => {
    onRemoveBookmark?.(username);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded-md shadow-lg py-1 min-w-[160px]"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-600">
        {username}
      </div>

      <button
        onClick={handlePMClick}
        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors flex items-center"
      >
        <span className="mr-3">💬</span>
        Send Private Message
      </button>
      <button
        onClick={handleProfileClickInternal}
        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors flex items-center"
      >
        <span className="mr-3">👤</span>
        View Profile
      </button>

      <button
        onClick={handleProfileClick}
        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors flex items-center"
      >
        <span className="mr-3">👤</span>
        View Profile (External)
      </button>


      {/* Bookmark options */}
      {isBookmarked ? (
        <button
          onClick={handleRemoveBookmarkClick}
          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors flex items-center"
        >
          <span className="mr-3">📖</span>
          Remove Bookmark
        </button>
      ) : (
        <button
          onClick={handleAddBookmarkClick}
          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors flex items-center"
        >
          <span className="mr-3">🔖</span>
          Add Bookmark
        </button>
      )}
    </div>
  );
}
