'use client';

import React, { useState, useEffect } from 'react';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useCredentialsStore } from '@/stores/credentialsStore';
import { signalRService } from '@/lib/signalr';
import { PlusIcon, XMarkIcon, ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, UserIcon, CogIcon } from '@heroicons/react/24/outline';
import CharacterSettings from './CharacterSettings';
import FChatCredentialDialog from './FChatCredentialDialog';

interface CharacterManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CharacterStatus {
  name: string;
  isConnected: boolean;
  isActive: boolean;
  connectionStatus: string;
  lastActivity?: string;
  joinedChannels: number;
}

export default function CharacterManagement({ isOpen, onClose }: CharacterManagementProps) {
  const { 
    connections, 
    activeCharacter, 
    addConnection, 
    removeConnection, 
    setActiveCharacter,
    getConnection
  } = useCharacterIndexedDBStore();
  
  const { token } = useAuthStore();
  const { getSelectedChannelsForCharacter, getConnectionStatusForCharacter } = useChatStore();
  const { retrieveCredentials } = useCredentialsStore();
  
  const [characterStatuses, setCharacterStatuses] = useState<CharacterStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState('');
  const [isAddingCharacter, setIsAddingCharacter] = useState(false);
  const [showCharacterSettings, setShowCharacterSettings] = useState(false);
  const [selectedCharacterForSettings, setSelectedCharacterForSettings] = useState<string>('');
  const [showCredentialDialog, setShowCredentialDialog] = useState(false);
  const [pendingCharacter, setPendingCharacter] = useState<any>(null);
  // Update character statuses when connections change
  useEffect(() => {
    const updateStatuses = async () => {
      const statuses: CharacterStatus[] = [];
      
      for (const connection of connections) {
        const connectionStatus = getConnectionStatusForCharacter(connection.characterName);
        const joinedChannels = getSelectedChannelsForCharacter(connection.characterName);
        
        statuses.push({
          name: connection.characterName,
          isConnected: connection.isConnected,
          isActive: connection.characterName === activeCharacter,
          connectionStatus: connectionStatus.status,
          lastActivity: connectionStatus.lastActivity,
          joinedChannels: joinedChannels.length
        });
      }
      
      setCharacterStatuses(statuses);
    };

    updateStatuses();
  }, [connections, activeCharacter, getSelectedChannelsForCharacter, getConnectionStatusForCharacter]);

  const handleAddCharacter = async () => {
    if (!newCharacterName.trim()) return;
    
    setIsAddingCharacter(true);
    try {
      // Get characters from F-Chat with promise-based approach
      const characters = await signalRService.getCharacters();
      
      if (!characters || characters.length === 0) {
        alert('No characters found in your F-Chat account.');
        return;
      }
      
      const character = characters.find(c => {
        const characterName = (c.name || c.Name || '').trim();
        const searchName = newCharacterName.trim();
        console.log(`Comparing: "${characterName}" === "${searchName}"`);
        return characterName === searchName;
      });
      
      if (!character) {
        // Debug: log what characters we have
        console.log('Available characters:', characters);
        console.log('Looking for:', newCharacterName.trim());
        alert(`Character "${newCharacterName}" not found in your F-Chat character list. Available characters: ${characters.map(c => c.name || c.Name).join(', ')}`);
        return;
      }

      // Connect the character
      const credentials = await retrieveCredentials();
      if (!credentials || !credentials.fchatUsername || !credentials.fchatPassword) {
        // Store the character for later connection and show credential dialog
        setPendingCharacter(character);
        setShowCredentialDialog(true);
        return;
      }
      
      await signalRService.connectCharacter(
        character.name || character.Name,
        credentials.fchatUsername,
        credentials.fchatPassword
      );
      
      // Refresh the character list to get the updated connections
      await signalRService.getActiveCharacters();
      
      setNewCharacterName('');
      setShowAddCharacter(false);
    } catch (error) {
      console.error('Failed to add character:', error);
      alert(`Failed to add character: ${error}`);
    } finally {
      setIsAddingCharacter(false);
    }
  };

  const handleCredentialSubmit = async (credentials: { username: string; password: string }) => {
    if (!pendingCharacter) return;
    
    try {
      await signalRService.connectCharacter(
        pendingCharacter.name || pendingCharacter.Name,
        credentials.username,
        credentials.password
      );
      
      // Refresh the character list to get the updated connections
      await signalRService.getActiveCharacters();
      
      setNewCharacterName('');
      setShowAddCharacter(false);
      setShowCredentialDialog(false);
      setPendingCharacter(null);
    } catch (error) {
      console.error('Failed to connect character with provided credentials:', error);
      alert(`Failed to connect character: ${error}`);
    }
  };

  const handleCredentialCancel = () => {
    setShowCredentialDialog(false);
    setPendingCharacter(null);
    setIsAddingCharacter(false);
  };

  const handleRemoveCharacter = async (characterName: string) => {
    if (characterName === activeCharacter) {
      alert('Cannot remove the active character. Please switch to another character first.');
      return;
    }

    if (!confirm(`Are you sure you want to remove "${characterName}"? This will disconnect the character and remove them from your character list.`)) {
      return;
    }

    try {
      await signalRService.disconnectCharacter(characterName);
      removeConnection(characterName);
    } catch (error) {
      console.error('Failed to remove character:', error);
      alert(`Failed to remove character: ${error}`);
    }
  };

  const handleSwitchCharacter = async (characterName: string) => {
    if (characterName === activeCharacter) return;

    setIsLoading(true);
    try {
      await signalRService.switchActiveCharacter(characterName);
    } catch (error) {
      console.error('Failed to switch character:', error);
      alert(`Failed to switch character: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnectCharacter = async (characterName: string) => {
    setIsLoading(true);
    try {
      const connection = getConnection(characterName);
      if (connection) {
        await signalRService.disconnectCharacter(characterName);
        
        // Get credentials for reconnection
        const credentials = await retrieveCredentials();
        if (!credentials) {
          alert('No F-Chat credentials found. Please log in again.');
          return;
        }
        
        if (!credentials.fchatUsername || !credentials.fchatPassword) {
          throw new Error('F-Chat credentials are required to connect a character');
        }
        
        await signalRService.connectCharacter(
          characterName,
          credentials.fchatUsername,
          credentials.fchatPassword
        );
      }
    } catch (error) {
      console.error('Failed to reconnect character:', error);
      alert(`Failed to reconnect character: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenSettings = (characterName: string) => {
    setSelectedCharacterForSettings(characterName);
    setShowCharacterSettings(true);
  };

  const getStatusIcon = (status: CharacterStatus) => {
    if (status.isActive) {
      return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
    }
    
    if (status.isConnected) {
      return <CheckCircleIcon className="w-5 h-5 text-blue-500" />;
    }
    
    return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
  };

  const getStatusColor = (status: CharacterStatus) => {
    if (status.isActive) return 'bg-green-900/20 border-green-500';
    if (status.isConnected) return 'bg-blue-900/20 border-blue-500';
    return 'bg-red-900/20 border-red-500';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Character Management</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Add Character Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Add New Character</h3>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await signalRService.getActiveCharacters();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  Refresh
                </button>
                <button
                  onClick={() => setShowAddCharacter(!showAddCharacter)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Character
                </button>
              </div>
            </div>

            {showAddCharacter && (
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newCharacterName}
                    onChange={(e) => setNewCharacterName(e.target.value)}
                    placeholder="Enter character name..."
                    className="flex-1 px-3 py-2 border border-gray-600 rounded-lg bg-gray-800 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddCharacter()}
                  />
                  <button
                    onClick={handleAddCharacter}
                    disabled={isAddingCharacter || !newCharacterName.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAddingCharacter ? 'Adding...' : 'Add'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddCharacter(false);
                      setNewCharacterName('');
                    }}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-sm text-gray-300 mt-2">
                  Enter the exact character name as it appears in F-Chat.
                </p>
              </div>
            )}
          </div>

          {/* Character List */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Connected Characters</h3>
            
            {characterStatuses.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <UserIcon className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                <p>No characters connected</p>
                <p className="text-sm">Add a character to get started</p>
              </div>
            ) : (
              characterStatuses.map((status) => (
                <div
                  key={status.name}
                  className={`border rounded-lg p-4 ${getStatusColor(status)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(status)}
                      <div>
                        <h4 className="font-medium text-white">{status.name}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-300">
                          <span>Status: {status.connectionStatus}</span>
                          <span>Channels: {status.joinedChannels}</span>
                          {status.lastActivity && (
                            <span>Last: {new Date(status.lastActivity).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {status.isActive ? (
                        <span className="px-3 py-1 bg-green-900/20 text-green-300 text-sm rounded-full font-medium">
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSwitchCharacter(status.name)}
                          disabled={isLoading}
                          className="px-3 py-1 bg-blue-900/20 text-blue-300 text-sm rounded-full hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                        >
                          {isLoading ? 'Switching...' : 'Switch'}
                        </button>
                      )}

                      <button
                        onClick={() => handleReconnectCharacter(status.name)}
                        disabled={isLoading}
                        className="p-2 text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
                        title="Reconnect"
                      >
                        <ArrowPathIcon className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleOpenSettings(status.name)}
                        className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
                        title="Settings"
                      >
                        <CogIcon className="w-4 h-4" />
                      </button>

                      {!status.isActive && (
                        <button
                          onClick={() => handleRemoveCharacter(status.name)}
                          className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                          title="Remove Character"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-200 bg-gray-600 border border-gray-500 rounded-lg hover:bg-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Character Settings Modal */}
      {showCharacterSettings && (
        <CharacterSettings
          characterName={selectedCharacterForSettings}
          isOpen={showCharacterSettings}
          onClose={() => setShowCharacterSettings(false)}
        />
      )}

      {/* F-Chat Credential Dialog */}
      {showCredentialDialog && pendingCharacter && (
        <FChatCredentialDialog
          isOpen={showCredentialDialog}
          requestId="character-connection"
          characterName={pendingCharacter.name || pendingCharacter.Name}
          message="Your stored F-Chat credentials could not be decrypted. Please enter your F-Chat credentials to connect this character."
          onSubmit={handleCredentialSubmit}
          onCancel={handleCredentialCancel}
        />
      )}
    </div>
  );
}
