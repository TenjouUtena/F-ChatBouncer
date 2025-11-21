'use client';

import { useState, useEffect } from 'react';
import ChannelSelection from './ChannelSelection';

interface JoinChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChannelsJoined: (channels: string[]) => void;
}

export default function JoinChannelModal({ isOpen, onClose, onChannelsJoined }: JoinChannelModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  
  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedChannelIds([]);
    }
  }, [isOpen]);

  const handleChannelsSelected = async (channels: string[]) => {
    // This is called when the user makes channel selections in the component
    // In modal mode, we don't immediately join - we let the user confirm via the Join button
    setSelectedChannelIds(channels);
    return Promise.resolve(); // ChannelSelection expects a promise
  };

  const handleJoinSelected = async () => {
    if (selectedChannelIds.length === 0) return;

    setIsLoading(true);
    try {
      // Notify parent component which will handle the actual SignalR joining
      onChannelsJoined(selectedChannelIds);
      // Close modal
      onClose();
    } catch (err) {
      console.error('Error in join selected handler:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Join Channels</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content - ChannelSelection Component */}
        <div className="p-6">
          <ChannelSelection
            onChannelsSelected={handleChannelsSelected}
            onSelectionChange={setSelectedChannelIds}
            mode="modal"
            title="Available Channels"
            description="Select channels to join from the available options."
            buttonText="Join Selected"
            className=""
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-700">
          <div className="text-gray-400 text-sm">
            {selectedChannelIds.length > 0 ?
              `${selectedChannelIds.length} channel${selectedChannelIds.length === 1 ? '' : 's'} selected` :
              'Click channels above to select them for joining'
            }
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleJoinSelected}
              disabled={selectedChannelIds.length === 0 || isLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Joining...' : `Join ${selectedChannelIds.length > 0 ? `(${selectedChannelIds.length})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}