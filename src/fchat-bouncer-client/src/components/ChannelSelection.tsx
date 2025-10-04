'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import { signalRService } from '@/lib/signalr';
import { Channel } from '@/types';

interface ChannelSelectionProps {
  onChannelsSelected: (channels: string[]) => Promise<void>;
  onSelectionChange?: (channels: string[]) => void; // For modal mode - called when selection changes
  onBackToCharacterSelection?: () => void; // Callback to go back to character selection
  mode?: 'initial' | 'modal';
  title?: string;
  description?: string;
  buttonText?: string;
  excludeChannels?: string[];
  allowMultiple?: boolean;
  showSearch?: boolean;
  className?: string;
}

export default function ChannelSelection({
  onChannelsSelected,
  onSelectionChange,
  onBackToCharacterSelection,
  mode = 'initial',
  title,
  description,
  buttonText,
  excludeChannels = [],
  allowMultiple = true,
  showSearch = true,
  className = ''
}: ChannelSelectionProps) {
  const { user } = useAuthStore();
  const { activeCharacter } = useCharacterIndexedDBStore();
  const { setSelectedChannels, getSelectedChannelsForCharacter, setChannelMetadata } = useChatStore();
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([]);
  const [selectedChannels, setLocalSelectedChannels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Set up SignalR listeners for channel data
    signalRService.onReceiveChannelList((channels: Channel[]) => {
      setAvailableChannels(channels);
      setChannelMetadata(channels);
      setIsLoading(false);
    });

    signalRService.onChannelListError((errorMessage: string) => {
      console.error('Channel list error from SignalR:', errorMessage);
      setError(errorMessage);
      setIsLoading(false);
    });

    // Request channel list when component mounts, but wait for SignalR to be ready
    const requestChannelsWhenReady = async () => {
      if (signalRService.isConnected) {
        await handleGetChannels();
      } else {
        // Wait a bit and try again
        setTimeout(requestChannelsWhenReady, 500);
      }
    };
    
    requestChannelsWhenReady();

    // Cleanup listeners on unmount
    return () => {
      // Remove channel-specific listeners
      if (signalRService.connection) {
        signalRService.connection.off('ReceiveChannelList');
        signalRService.connection.off('ChannelListError');
      }
    };
  }, [signalRService.connectionState, signalRService.connection?.connectionId]);

  const handleGetChannels = async () => {
    setIsLoading(true);
    setError(null);
    try {

      if (!signalRService.isConnected) {
        throw new Error('SignalR is not connected. Please wait and try again.');
      }

      await signalRService.getChannelList();
    } catch (err) {
      console.error('Error getting channels:', err);
      setError(err instanceof Error ? err.message : 'Failed to get channels');
      setIsLoading(false);
    }
  };

  const handleChannelToggle = (channelId: string) => {
    setLocalSelectedChannels(prev => {
      const newSelection = !allowMultiple ?
        [channelId] : // Single selection mode
        prev.includes(channelId) ?
          prev.filter(id => id !== channelId) :
          [...prev, channelId];

      return newSelection;
    });
  };

  // Use useEffect to call onSelectionChange after state update
  useEffect(() => {
    if (mode === 'modal' && onSelectionChange) {
      onSelectionChange(selectedChannels);
    }
  }, [selectedChannels, mode, onSelectionChange]);

  const handleConfirmSelection = async () => {
    if (selectedChannels.length === 0) {
      setError('Please select at least one channel');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setSelectedChannels(selectedChannels, activeCharacter || undefined);
      await onChannelsSelected(selectedChannels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join channels');
      setIsLoading(false);
    }
  };

  const filteredChannels = availableChannels.filter(channel => {
    // Filter by search term
    const matchesSearch = !showSearch || !searchTerm ||
      channel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (channel.title && channel.title.toLowerCase().includes(searchTerm.toLowerCase()));

    // Exclude specified channels (e.g., already joined channels)
    const notExcluded = !excludeChannels.includes(channel.id);

    // In modal mode, exclude already joined channels
    const joinedChannels = activeCharacter ? getSelectedChannelsForCharacter(activeCharacter) : [];
    const notAlreadyJoined = mode === 'initial' || !joinedChannels.includes(channel.id);

    return matchesSearch && notExcluded && notAlreadyJoined;
  });

  // Dynamic defaults based on mode
  const displayTitle = title || (mode === 'initial' ? 'Select Channels to Join' : 'Available Channels');
  const displayDescription = description || (mode === 'initial' ?
    'Choose which channels you want to participate in. You can always add more later.' :
    'Select channels to join from the available options.'
  );
  const displayButtonText = buttonText || (mode === 'initial' ? 'Continue' : 'Join Selected');

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'Public': return 'bg-green-900/20 text-green-300';
      case 'Private': return 'bg-red-900/20 text-red-300';
      case 'Both': return 'bg-blue-900/20 text-blue-300';
      default: return 'bg-gray-900/20 text-gray-300';
    }
  };

  const containerClass = mode === 'initial' ?
    "min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8" :
    `${className}`;

  const wrapperClass = mode === 'initial' ?
    "max-w-4xl w-full space-y-8" :
    "w-full space-y-4";

  return (
    <div className={containerClass}>
      <div className={wrapperClass}>
        {mode === 'initial' && (
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
              {displayTitle}
            </h2>
            <p className="mt-2 text-center text-sm text-gray-300">
              Welcome, {user?.username}! Choose channels to join as {activeCharacter}.
            </p>
            <p className="mt-1 text-center text-xs text-gray-400">
              Selected: {selectedChannels.length} channels
            </p>
          </div>
        )}

        {mode === 'modal' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-200 mb-2">{displayTitle}</h3>
            <p className="text-sm text-gray-400 mb-4">{displayDescription}</p>
            {selectedChannels.length > 0 && (
              <p className="text-xs text-gray-400">
                Selected: {selectedChannels.length} channel{selectedChannels.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        )}

        {/* Search */}
        {showSearch && (
          <div className={mode === 'initial' ? "max-w-md mx-auto" : ""}>
            <input
              type="text"
              placeholder="Search channels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={mode === 'initial' ?
                "w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" :
                "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              }
            />
          </div>
        )}

        {isLoading && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className={`mt-2 ${mode === 'modal' ? 'text-gray-400' : 'text-gray-300'}`}>Loading channels...</p>
          </div>
        )}

        {error && (
          <div className={mode === 'initial' ?
            "bg-red-900/20 border border-red-500 text-red-300 px-4 py-3 rounded relative" :
            "bg-red-600 bg-opacity-20 border border-red-600 text-red-400 px-4 py-3 rounded relative"
          }>
            {error}
            <button
              onClick={handleGetChannels}
              className={mode === 'initial' ?
                "ml-2 text-red-400 underline hover:text-red-300" :
                "ml-2 text-red-300 underline hover:text-red-200"
              }
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && filteredChannels.length === 0 && !error && (
          <div className="text-center">
            <p className={mode === 'modal' ? 'text-gray-400' : 'text-gray-300'}>
              {mode === 'modal' && searchTerm ? 'No channels found matching your search.' : 'No channels found.'}
            </p>
            <button
              onClick={handleGetChannels}
              className={mode === 'initial' ?
                "mt-2 text-indigo-400 underline hover:text-indigo-300" :
                "mt-2 text-indigo-400 underline hover:text-indigo-300"
              }
            >
              Refresh
            </button>
            
            {mode === 'initial' && onBackToCharacterSelection && (
              <div className="mt-4">
                <button
                  onClick={onBackToCharacterSelection}
                  disabled={isLoading}
                  className="px-6 py-3 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900 flex items-center gap-2 mx-auto"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Character Selection
                </button>
              </div>
            )}
          </div>
        )}

        {filteredChannels.length > 0 && (
          <div className="space-y-4">
            <div className={mode === 'initial' ?
              "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto" :
              "max-h-64 overflow-y-auto border border-gray-600 rounded-md"
            }>
              {filteredChannels.map((channel) => {
                const isSelected = selectedChannels.includes(channel.id);
                const cardClass = mode === 'initial' ?
                  `p-4 border rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-600 hover:border-gray-500 bg-gray-800'
                  }` :
                  `flex items-center p-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-b-0 ${
                    isSelected ? 'bg-indigo-600 bg-opacity-20' : ''
                  }`;

                return (
                  <div
                    key={channel.id}
                    className={cardClass}
                    onClick={() => handleChannelToggle(channel.id)}
                  >
                    {mode === 'modal' && (
                      <input
                        type={allowMultiple ? "checkbox" : "radio"}
                        checked={isSelected}
                        onChange={() => handleChannelToggle(channel.id)}
                        className="mr-3 rounded text-indigo-600 focus:ring-indigo-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="flex items-start justify-between flex-1">
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-medium truncate ${
                          mode === 'modal' ? 'text-white' : 'text-white'
                        }`}>
                          #{channel.name}
                        </h3>
                        {channel.title && channel.title !== channel.name && (
                          <p className={`text-sm mt-1 line-clamp-2 ${
                            mode === 'modal' ? 'text-gray-400' : 'text-gray-300'
                          }`}>
                            {channel.title}
                          </p>
                        )}
                        {mode === 'initial' && (
                          <div className="flex items-center space-x-2 mt-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getModeColor(channel.mode)}`}>
                              {channel.mode}
                            </span>
                            <span className="text-xs text-gray-400">
                              {channel.userCount} users
                            </span>
                          </div>
                        )}
                      </div>
                      {mode === 'modal' && (
                        <span className={`text-sm ${mode === 'modal' ? 'text-gray-400' : 'text-gray-400'}`}>
                          {channel.userCount} users
                        </span>
                      )}
                      {mode === 'initial' && selectedChannels.includes(channel.id) && (
                        <div className="ml-2 flex-shrink-0">
                          <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )})
            }</div>

            {mode === 'initial' && (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handleConfirmSelection}
                  disabled={isLoading}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900"
                >
                  {isLoading ? 'Joining...' : displayButtonText}
                </button>
                <button
                  onClick={() => setLocalSelectedChannels([])}
                  disabled={selectedChannels.length === 0}
                  className="px-6 py-3 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900"
                >
                  Clear Selection
                </button>
                {onBackToCharacterSelection && (
                  <button
                    onClick={onBackToCharacterSelection}
                    disabled={isLoading}
                    className="px-6 py-3 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Character Selection
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}