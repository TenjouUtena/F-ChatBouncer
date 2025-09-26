'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { api } from '@/lib/api';
import BackendLogsViewer from '@/components/logs/BackendLogsViewer';
import FrontendLogsViewer from '@/components/logs/FrontendLogsViewer';

type LogsTab = 'backend' | 'frontend';

export default function LogsPage() {
  const { token, isAuthenticated } = useAuthStore();
  const { characterMessages } = useChatStore();
  const [activeTab, setActiveTab] = useState<LogsTab>('backend');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get frontend log statistics
  const frontendStats = {
    totalCharacters: Object.keys(characterMessages).length,
    totalMessages: Object.values(characterMessages).reduce((sum, messages) => sum + messages.length, 0),
    characters: Object.entries(characterMessages).map(([characterName, messages]) => ({
      characterName,
      messageCount: messages.length,
      lastMessageTime: messages.length > 0 ? new Date(messages[messages.length - 1].timestamp) : new Date(0),
      channels: Array.from(new Set(messages.map(m => m.channel)))
    }))
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Character Logs</h1>
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-300">Please log in to view your character logs.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Character Logs</h1>
          <p className="text-gray-400">
            View and search through your character logs from both backend storage and frontend cache.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('backend')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'backend'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                Backend Logs
                <span className="ml-2 text-xs text-gray-500">(Database)</span>
              </button>
              <button
                onClick={() => setActiveTab('frontend')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'frontend'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                Frontend Logs
                <span className="ml-2 text-xs text-gray-500">
                  ({frontendStats.totalMessages} messages)
                </span>
              </button>
            </nav>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-500 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-400">Error</h3>
                <div className="mt-2 text-sm text-red-300">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="bg-gray-800 rounded-lg p-6">
          {activeTab === 'backend' ? (
            <BackendLogsViewer
              token={token!}
              onError={setError}
              onLoading={setIsLoading}
            />
          ) : (
            <FrontendLogsViewer
              characterMessages={characterMessages}
              stats={frontendStats}
            />
          )}
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="text-white">Loading logs...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
