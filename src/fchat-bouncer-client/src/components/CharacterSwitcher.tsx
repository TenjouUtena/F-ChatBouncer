'use client';

import React, { useState } from 'react';
import { useCharacterStore } from '@/stores/characterStore';
import { useChatStore } from '@/stores/chatStore';
import { signalRService } from '@/lib/signalr';
import { ChevronDownIcon, UserIcon, CheckCircleIcon, ExclamationTriangleIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import ConnectionStatusIndicator from './ConnectionStatusIndicator';

interface CharacterSwitcherProps {
  className?: string;
  isCharacterRestoring?: boolean;
}

export default function CharacterSwitcher({ className = '', isCharacterRestoring = false }: CharacterSwitcherProps) {
  const { connections, activeCharacter, getConnection } = useCharacterStore();
  const { 
    getUnreadCountsForCharacter, 
    getSelectedChannelsForCharacter, 
    addToSelectedChannels,
    getHighUrgencyUnreadCountForCharacter,
    getRegularUnreadCountForCharacter
  } = useChatStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPMPrompt, setShowPMPrompt] = useState<{characterName: string, pmChannels: string[]} | null>(null);

  const handleCharacterSwitch = async (characterName: string) => {
    console.log('=== CharacterSwitcher: handleCharacterSwitch called ===');
    console.log('Switching to character:', characterName);
    console.log('Current active character:', activeCharacter);
    console.log('Is same character?', characterName === activeCharacter);
    
    if (characterName === activeCharacter) {
      console.log('Same character, closing dropdown');
      setIsOpen(false);
      return;
    }

    // Check for unread PMs on the character we're switching to
    const unreadCounts = getUnreadCountsForCharacter(characterName);
    const pmChannels = Object.keys(unreadCounts).filter(channel => 
      channel.startsWith('PRI-') && unreadCounts[channel] > 0
    );

    if (pmChannels.length > 0) {
      // Show prompt to open PM windows
      setShowPMPrompt({ characterName, pmChannels });
      setIsOpen(false);
      return;
    }

    // No unread PMs, proceed with normal switch
    await performCharacterSwitch(characterName);
  };

  const performCharacterSwitch = async (characterName: string) => {
    console.log('Setting loading state to true');
    setIsLoading(true);
    try {
      console.log('Calling signalRService.switchActiveCharacter with:', characterName);
      await signalRService.switchActiveCharacter(characterName);
      console.log('switchActiveCharacter call completed successfully');
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch character:', error);
    } finally {
      console.log('Setting loading state to false');
      setIsLoading(false);
    }
  };

  const handleOpenPMs = (characterName: string, pmChannels: string[]) => {
    // Add PM channels to selected channels for the character
    addToSelectedChannels(pmChannels, characterName);
    setShowPMPrompt(null);
    
    // Proceed with character switch
    performCharacterSwitch(characterName);
  };

  const handleSkipPMs = (characterName: string) => {
    setShowPMPrompt(null);
    
    // Proceed with character switch without opening PMs
    performCharacterSwitch(characterName);
  };

  const getStatusIcon = (characterName: string) => {
    const connection = getConnection(characterName);
    if (!connection) return <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />;
    
    if (connection.isConnected) {
      return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    }
    
    return <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />;
  };

  const connectionCount = connections.length;

  if (connectionCount === 0) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg ${className}`}>
        <UserIcon className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-300">No characters</span>
      </div>
    );
  }

  return (
    <>
      <div className={`relative ${className}`}>
        {/* Current Character Display */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          <ConnectionStatusIndicator 
            isConnected={getConnection(activeCharacter || '')?.isConnected || false}
            isConnecting={isCharacterRestoring}
            className="mr-1"
          />
          <span className="text-sm font-medium text-white">
            {activeCharacter || 'No Character'}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Menu */}
            <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-20">
              <div className="p-2">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 px-2">
                  Switch Character ({connectionCount})
                </div>
                
                {connections.map((connection) => {
                  const highUrgencyCount = getHighUrgencyUnreadCountForCharacter(connection.characterName);
                  const regularCount = getRegularUnreadCountForCharacter(connection.characterName);
                  const totalCount = highUrgencyCount + regularCount;
                  return (
                    <button
                      key={connection.characterName}
                      onClick={() => handleCharacterSwitch(connection.characterName)}
                      disabled={isLoading}
                      className={`w-full flex items-center gap-3 px-2 py-2 text-left rounded-md transition-colors ${
                        connection.characterName === activeCharacter
                          ? 'bg-blue-900/20 text-blue-300'
                          : 'hover:bg-gray-700 text-white'
                      } disabled:opacity-50`}
                    >
                      {getStatusIcon(connection.characterName)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {connection.characterName}
                        </div>
                        <div className="text-xs text-gray-400">
                          {connection.isConnected ? 'Connected' : 'Disconnected'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {totalCount > 0 && connection.characterName !== activeCharacter && (
                          <div className={`flex items-center gap-1 text-xs ${
                            highUrgencyCount > 0 
                              ? 'text-yellow-400' // Yellow for high-urgency (PMs)
                              : 'text-blue-400'   // Blue for regular messages only
                          }`}>
                            <ChatBubbleLeftRightIcon className="w-3 h-3" />
                            <span>{totalCount}</span>
                          </div>
                        )}
                        {connection.characterName === activeCharacter && (
                          <div className="w-2 h-2 bg-blue-400 rounded-full" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* PM Prompt Modal */}
      {showPMPrompt && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={() => setShowPMPrompt(null)}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ChatBubbleLeftRightIcon className="w-6 h-6 text-orange-400" />
                  <h3 className="text-lg font-semibold text-white">
                    Unread PMs for {showPMPrompt.characterName}
                  </h3>
                </div>
                
                <p className="text-gray-300 mb-4">
                  You have {showPMPrompt.pmChannels.length} unread private message{showPMPrompt.pmChannels.length > 1 ? 's' : ''} from:
                </p>
                
                <div className="space-y-2 mb-6">
                  {showPMPrompt.pmChannels.map(pmChannel => {
                    const senderName = pmChannel.replace('PRI-', '');
                    return (
                      <div key={pmChannel} className="text-sm text-gray-400 bg-gray-700 px-3 py-2 rounded">
                        {senderName}
                      </div>
                    );
                  })}
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => handleOpenPMs(showPMPrompt.characterName, showPMPrompt.pmChannels)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                  >
                    Open PMs & Switch
                  </button>
                  <button
                    onClick={() => handleSkipPMs(showPMPrompt.characterName)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
                  >
                    Switch Without Opening
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
