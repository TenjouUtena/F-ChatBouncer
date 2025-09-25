'use client';

import { useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useCharacterStore } from '@/stores/characterStore';

export default function FrontendCharacterInspection() {
  const { profiles, knownCharacters, profileRequestStatus, profileLastRequested } = useChatStore();
  const { connections, activeCharacter } = useCharacterStore();
  
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getProfileStatus = (characterName: string) => {
    const status = profileRequestStatus[characterName];
    const lastRequested = profileLastRequested[characterName];
    
    return {
      status: status || 'idle',
      lastRequested: lastRequested ? formatDate(lastRequested) : 'Never',
      hasProfile: !!profiles[characterName]
    };
  };

  const getConnectionInfo = (characterName: string) => {
    return connections.find(c => c.characterName === characterName);
  };

  const filteredCharacters = Array.from(knownCharacters).filter(name =>
    name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedProfile = selectedCharacter ? profiles[selectedCharacter] : null;
  const selectedProfileStatus = selectedCharacter ? getProfileStatus(selectedCharacter) : null;
  const selectedConnection = selectedCharacter ? getConnectionInfo(selectedCharacter) : null;

  return (
    <div className="space-y-6">
      {/* Frontend Statistics */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Frontend Data Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-700 rounded-lg p-3">
            <p className="text-sm text-gray-400">Known Characters</p>
            <p className="text-xl font-bold text-blue-400">{knownCharacters.size}</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-3">
            <p className="text-sm text-gray-400">Stored Profiles</p>
            <p className="text-xl font-bold text-green-400">{Object.keys(profiles).length}</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-3">
            <p className="text-sm text-gray-400">User Connections</p>
            <p className="text-xl font-bold text-purple-400">{connections.length}</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-3">
            <p className="text-sm text-gray-400">Active Character</p>
            <p className="text-lg font-semibold text-yellow-400">
              {activeCharacter || 'None'}
            </p>
          </div>
        </div>
      </div>

      {/* Character Search and Selection */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Character Search</h3>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search known characters..."
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-2">
          {filteredCharacters.map((characterName) => {
            const profileStatus = getProfileStatus(characterName);
            const connection = getConnectionInfo(characterName);
            
            return (
              <div
                key={characterName}
                className={`bg-gray-700 rounded-lg p-3 cursor-pointer hover:bg-gray-600 transition-colors ${
                  selectedCharacter === characterName ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => setSelectedCharacter(characterName)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{characterName}</p>
                    <p className="text-sm text-gray-400">
                      {connection ? `Connected (${connection.status})` : 'Not connected'}
                      {activeCharacter === characterName && ' • Active'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${
                      profileStatus.hasProfile ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {profileStatus.hasProfile ? 'Has Profile' : 'No Profile'}
                    </p>
                    <p className="text-xs text-gray-400">
                      Status: {profileStatus.status}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Character Details */}
      {selectedCharacter && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Character Details: {selectedCharacter}</h3>
          
          <div className="space-y-4">
            {/* Connection Information */}
            {selectedConnection && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Connection Information</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Status</p>
                    <p className="font-medium text-white">{selectedConnection.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Connected</p>
                    <p className={`font-medium ${selectedConnection.isConnected ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedConnection.isConnected ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Active</p>
                    <p className={`font-medium ${selectedConnection.isActive ? 'text-green-400' : 'text-gray-400'}`}>
                      {selectedConnection.isActive ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Last Activity</p>
                    <p className="text-white">{formatDate(new Date(selectedConnection.lastActivity).getTime())}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Profile Status */}
            {selectedProfileStatus && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Profile Status</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Has Profile</p>
                    <p className={`font-medium ${selectedProfileStatus.hasProfile ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedProfileStatus.hasProfile ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Request Status</p>
                    <p className={`font-medium ${
                      selectedProfileStatus.status === 'success' ? 'text-green-400' :
                      selectedProfileStatus.status === 'failed' ? 'text-red-400' :
                      selectedProfileStatus.status === 'requesting' ? 'text-yellow-400' :
                      'text-gray-400'
                    }`}>
                      {selectedProfileStatus.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Last Requested</p>
                    <p className="text-white">{selectedProfileStatus.lastRequested}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Profile Data */}
            {selectedProfile && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Profile Data</h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-400">Character</p>
                    <p className="text-white">{selectedProfile.character}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Gender</p>
                    <p className="text-white">{selectedProfile.gender}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Timestamp</p>
                    <p className="text-white">{formatDate(new Date(selectedProfile.timestamp).getTime())}</p>
                  </div>
                  
                  {Object.keys(selectedProfile.info || {}).length > 0 && (
                    <div>
                      <p className="text-sm text-gray-400 mb-2">Info Fields</p>
                      <div className="bg-gray-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                          {JSON.stringify(selectedProfile.info, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                  
                  {Object.keys(selectedProfile.select || {}).length > 0 && (
                    <div>
                      <p className="text-sm text-gray-400 mb-2">Select Fields</p>
                      <div className="bg-gray-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                          {JSON.stringify(selectedProfile.select, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                  
                  {Object.keys(selectedProfile.additional || {}).length > 0 && (
                    <div>
                      <p className="text-sm text-gray-400 mb-2">Additional Fields</p>
                      <div className="bg-gray-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                          {JSON.stringify(selectedProfile.additional, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* No Profile Data */}
            {!selectedProfile && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Profile Data</h4>
                <p className="text-gray-400">No profile data available for this character.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* All Profiles Overview */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">All Stored Profiles</h3>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {Object.entries(profiles).map(([characterName, profile]) => (
            <div key={characterName} className="bg-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{characterName}</p>
                  <p className="text-sm text-gray-400">
                    {profile.gender} • {Object.keys(profile.info || {}).length + Object.keys(profile.select || {}).length} fields
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">
                    {formatDate(new Date(profile.timestamp).getTime())}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
