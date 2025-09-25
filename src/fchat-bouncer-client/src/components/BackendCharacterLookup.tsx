'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface BackendCharacterLookupProps {
  token: string;
}

interface CharacterDiagnosticResponse {
  character: {
    id: number;
    name: string;
    status: string;
    statusMessage?: string;
    gender: string;
    isOnline: boolean;
    lastSeen: string;
    firstSeen: string;
    lastUpdated: string;
    profileData?: string;
    structuredProfileData?: string;
    rawProData?: string;
  };
  profile?: any;
  connections: any[];
  channels: string[];
  hasProfileData: boolean;
  hasStructuredProfile: boolean;
  profileAge: string;
  connectionCount: number;
  channelCount: number;
}

interface CharacterStats {
  totalCharacters: number;
  onlineCharacters: number;
  charactersWithProfiles: number;
  recentlyUpdated: number;
  profileCoverage: number;
  onlinePercentage: number;
}

export default function BackendCharacterLookup({ token }: BackendCharacterLookupProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [characterData, setCharacterData] = useState<CharacterDiagnosticResponse | null>(null);
  const [stats, setStats] = useState<CharacterStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const results = await api.searchCharactersDiagnostic(token, searchQuery);
      setSearchResults(results.characters || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search characters');
    } finally {
      setLoading(false);
    }
  };

  const handleGetCharacter = async () => {
    if (!characterName.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await api.getCharacterDiagnostic(token, characterName);
      setCharacterData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get character data');
    } finally {
      setLoading(false);
    }
  };

  const handleGetStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await api.getCharacterStats(token);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get statistics');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string, isOnline: boolean) => {
    if (!isOnline) return 'text-gray-400';
    switch (status.toLowerCase()) {
      case 'online': return 'text-green-400';
      case 'looking': return 'text-blue-400';
      case 'busy': return 'text-yellow-400';
      case 'away': return 'text-orange-400';
      case 'dnd': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Database Statistics</h3>
          <button
            onClick={handleGetStats}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg text-sm font-medium"
          >
            {loading ? 'Loading...' : 'Refresh Stats'}
          </button>
        </div>
        
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Total Characters</p>
              <p className="text-xl font-bold text-white">{stats.totalCharacters}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Online Characters</p>
              <p className="text-xl font-bold text-green-400">{stats.onlineCharacters}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">With Profiles</p>
              <p className="text-xl font-bold text-blue-400">{stats.charactersWithProfiles}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Profile Coverage</p>
              <p className="text-xl font-bold text-purple-400">{stats.profileCoverage.toFixed(1)}%</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Online Percentage</p>
              <p className="text-xl font-bold text-yellow-400">{stats.onlinePercentage.toFixed(1)}%</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Recently Updated</p>
              <p className="text-xl font-bold text-orange-400">{stats.recentlyUpdated}</p>
            </div>
          </div>
        )}
      </div>

      {/* Search Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Search Characters</h3>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Enter character name to search..."
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={loading || !searchQuery.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg text-sm font-medium"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-gray-300">Search Results ({searchResults.length})</h4>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {searchResults.map((char) => (
                <div
                  key={char.id}
                  className="bg-gray-700 rounded-lg p-3 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => {
                    setCharacterName(char.name);
                    setCharacterData(null);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{char.name}</p>
                      <p className="text-sm text-gray-400">
                        {char.gender} • {char.connectionCount} connections • {char.channelCount} channels
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${getStatusColor(char.status, char.isOnline)}`}>
                        {char.status}
                      </p>
                      <p className="text-xs text-gray-400">
                        {char.hasProfileData ? 'Has Profile' : 'No Profile'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Character Lookup Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Get Character Details</h3>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="Enter exact character name..."
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            onKeyPress={(e) => e.key === 'Enter' && handleGetCharacter()}
          />
          <button
            onClick={handleGetCharacter}
            disabled={loading || !characterName.trim()}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg text-sm font-medium"
          >
            {loading ? 'Loading...' : 'Get Details'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-4">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {characterData && (
          <div className="space-y-4">
            {/* Basic Information */}
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="font-semibold text-white mb-3">Basic Information</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Name</p>
                  <p className="font-medium text-white">{characterData.character.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Status</p>
                  <p className={`font-medium ${getStatusColor(characterData.character.status, characterData.character.isOnline)}`}>
                    {characterData.character.status}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Gender</p>
                  <p className="font-medium text-white">{characterData.character.gender}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Online</p>
                  <p className={`font-medium ${characterData.character.isOnline ? 'text-green-400' : 'text-gray-400'}`}>
                    {characterData.character.isOnline ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
              {characterData.character.statusMessage && (
                <div className="mt-3">
                  <p className="text-sm text-gray-400">Status Message</p>
                  <p className="text-white">{characterData.character.statusMessage}</p>
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="font-semibold text-white mb-3">Timestamps</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-400">First Seen</p>
                  <p className="text-white">{formatDate(characterData.character.firstSeen)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Last Seen</p>
                  <p className="text-white">{formatDate(characterData.character.lastSeen)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Last Updated</p>
                  <p className="text-white">{formatDate(characterData.character.lastUpdated)}</p>
                </div>
              </div>
            </div>

            {/* Profile Information */}
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="font-semibold text-white mb-3">Profile Information</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-400">Has Profile Data</p>
                  <p className={`font-medium ${characterData.hasProfileData ? 'text-green-400' : 'text-red-400'}`}>
                    {characterData.hasProfileData ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Has Structured Profile</p>
                  <p className={`font-medium ${characterData.hasStructuredProfile ? 'text-green-400' : 'text-red-400'}`}>
                    {characterData.hasStructuredProfile ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Connections</p>
                  <p className="font-medium text-white">{characterData.connectionCount}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Channels</p>
                  <p className="font-medium text-white">{characterData.channelCount}</p>
                </div>
              </div>

              {characterData.profile && (
                <div className="mt-4">
                  <h5 className="font-medium text-gray-300 mb-2">Profile Fields</h5>
                  <div className="bg-gray-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                      {JSON.stringify(characterData.profile, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Raw Data */}
            {characterData.character.profileData && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Raw Profile Data</h4>
                <div className="bg-gray-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                    {characterData.character.profileData}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
