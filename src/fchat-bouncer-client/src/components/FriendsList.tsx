'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useFriendsStore } from '@/stores/friendsStore';
import { Friend } from '@/types';
import { ChevronDownIcon, ChevronRightIcon, UserIcon, BookmarkIcon } from '@heroicons/react/24/outline';
import Character, { CharacterData, getCharacterStatusColor, getCharacterStatusIcon } from './Character';
import { getCharacterColor } from '@/lib/genderColors';
import { bbcodeToHtml } from '@/lib/bbcode';

interface FriendsListProps {
  className?: string;
  onOpenPM?: (friendName: string) => void;
}

const FriendsList: React.FC<FriendsListProps> = ({ className = '', onOpenPM }) => {
  const { friends, bookmarks, bookmarksWithStatus, isCollapsed, toggleCollapsed, isLoading, deduplicateFriends } = useFriendsStore();
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Deduplicate friends by name to prevent React key conflicts
  const uniqueFriends = deduplicateFriends(friends);

  const onlineFriends = uniqueFriends.filter(friend => friend.isOnline);
  const offlineFriends = uniqueFriends.filter(friend => !friend.isOnline);
  
  // Show only online bookmarks from bookmarksWithStatus
  const onlineBookmarks = bookmarksWithStatus.filter(bookmark => bookmark.isOnline);

  // Handle mouse movement for tooltip positioning
  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  // Helper function to convert Friend to CharacterData
  const friendToCharacterData = (friend: Friend): CharacterData => ({
    name: friend.name,
    status: friend.status,
    statusMessage: friend.statusMessage,
    gender: friend.gender,
    lastSeen: friend.lastSeen,
    isOnline: friend.isOnline
  });

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return '';
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  const handleFriendClick = (friendName: string) => {
    if (onOpenPM) {
      onOpenPM(friendName);
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-gray-800 rounded-lg p-2 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Friends</h3>
        </div>
        <div className="text-gray-400 text-xs">Loading friends...</div>
      </div>
    );
  }

  return (
    <div 
      className={`bg-gray-800 rounded-lg ${className}`}
      onMouseMove={handleMouseMove}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-700 rounded-t-lg transition-colors"
        onClick={toggleCollapsed}
      >
        <div className="flex items-center space-x-2">
          {isCollapsed ? (
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          )}
          <h3 className="text-sm font-semibold text-white">Friends</h3>
          <span className="text-xs text-gray-400">({onlineFriends.length})</span>
        </div>
      </div>

      {/* Friends List */}
      {!isCollapsed && (
        <div className="flex flex-col h-96 overflow-hidden">
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {/* Online Friends */}
            {onlineFriends.length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-300 mb-1 sticky top-0 bg-gray-800 py-1">
                  Online ({onlineFriends.length})
                </h4>
                <div className="space-y-0.5">
                  {onlineFriends.map((friend) => (
                    <Character
                      key={`online-friend-${friend.name}`}
                      character={friendToCharacterData(friend)}
                      variant="compact"
                      showStatusMessage={true}
                      onClick={handleFriendClick}
                      onMouseEnter={setHoveredFriend}
                      onMouseLeave={() => setHoveredFriend(null)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Bookmarks */}
            {onlineBookmarks.length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-300 mb-1 flex items-center sticky top-0 bg-gray-800 py-1">
                  <BookmarkIcon className="w-3 h-3 mr-1" />
                  Bookmarks ({onlineBookmarks.length})
                </h4>
                <div className="space-y-0.5">
                  {onlineBookmarks.map((bookmark) => (
                    <Character
                      key={`bookmark-${bookmark.name}`}
                      character={friendToCharacterData(bookmark)}
                      variant="compact"
                      showStatusMessage={true}
                      onClick={handleFriendClick}
                      onMouseEnter={setHoveredFriend}
                      onMouseLeave={() => setHoveredFriend(null)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Offline Friends */}
            {offlineFriends.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-300 mb-1 sticky top-0 bg-gray-800 py-1">
                  Offline ({offlineFriends.length})
                </h4>
                <div className="space-y-0.5">
                  {offlineFriends.map((friend) => (
                    <Character
                      key={`offline-friend-${friend.name}`}
                      character={friendToCharacterData(friend)}
                      variant="compact"
                      showStatusMessage={false}
                      onClick={handleFriendClick}
                      onMouseEnter={setHoveredFriend}
                      onMouseLeave={() => setHoveredFriend(null)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {uniqueFriends.length === 0 && onlineBookmarks.length === 0 && (
              <div className="text-center py-4">
                <UserIcon className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">No friends found</p>
                <p className="text-gray-500 text-xs mt-1">
                  Friends will appear here when you connect to F-Chat
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Tooltip */}
      {hoveredFriend && !isCollapsed && (
        <div 
          ref={tooltipRef}
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg border border-gray-700 max-w-xs pointer-events-none"
          style={{
            left: `${tooltipPosition.x + 10}px`,
            top: `${tooltipPosition.y - 10}px`,
          }}
        >
          {(() => {
            const friend = uniqueFriends.find(f => f.name === hoveredFriend);
            if (!friend) return null;
            
            return (
              <div>
                <div className="font-semibold text-white mb-1">{friend.name}</div>
                <div className="text-gray-300 mb-1">
                  Status: <span className={getCharacterStatusColor(friend.status)}>{friend.status}</span>
                </div>
                {friend.gender && (
                  <div className="text-gray-300 mb-1">
                    Gender: <span className={getCharacterColor(friend.gender)}>{friend.gender}</span>
                  </div>
                )}
                {friend.statusMessage && (
                  <div className="text-gray-300">
                    <div className="text-xs text-gray-400 mb-1">Status Message:</div>
                    <div className="text-xs" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(friend.statusMessage) }}></div>
                  </div>
                )}
                {friend.lastSeen && !friend.isOnline && (
                  <div className="text-gray-400 text-xs mt-1">
                    Last seen: {formatLastSeen(friend.lastSeen)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default FriendsList;
