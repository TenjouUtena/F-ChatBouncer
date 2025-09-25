'use client';

import React from 'react';
import { EyeIcon, CircleStackIcon, NoSymbolIcon, CogIcon } from '@heroicons/react/24/outline';
import { getCharacterColor } from '@/lib/genderColors';
import { getPlainText, bbcodeToHtml } from '@/lib/bbcode';

export interface CharacterData {
  name: string;
  status: 'online' | 'busy' | 'dnd' | 'idle' | 'away' | 'crown' | 'looking' | 'offline';
  statusMessage?: string;
  gender?: string;
  lastSeen?: string;
  isOnline?: boolean;
  // For channel characters
  characterName?: string;
  lastSeenAt?: string;
  joinedAt?: string;
}

interface CharacterProps {
  character: CharacterData;
  variant?: 'default' | 'compact' | 'detailed';
  showStatusMessage?: boolean;
  showLastSeen?: boolean;
  onClick?: (characterName: string) => void;
  className?: string;
  onMouseEnter?: (characterName: string) => void;
  onMouseLeave?: () => void;
}

export default function Character({
  character,
  variant = 'default',
  showStatusMessage = false,
  showLastSeen = false,
  onClick,
  className = '',
  onMouseEnter,
  onMouseLeave
}: CharacterProps) {
  // Normalize character data - handle both Friend and ChannelCharacter formats
  const characterName = character.characterName || character.name;
  const lastSeen = character.lastSeen || character.lastSeenAt;
  const isOnline = character.isOnline ?? (character.status !== 'offline');

  const genderColor = character.gender ? getCharacterColor(character.gender) : 'text-gray-400';

  const getStatusColor = (status: CharacterData['status']) => {
    switch (status) {
      case 'online':
        return 'text-green-500';
      case 'busy':
        return 'text-red-500';
      case 'dnd':
        return 'text-red-600';
      case 'idle':
        return 'text-yellow-500';
      case 'away':
        return 'text-orange-500';
      case 'crown':
        return 'text-purple-500';
      case 'looking':
        return 'text-blue-500';
      case 'offline':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: CharacterData['status']) => {
    switch (status) {
      case 'looking':
        return <EyeIcon className="w-3 h-3" />;
      case 'away':
        return <CircleStackIcon className="w-3 h-3" />;
      case 'dnd':
        return <NoSymbolIcon className="w-3 h-3" />;
      case 'busy':
        return <CogIcon className="w-3 h-3" />;
      default:
        return <div className="w-3 h-3 rounded-full bg-current" />;
    }
  };

  const getStatusText = (status: CharacterData['status']) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'busy':
        return 'Busy';
      case 'dnd':
        return 'Do Not Disturb';
      case 'idle':
        return 'Idle';
      case 'away':
        return 'Away';
      case 'crown':
        return 'Crown';
      case 'looking':
        return 'Looking';
      case 'offline':
        return 'Offline';
      default:
        return 'Unknown';
    }
  };

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return '';
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const renderStatusMessage = (statusMessage?: string, plainText: boolean = false): string => {
    if (!statusMessage) return '';
    try {
      return plainText ? getPlainText(statusMessage) : bbcodeToHtml(statusMessage);
    } catch (error) {
      console.warn('Failed to render status message BBCode:', error);
      return statusMessage;
    }
  };

  const handleClick = () => {
    if (onClick) {
      onClick(characterName);
    }
  };

  const handleMouseEnter = () => {
    if (onMouseEnter) {
      onMouseEnter(characterName);
    }
  };

  const handleMouseLeave = () => {
    if (onMouseLeave) {
      onMouseLeave();
    }
  };

  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center space-x-2 px-1 py-0.5 rounded hover:bg-gray-700 transition-colors cursor-pointer ${className}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex-shrink-0">
          <div className={`${getStatusColor(character.status)}`}>
            {getStatusIcon(character.status)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" style={{ color: genderColor }}>
            {characterName}
          </div>
          {showStatusMessage && character.statusMessage && (
            <div className="text-xs text-gray-400 truncate">
              {renderStatusMessage(character.statusMessage, true)}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'detailed') {
    //console.log("Character Name: {name} Character.gender: {gender}", character.name, character.gender);
    return (
      <div
        className={`flex items-center justify-between p-2 hover:bg-gray-700 rounded transition-colors cursor-pointer ${className}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={character.statusMessage ? renderStatusMessage(character.statusMessage) : undefined}
      >
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <span className="text-xs flex-shrink-0">
            {getStatusIcon(character.status)}
          </span>
          <span 
            className="text-sm font-medium truncate"
            style={{ color: genderColor }}
          >
            {characterName}
          </span>
          <span className={`text-xs ${getStatusColor(character.status)} flex-shrink-0`}>
            {character.status}
          </span>
        </div>
        {showLastSeen && lastSeen && (
          <div className="text-xs text-gray-400 flex-shrink-0 ml-2">
            {formatLastSeen(lastSeen)}
          </div>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={`flex items-center space-x-2 px-1 py-0.5 rounded hover:bg-gray-700 transition-colors cursor-pointer ${className}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex-shrink-0">
        <div className={`${getStatusColor(character.status)}`}>
          {getStatusIcon(character.status)}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: genderColor }}>
          {characterName}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {character.status === 'looking' && character.statusMessage && showStatusMessage && (
            <span>{renderStatusMessage(character.statusMessage, true)}</span>
          )}
          {character.gender && (
            <span className={`ml-1 ${genderColor}`}>
              • {character.gender}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Export utility functions for use in other components
export const getCharacterStatusColor = (status: CharacterData['status']) => {
  switch (status) {
    case 'online':
      return 'text-green-500';
    case 'busy':
      return 'text-red-500';
    case 'dnd':
      return 'text-red-600';
    case 'idle':
      return 'text-yellow-500';
    case 'away':
      return 'text-orange-500';
    case 'crown':
      return 'text-purple-500';
    case 'looking':
      return 'text-blue-500';
    case 'offline':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
};

export const getCharacterStatusIcon = (status: CharacterData['status']) => {
  switch (status) {
    case 'looking':
      return <EyeIcon className="w-3 h-3" />;
    case 'away':
      return <CircleStackIcon className="w-3 h-3" />;
    case 'dnd':
      return <NoSymbolIcon className="w-3 h-3" />;
    case 'busy':
      return <CogIcon className="w-3 h-3" />;
    default:
      return <div className="w-3 h-3 rounded-full bg-current" />;
  }
};
