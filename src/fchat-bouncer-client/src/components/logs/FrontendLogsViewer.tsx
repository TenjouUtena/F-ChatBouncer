'use client';

import { useState, useMemo } from 'react';
import { Message } from '@/types';
import { useChatStore } from '@/stores/chatStore';

interface CharacterLogSummary {
  characterName: string;
  messageCount: number;
  lastMessageTime: Date;
  channels: string[];
}

interface FrontendLogsViewerProps {
  characterMessages: Record<string, Message[]>;
  stats: {
    totalCharacters: number;
    totalMessages: number;
    characters: CharacterLogSummary[];
  };
}

type ViewMode = 'characters' | 'channels' | 'logs' | 'filtered';

export default function FrontendLogsViewer({ characterMessages, stats }: FrontendLogsViewerProps) {
  const { getChannelDisplayName } = useChatStore();
  const [viewMode, setViewMode] = useState<ViewMode>('characters');
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageTypeFilter, setMessageTypeFilter] = useState<string>('all');
  const [filterCharacter, setFilterCharacter] = useState<string>('');
  const [filterChannel, setFilterChannel] = useState<string>('');

  // Get all unique channels from all characters
  const allChannels = useMemo(() => {
    const channelSet = new Set<string>();
    Object.values(characterMessages).forEach(messages => {
      messages.forEach(message => channelSet.add(message.channel));
    });
    return Array.from(channelSet).sort();
  }, [characterMessages]);

  // Get channel statistics
  const channelStats = useMemo(() => {
    const channelMap = new Map<string, { messageCount: number; lastMessageTime: Date; characters: Set<string> }>();
    
    Object.entries(characterMessages).forEach(([characterName, messages]) => {
      messages.forEach(message => {
        const channel = message.channel;
        if (!channelMap.has(channel)) {
          channelMap.set(channel, { messageCount: 0, lastMessageTime: new Date(0), characters: new Set() });
        }
        
        const stats = channelMap.get(channel)!;
        stats.messageCount++;
        stats.characters.add(characterName);
        
        const messageTime = new Date(message.timestamp);
        if (messageTime > stats.lastMessageTime) {
          stats.lastMessageTime = messageTime;
        }
      });
    });

    return Array.from(channelMap.entries()).map(([channelName, stats]) => ({
      channelName,
      messageCount: stats.messageCount,
      lastMessageTime: stats.lastMessageTime,
      characters: Array.from(stats.characters)
    })).sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());
  }, [characterMessages]);

  // Get logs for selected character
  const getCharacterLogs = (characterName: string): Message[] => {
    return characterMessages[characterName] || [];
  };

  // Get logs for selected channel
  const getChannelLogs = (channelName: string): Message[] => {
    const logs: Message[] = [];
    Object.entries(characterMessages).forEach(([characterName, messages]) => {
      messages.forEach(message => {
        if (message.channel === channelName) {
          logs.push({ ...message, characterName });
        }
      });
    });
    return logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  };

  // Get all logs for search
  const getAllLogs = (): Message[] => {
    const logs: Message[] = [];
    Object.entries(characterMessages).forEach(([characterName, messages]) => {
      messages.forEach(message => {
        logs.push({ ...message, characterName });
      });
    });
    return logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  };

  // Filter logs based on current view and filters
  const getFilteredLogs = (): Message[] => {
    let logs: Message[] = [];

    if (viewMode === 'filtered') {
      // Use dropdown filters
      logs = getAllLogs();
      
      // Apply character filter
      if (filterCharacter) {
        logs = logs.filter(log => log.characterName === filterCharacter);
      }
      
      // Apply channel filter
      if (filterChannel) {
        logs = logs.filter(log => log.channel === filterChannel);
      }
    } else if (selectedCharacter) {
      logs = getCharacterLogs(selectedCharacter);
    } else if (selectedChannel) {
      logs = getChannelLogs(selectedChannel);
    } else {
      logs = getAllLogs();
    }

    // Apply search filter
    if (searchQuery) {
      logs = logs.filter(log =>
        log.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.channel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.characterName && log.characterName.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply message type filter
    if (messageTypeFilter !== 'all') {
      logs = logs.filter(log => log.messageType === messageTypeFilter);
    }

    return logs;
  };

  const filteredLogs = getFilteredLogs();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const exportLogs = () => {
    const logs = getFilteredLogs();
    const exportData = {
      exportDate: new Date().toISOString(),
      totalMessages: logs.length,
      filters: {
        character: selectedCharacter,
        channel: selectedChannel,
        searchQuery,
        messageType: messageTypeFilter
      },
      logs: logs.map(log => ({
        timestamp: log.timestamp,
        character: log.characterName,
        channel: log.channel,
        sender: log.sender,
        content: log.content,
        messageType: log.messageType
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frontend-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Frontend Logs</h2>
          <p className="text-sm text-gray-400">
            {stats.totalMessages} messages from {stats.totalCharacters} characters
          </p>
        </div>
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

      {/* Filters */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
          />
          <select
            value={messageTypeFilter}
            onChange={(e) => setMessageTypeFilter(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          >
            <option value="all">All Types</option>
            <option value="Chat">Chat</option>
            <option value="Action">Action</option>
            <option value="System">System</option>
            <option value="Private">Private</option>
            <option value="Announcement">Announcement</option>
            <option value="Roll">Roll</option>
          </select>
          <button
            onClick={exportLogs}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Export Logs
          </button>
          <div className="text-sm text-gray-400 flex items-center">
            {filteredLogs.length} message{filteredLogs.length !== 1 ? 's' : ''} shown
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            value={filterCharacter}
            onChange={(e) => {
              setFilterCharacter(e.target.value);
              if (e.target.value) {
                setViewMode('filtered');
              }
            }}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          >
            <option value="">All Characters</option>
            {stats.characters.map((character) => (
              <option key={character.characterName} value={character.characterName}>
                {character.characterName}
              </option>
            ))}
          </select>
          
          <select
            value={filterChannel}
            onChange={(e) => {
              setFilterChannel(e.target.value);
              if (e.target.value) {
                setViewMode('filtered');
              }
            }}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          >
            <option value="">All Channels</option>
            {allChannels.map((channelName) => (
              <option key={channelName} value={channelName}>
                {getChannelDisplayName(channelName)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'characters' && (
        <div>
          <h3 className="text-lg font-medium mb-4">Characters with Logs</h3>
          
          {stats.characters.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No character logs found in frontend storage.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.characters.map((character) => (
                <div
                  key={character.characterName}
                  className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => {
                    setSelectedCharacter(character.characterName);
                    setViewMode('logs');
                  }}
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
          <h3 className="text-lg font-medium mb-4">Channels with Logs</h3>
          
          {channelStats.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No channel logs found in frontend storage.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {channelStats.map((channel) => (
                <div
                  key={channel.channelName}
                  className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => {
                    setSelectedChannel(channel.channelName);
                    setViewMode('logs');
                  }}
                >
                  <h4 className="font-medium text-white">{getChannelDisplayName(channel.channelName)}</h4>
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
               'All Logs'}
            </h3>
            <button
              onClick={() => {
                setSelectedCharacter(null);
                setSelectedChannel(null);
                setFilterCharacter('');
                setFilterChannel('');
                setViewMode('characters');
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Back
            </button>
          </div>
          
          {filteredLogs.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No logs found matching the current filters.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredLogs.map((log, index) => (
                <div key={`${log.id || index}-${log.timestamp}`} className="bg-gray-700 rounded p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-blue-400">{log.sender}</span>
                    <span className="text-xs text-gray-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <div className="text-gray-300 mb-1">
                    <span className="text-gray-500">#{getChannelDisplayName(log.channel)}</span>
                    <span className="mx-2 text-gray-600">•</span>
                    <span className="text-gray-500">{log.messageType}</span>
                    {log.characterName && (
                      <>
                        <span className="mx-2 text-gray-600">•</span>
                        <span className="text-gray-500">{log.characterName}</span>
                      </>
                    )}
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
