'use client';

import { useState, useEffect, useRef } from 'react';
import { signalRService } from '@/lib/signalr';
import { useFriendsStore } from '@/stores/friendsStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import Character, { CharacterData } from './Character';
import UserContextMenu from './UserContextMenu';
import ProfileModal from './ProfileModal';
import { api } from '@/lib/api';

interface ChannelCharacter {
  characterName: string;
  joinedAt: string;
  lastSeenAt: string;
  status: string;
  statusMessage?: string;
  gender?: string;
}

interface ChannelCharacterListProps {
  channelId: string;
  className?: string;
  onOpenPM?: (characterName: string) => void;
}

export default function ChannelCharacterList({ channelId, className = '', onOpenPM }: ChannelCharacterListProps) {
  const { bookmarks, addBookmark, removeBookmark } = useFriendsStore();
  const { token } = useAuthStore();
  const { getProfile } = useChatStore();
  const [characters, setCharacters] = useState<ChannelCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [screenWidth, setScreenWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [userContextMenu, setUserContextMenu] = useState<{
    username: string;
    position: { x: number; y: number };
  } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileCharacter, setSelectedProfileCharacter] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine if we should show the expanded list based on screen width and hover state
  // On mobile (xl breakpoint = 1280px), show as dropdown on hover/click
  // On desktop, show as sidebar
  const isMobile = screenWidth < 1280;
  const shouldShowExpanded = !isMobile || (isMobile && (isExpanded || isHovered));

  useEffect(() => {
    if (channelId && isExpanded) {
      loadCharacters();
    }
  }, [channelId, isExpanded]);

  // Track screen width for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle click outside to close dropdown on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMobile && isExpanded && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isMobile && isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMobile, isExpanded]);

  useEffect(() => {
    // Listen for character join/leave events
    const handleCharacterJoined = (data: any) => {
      if (data.channelId === channelId) {
        setCharacters(prev => {
          // Remove existing entry if present (in case of rejoin)
          const filtered = prev.filter(c => c.characterName !== data.characterName);
          return [...filtered, {
            characterName: data.characterName,
            joinedAt: data.joinedAt,
            lastSeenAt: data.joinedAt,
            status: data.status || 'Online',
            statusMessage: data.statusMessage,
            gender: data.gender
          }];
        });
      }
    };

    const handleCharacterLeft = (data: any) => {
      if (data.channelId === channelId) {
        setCharacters(prev => prev.filter(c => c.characterName !== data.characterName));
      }
    };

    const handleChannelCharacters = (data: any) => {
      if (data.channelId === channelId) {
        setCharacters(data.characters || []);
        setIsLoading(false);
        setError(null);
      }
    };

    const handleChannelCharactersRefreshed = (data: any) => {
      if (data.channelId === channelId) {
        // Characters will be received via ReceiveChannelCharacters event
        console.log('Character list refresh requested for channel:', channelId);
      }
    };

    const handleChannelCharacterError = (error: string) => {
      setError(error);
      setIsLoading(false);
    };

    const handleStatusUpdate = (data: { characterName: string; status: string; statusMessage: string; timestamp: string; viaCharacter: string }) => {
      setCharacters(prev => prev.map(char => 
        char.characterName === data.characterName 
          ? { ...char, status: data.status, statusMessage: data.statusMessage, lastSeenAt: data.timestamp }
          : char
      ));
    };

    // Register event listeners
    signalRService.onCharacterJoinedChannel(handleCharacterJoined);
    signalRService.onCharacterLeftChannel(handleCharacterLeft);
    signalRService.onReceiveChannelCharacters(handleChannelCharacters);
    signalRService.onChannelCharactersRefreshed(handleChannelCharactersRefreshed);
    signalRService.onChannelCharacterError(handleChannelCharacterError);
    signalRService.onStatusUpdated(handleStatusUpdate);

    return () => {
      // Cleanup listeners
      signalRService.removeListener('CharacterJoinedChannel');
      signalRService.removeListener('CharacterLeftChannel');
      signalRService.removeListener('ReceiveChannelCharacters');
      signalRService.removeListener('ChannelCharactersRefreshed');
      signalRService.removeListener('ChannelCharacterError');
      signalRService.removeListener('StatusUpdated');
    };
  }, [channelId]);

  const loadCharacters = async () => {
    if (!channelId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await signalRService.getChannelCharacters(channelId);
    } catch (err) {
      setError('Failed to load character list');
      setIsLoading(false);
    }
  };

  const refreshCharacters = async () => {
    if (!channelId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await signalRService.refreshChannelCharacters(channelId);
    } catch (err) {
      setError('Failed to refresh character list');
      setIsLoading(false);
    }
  };

  // Helper function to convert ChannelCharacter to CharacterData
  const channelCharacterToCharacterData = (character: ChannelCharacter): CharacterData => ({
    name: character.characterName,
    characterName: character.characterName,
    status: character.status as CharacterData['status'],
    statusMessage: character.statusMessage,
    gender: character.gender,
    lastSeen: character.lastSeenAt,
    lastSeenAt: character.lastSeenAt,
    joinedAt: character.joinedAt,
    isOnline: character.status !== 'offline'
  });

  // Context menu handlers
  const handleCharacterClick = (characterName: string, event: React.MouseEvent) => {
    // Show context menu instead of opening PM directly
    setUserContextMenu({
      username: characterName,
      position: { x: event.clientX, y: event.clientY }
    });
  };

  const handleCharacterRightClick = (characterName: string, event: React.MouseEvent) => {
    setUserContextMenu({
      username: characterName,
      position: { x: event.clientX, y: event.clientY }
    });
  };

  const handleOpenPM = (username: string) => {
    if (onOpenPM) {
      onOpenPM(username);
    }
  };

  const handleOpenProfile = (username: string) => {
    const profileUrl = `https://www.f-list.net/c/${encodeURIComponent(username.toLowerCase())}/`;
    window.open(profileUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenInternalProfile = (username: string) => {
    setSelectedProfileCharacter(username);
    setShowProfileModal(true);
  };

  const handleCloseProfileModal = () => {
    setShowProfileModal(false);
    setSelectedProfileCharacter('');
  };

  const handleAddBookmark = async (username: string) => {
    if (!token) {
      console.error('No authentication token available');
      return;
    }

    try {
      await api.addBookmark(token, username);
      addBookmark(username);
      console.log('Bookmark added for:', username);
    } catch (error) {
      console.error('Error adding bookmark:', error);
    }
  };

  const handleRemoveBookmark = async (username: string) => {
    if (!token) {
      console.error('No authentication token available');
      return;
    }

    try {
      await api.removeBookmark(token, username);
      removeBookmark(username);
      console.log('Bookmark removed for:', username);
    } catch (error) {
      console.error('Error removing bookmark:', error);
    }
  };

  const handleCloseContextMenu = () => {
    setUserContextMenu(null);
  };

  return (
    <div 
      ref={dropdownRef}
      className={`${isMobile ? 'fixed bottom-4 right-4 z-40' : 'bg-gray-800 border border-gray-700 rounded-lg flex flex-col h-full'} ${className} ${
        isMobile ? 'relative' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className={`${isMobile ? 'bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-3 shadow-lg cursor-pointer transition-colors' : 'flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700 transition-colors flex-shrink-0'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isMobile ? (
          <div className="flex items-center">
            <span className="text-lg">👥</span>
            {characters.length > 0 && (
              <span className="ml-2 bg-white text-indigo-600 text-xs rounded-full px-2 py-0.5 font-medium">
                {characters.length}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-300">
                👥 Channel Members ({characters.length})
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {isExpanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    refreshCharacters();
                  }}
                  disabled={isLoading}
                  className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
                  title="Refresh character list"
                >
                  {isLoading ? '⟳' : '↻'}
                </button>
              )}
              <span className="text-gray-400 text-sm">
                {isExpanded ? '▼' : '▶'}
              </span>
            </div>
          </>
        )}
      </div>

      {shouldShowExpanded && (
        <div className={`${isMobile ? 'absolute bottom-full right-0 mb-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto' : 'border-t border-gray-700 flex-1 overflow-y-auto'}`}>
          {error && (
            <div className="p-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          
          {isLoading && characters.length === 0 ? (
            <div className="p-3 text-gray-400 text-sm text-center">
              Loading characters...
            </div>
          ) : characters.length === 0 ? (
            <div className="p-3 text-gray-400 text-sm text-center">
              No characters found
            </div>
          ) : (
            <div className="p-2">
              {characters.map((character, index) => (
                <Character
                  key={`${character.characterName}-${index}`}
                  character={channelCharacterToCharacterData(character)}
                  variant="detailed"
                  showLastSeen={true}
                  className="mb-1"
                  onClick={handleCharacterClick}
                  onRightClick={handleCharacterRightClick}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* User Context Menu */}
      {userContextMenu && (
        <UserContextMenu
          username={userContextMenu.username}
          position={userContextMenu.position}
          onOpenPM={handleOpenPM}
          onOpenProfile={handleOpenProfile}
          onOpenInternalProfile={handleOpenInternalProfile}
          onAddBookmark={handleAddBookmark}
          onRemoveBookmark={handleRemoveBookmark}
          isBookmarked={bookmarks.includes(userContextMenu.username)}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={handleCloseProfileModal}
        profileData={selectedProfileCharacter ? getProfile(selectedProfileCharacter) : null}
        characterName={selectedProfileCharacter}
      />
    </div>
  );
}
