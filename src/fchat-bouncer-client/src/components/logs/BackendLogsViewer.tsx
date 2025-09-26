'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface CharacterLogSummary {
  characterName: string;
  messageCount: number;
  lastMessageTime: string;
  channels: string[];
}

interface ChannelLogSummary {
  channelName: string;
  channelTitle: string;
  messageCount: number;
  lastMessageTime: string;
  characters: string[];
}

interface MessageLogDto {
  id: number;
  channelName: string;
  sender: string;
  content: string;
  messageType: string;
  timestamp: string;
}

interface BackendLogsViewerProps {
  token: string;
  onError: (error: string | null) => void;
  onLoading: (loading: boolean) => void;
}

type ViewMode = 'characters' | 'channels' | 'logs' | 'filtered';

export default function BackendLogsViewer({ token, onError, onLoading }: BackendLogsViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('characters');
  const [characters, setCharacters] = useState<CharacterLogSummary[]>([]);
  const [channels, setChannels] = useState<ChannelLogSummary[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [logs, setLogs] = useState<MessageLogDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCharacter, setFilterCharacter] = useState<string>('');
  const [filterChannel, setFilterChannel] = useState<string>('');

  // Load characters with logs
  const loadCharacters = async () => {
    try {
      setIsLoading(true);
      onLoading(true);
      onError(null);

      const response = await api.getCharactersWithLogs(token);

      setCharacters(response.characters || []);
    } catch (error: any) {
      console.error('Failed to load characters:', error);
      onError(error.response?.data?.message || 'Failed to load characters');
    } finally {
      setIsLoading(false);
      onLoading(false);
    }
  };

  // Load channels with logs
  const loadChannels = async () => {
    try {
      setIsLoading(true);
      onLoading(true);
      onError(null);

      const response = await api.getChannelsWithLogs(token);

      setChannels(response.channels || []);
    } catch (error: any) {
      console.error('Failed to load channels:', error);
      onError(error.response?.data?.message || 'Failed to load channels');
    } finally {
      setIsLoading(false);
      onLoading(false);
    }
  };

  // Load logs for selected character
  const loadCharacterLogs = async (characterName: string) => {
    try {
      setIsLoading(true);
      onLoading(true);
      onError(null);

      const response = await api.getCharacterLogs(token, characterName, dateFrom, dateTo, 1000);

      setLogs(response.messages || []);
      setViewMode('logs');
    } catch (error: any) {
      console.error('Failed to load character logs:', error);
      onError(error.response?.data?.message || 'Failed to load character logs');
    } finally {
      setIsLoading(false);
      onLoading(false);
    }
  };

  // Load logs for selected channel
  const loadChannelLogs = async (channelName: string) => {
    try {
      setIsLoading(true);
      onLoading(true);
      onError(null);

      const response = await api.getChannelLogs(token, channelName, dateFrom, dateTo, 1000);

      setLogs(response.messages || []);
      setViewMode('logs');
    } catch (error: any) {
      console.error('Failed to load channel logs:', error);
      onError(error.response?.data?.message || 'Failed to load channel logs');
    } finally {
      setIsLoading(false);
      onLoading(false);
    }
  };

  // Search logs with filters
  const searchLogs = async () => {
    try {
      setIsLoading(true);
      onLoading(true);
      onError(null);

      const response = await api.searchLogs(
        token, 
        filterCharacter || undefined, 
        filterChannel || undefined, 
        searchQuery || undefined, 
        undefined, 
        dateFrom || undefined, 
        dateTo || undefined, 
        1000
      );

      setLogs(response.messages || []);
      setViewMode('filtered');
    } catch (error: any) {
      console.error('Failed to search logs:', error);
      onError(error.response?.data?.message || 'Failed to search logs');
    } finally {
      setIsLoading(false);
      onLoading(false);
    }
  };

  // Filter logs by search query
  const filteredLogs = logs.filter(log =>
    log.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.channelName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Backend Logs</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('characters')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'characters'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Characters
          </button>
          <button
            onClick={() => setViewMode('channels')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'channels'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Channels
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          />
          <button
            onClick={searchLogs}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Search
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            value={filterCharacter}
            onChange={(e) => setFilterCharacter(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          >
            <option value="">All Characters</option>
            {characters.map((character) => (
              <option key={character.characterName} value={character.characterName}>
                {character.characterName}
              </option>
            ))}
          </select>
          
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          >
            <option value="">All Channels</option>
            {channels.map((channel) => (
              <option key={channel.channelName} value={channel.channelName}>
                {channel.channelTitle || channel.channelName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'characters' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Characters with Logs</h3>
            <button
              onClick={loadCharacters}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Load Characters
            </button>
          </div>
          
          {characters.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No characters loaded. Click &quot;Load Characters&quot; to fetch from backend.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {characters.map((character) => (
                <div
                  key={character.characterName}
                  className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => loadCharacterLogs(character.characterName)}
                >
                  <h4 className="font-medium text-white">{character.characterName}</h4>
                  <p className="text-sm text-gray-400">{character.messageCount} messages</p>
                  <p className="text-xs text-gray-500">{formatRelativeTime(character.lastMessageTime)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {character.channels.length} channel{character.channels.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'channels' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Channels with Logs</h3>
            <button
              onClick={loadChannels}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Load Channels
            </button>
          </div>
          
          {channels.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No channels loaded. Click &quot;Load Channels&quot; to fetch from backend.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {channels.map((channel) => (
                <div
                  key={channel.channelName}
                  className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => loadChannelLogs(channel.channelName)}
                >
                  <h4 className="font-medium text-white">{channel.channelTitle || channel.channelName}</h4>
                  <p className="text-sm text-gray-400">{channel.messageCount} messages</p>
                  <p className="text-xs text-gray-500">{formatRelativeTime(channel.lastMessageTime)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {channel.characters.length} character{channel.characters.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(viewMode === 'logs' || viewMode === 'filtered') && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">
              {viewMode === 'filtered' ? 'Filtered Results' :
               selectedCharacter ? `Logs for ${selectedCharacter}` : 
               selectedChannel ? `Logs for ${selectedChannel}` : 
               'Search Results'}
            </h3>
            <button
              onClick={() => {
                setViewMode('characters');
                setSelectedCharacter(null);
                setSelectedChannel(null);
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Back
            </button>
          </div>
          
          {filteredLogs.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No logs found.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredLogs.map((log) => (
                <div key={log.id} className="bg-gray-700 rounded p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-blue-400">{log.sender}</span>
                    <span className="text-xs text-gray-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <div className="text-gray-300 mb-1">
                    <span className="text-gray-500">#{log.channelName}</span>
                    <span className="mx-2 text-gray-600">•</span>
                    <span className="text-gray-500">{log.messageType}</span>
                  </div>
                  <div className="text-white">{log.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
