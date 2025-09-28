'use client';

import React, { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';

export default function StorageManagement() {
  const { cleanupStorage, getStorageSize, profiles, characterMessages } = useChatStore();
  const [storageSize, setStorageSize] = useState<number>(0);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    // Calculate initial storage size
    const size = getStorageSize();
    setStorageSize(size);
  }, [getStorageSize]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    setCleanupResult(null);
    
    try {
      const beforeSize = getStorageSize();
      const beforeProfiles = Object.keys(profiles).length;
      const beforeMessages = Object.values(characterMessages).reduce((total, messages) => total + messages.length, 0);
      
      cleanupStorage();
      
      // Wait a bit for the cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const afterSize = getStorageSize();
      const afterProfiles = Object.keys(profiles).length;
      const afterMessages = Object.values(characterMessages).reduce((total, messages) => total + messages.length, 0);
      
      setStorageSize(afterSize);
      setCleanupResult(
        `Cleanup completed! Removed ${beforeProfiles - afterProfiles} profiles and ${beforeMessages - afterMessages} messages. Storage reduced by ${formatBytes(beforeSize - afterSize)}.`
      );
    } catch (error) {
      setCleanupResult(`Error during cleanup: ${error}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const totalProfiles = Object.keys(profiles).length;
  const totalMessages = Object.values(characterMessages).reduce((total, messages) => total + messages.length, 0);

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4 text-white">Storage Management</h3>
      
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Storage Size</h4>
            <p className="text-2xl font-bold text-white">{formatBytes(storageSize)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {storageSize > 5 * 1024 * 1024 ? '⚠️ Over 5MB limit' : '✅ Within limits'}
            </p>
          </div>
          
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Stored Profiles</h4>
            <p className="text-2xl font-bold text-white">{totalProfiles}</p>
            <p className="text-xs text-gray-400 mt-1">Max: 100 profiles</p>
          </div>
          
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Stored Messages</h4>
            <p className="text-2xl font-bold text-white">{totalMessages.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">Max: 1000 per character</p>
          </div>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
          <h4 className="text-yellow-400 font-medium mb-2">⚠️ Storage Quota Issue</h4>
          <p className="text-yellow-200 text-sm mb-3">
            If you&apos;re experiencing &quot;QuotaExceededError&quot;, your browser&apos;s localStorage is full. 
            The application will automatically clean up old data, but you can also manually clean up here.
          </p>
          <button
            onClick={handleCleanup}
            disabled={isCleaning}
            className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {isCleaning ? 'Cleaning...' : 'Clean Up Storage'}
          </button>
        </div>

        {cleanupResult && (
          <div className={`rounded-lg p-4 ${
            cleanupResult.includes('Error') 
              ? 'bg-red-900/20 border border-red-600/30' 
              : 'bg-green-900/20 border border-green-600/30'
          }`}>
            <p className={`text-sm ${
              cleanupResult.includes('Error') ? 'text-red-200' : 'text-green-200'
            }`}>
              {cleanupResult}
            </p>
          </div>
        )}

        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
          <h4 className="text-blue-400 font-medium mb-2">💡 Tips to Reduce Storage Usage</h4>
          <ul className="text-blue-200 text-sm space-y-1">
            <li>• The app automatically limits profiles to 100 and messages to 1000 per character</li>
            <li>• Old profiles and messages are automatically cleaned up when storage is full</li>
            <li>• Consider clearing chat history for inactive characters</li>
            <li>• Browser localStorage typically has a 5-10MB limit</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
