'use client';

import { Message } from '@/types';
import { signalRService } from '@/lib/signalr';
import { consoleUtils } from './Console';

interface DebugPanelProps {
  messages: Message[];
  selectedChannels: string[];
  onClearAllHistory: () => void;
  onShowProfile: (characterName: string) => void;
  getProfile: (characterName: string) => any;
  showConsole: boolean;
  onToggleConsole: () => void;
}

export default function DebugPanel({
  messages,
  selectedChannels,
  onClearAllHistory,
  onShowProfile,
  getProfile,
  showConsole,
  onToggleConsole
}: DebugPanelProps) {
  const handleAnalyzeMessages = () => {
    const messageCounts = messages.reduce((acc, msg) => {
      const key = `${msg.sender}:${msg.content.substring(0, 30)}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const duplicates = Object.entries(messageCounts).filter(([, count]) => count > 1);

    console.log('Message Analysis:', {
      totalMessages: messages.length,
      duplicateMessages: duplicates,
      messagesByChannel: messages.reduce((acc, msg) => {
        acc[msg.channel || 'unknown'] = (acc[msg.channel || 'unknown'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      messagesBySender: messages.reduce((acc, msg) => {
        acc[msg.sender] = (acc[msg.sender] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });
  };

  const handleTestProfileRequest = async () => {
    const characterName = prompt('Enter character name to request profile:');
    if (characterName) {
      try {
        await signalRService.requestProfile(characterName);
      } catch (error) {
        console.error('❌ [DEBUG] Failed to request profile:', error);
      }
    }
  };

  const handleViewProfile = () => {
    const characterName = prompt('Enter character name to view profile:');
    if (characterName) {
      const profile = getProfile(characterName);
      if (profile) {
        onShowProfile(characterName);
      } else {
        alert(`No profile data found for ${characterName}. Try requesting it first.`);
      }
    }
  };

  const handleTestConsole = () => {
    consoleUtils.info('Test info message', { timestamp: new Date() });
    consoleUtils.success('Test success message', { action: 'test' });
    consoleUtils.warning('Test warning message', { level: 'medium' });
    consoleUtils.error('Test error message', { code: 'TEST_ERROR' });
    consoleUtils.friend('Friend joined channel', { friend: 'TestFriend', channel: 'test-channel' });
    consoleUtils.status('Status update received', { status: 'online', character: 'TestCharacter' });
  };

  return (
    <div className="bg-red-900 border-b border-red-700 p-3">
      <div className="flex items-center justify-between">
        <div className="text-red-200 text-sm">
          <span className="font-semibold">🔧 Debug Panel</span>
          <span className="ml-4">Messages: {messages.length}</span>
          <span className="ml-4">Channels: {selectedChannels.length}</span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={onToggleConsole}
            className={`px-3 py-1 text-white text-sm rounded transition-colors ${
              showConsole 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-gray-600 hover:bg-gray-700'
            }`}
            title={showConsole ? 'Hide Console' : 'Show Console'}
          >
            {showConsole ? '📺 Hide Console' : '📺 Show Console'}
          </button>
          <button
            onClick={onClearAllHistory}
            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
          >
            Clear All History (FE + BE)
          </button>
          <button
            onClick={handleAnalyzeMessages}
            className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
          >
            Analyze Messages
          </button>
          <button
            onClick={handleTestProfileRequest}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Test Profile Request
          </button>
          <button
            onClick={handleViewProfile}
            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
          >
            View Profile
          </button>
          <button
            onClick={handleTestConsole}
            className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
          >
            Test Console
          </button>
        </div>
      </div>
    </div>
  );
}
