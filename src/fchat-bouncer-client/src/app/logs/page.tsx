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
  const { characterMessages, getDeduplicationPreview, deduplicateMessages } = useChatStore();
  const [activeTab, setActiveTab] = useState<LogsTab>('backend');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deduplicationPreview, setDeduplicationPreview] = useState<any>(null);
  const [showDeduplicationPreview, setShowDeduplicationPreview] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [deduplicationResult, setDeduplicationResult] = useState<any>(null);

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

  const handleGetDeduplicationPreview = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const preview = await getDeduplicationPreview();
      setDeduplicationPreview(preview);
      setShowDeduplicationPreview(true);
    } catch (error) {
      console.error('Failed to get deduplication preview:', error);
      setError('Failed to get deduplication preview');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeduplicateMessages = async () => {
    try {
      setIsDeduplicating(true);
      setError(null);
      const result = await deduplicateMessages();
      setDeduplicationResult(result);
      setShowDeduplicationPreview(false);
      setDeduplicationPreview(null);
    } catch (error) {
      console.error('Failed to deduplicate messages:', error);
      setError('Failed to deduplicate messages');
    } finally {
      setIsDeduplicating(false);
    }
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

        {/* Deduplication Controls */}
        <div className="mb-6 bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Message Deduplication</h2>
              <p className="text-gray-400 text-sm mt-1">
                Remove duplicate messages from your IndexedDB storage
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleGetDeduplicationPreview}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                           text-white text-sm rounded-lg transition-colors duration-200
                           flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    <span>Preview Duplicates</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Deduplication Preview */}
          {showDeduplicationPreview && deduplicationPreview && (
            <div className="bg-gray-700 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-white">Deduplication Preview</h3>
                <button
                  onClick={() => setShowDeduplicationPreview(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-600 rounded p-3">
                  <div className="text-2xl font-bold text-white">{deduplicationPreview.totalMessages}</div>
                  <div className="text-sm text-gray-300">Total Messages</div>
                </div>
                <div className="bg-orange-600 rounded p-3">
                  <div className="text-2xl font-bold text-white">{deduplicationPreview.duplicatesFound}</div>
                  <div className="text-sm text-gray-300">Duplicates Found</div>
                </div>
                <div className="bg-green-600 rounded p-3">
                  <div className="text-2xl font-bold text-white">
                    {deduplicationPreview.totalMessages - deduplicationPreview.duplicatesFound}
                  </div>
                  <div className="text-sm text-gray-300">After Cleanup</div>
                </div>
              </div>

              {/* Character Breakdown */}
              <div className="space-y-3">
                <h4 className="text-md font-medium text-white">Character Breakdown:</h4>
                {deduplicationPreview.characterBreakdown.map((char: any) => (
                  <div key={char.characterName} className="bg-gray-600 rounded p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-white">{char.characterName}</span>
                      <span className="text-sm text-gray-300">
                        {char.duplicatesFound} duplicates of {char.totalMessages} messages
                      </span>
                    </div>
                    {char.channels.map((channel: any) => (
                      <div key={channel.channelId} className="ml-4 text-sm text-gray-300">
                        {channel.channelId}: {channel.duplicatesFound} duplicates of {channel.totalMessages} messages
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={handleDeduplicateMessages}
                  disabled={isDeduplicating || deduplicationPreview.duplicatesFound === 0}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 
                             text-white text-sm rounded-lg transition-colors duration-200
                             flex items-center space-x-2"
                >
                  {isDeduplicating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Removing Duplicates...</span>
                    </>
                  ) : (
                    <>
                      <span>🗑️</span>
                      <span>Remove {deduplicationPreview.duplicatesFound} Duplicates</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Deduplication Result */}
          {deduplicationResult && (
            <div className="bg-green-900/50 border border-green-500 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-green-400">Deduplication Complete</h3>
                  <div className="mt-1 text-sm text-green-300">
                    <p>Removed {deduplicationResult.duplicatesRemoved} duplicate messages from {deduplicationResult.totalMessages} total messages</p>
                  </div>
                </div>
                <button
                  onClick={() => setDeduplicationResult(null)}
                  className="ml-auto text-green-400 hover:text-green-300"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>

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
