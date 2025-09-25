'use client';

import { useState, useEffect } from 'react';
import { signalRService } from '@/lib/signalr';
import Character, { CharacterData } from './Character';

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
}

export default function ChannelCharacterList({ channelId, className = '' }: ChannelCharacterListProps) {
  const [characters, setCharacters] = useState<ChannelCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [screenWidth, setScreenWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

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

  // Determine if we should show the expanded list based on screen width and hover state
  const shouldShowExpanded = screenWidth >= 1200 || (screenWidth < 1200 && (isExpanded || isHovered));

  return (
    <div 
      className={`bg-gray-800 border border-gray-700 rounded-lg flex flex-col h-full ${className} ${
        screenWidth < 1200 ? 'relative' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700 transition-colors flex-shrink-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
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
      </div>

      {shouldShowExpanded && (
        <div className={`border-t border-gray-700 flex-1 overflow-y-auto ${
          screenWidth < 1200 ? 'absolute top-full left-0 right-0 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-96' : ''
        }`}>
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
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
