'use client';

import React, { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useLightweightCharacterStore } from '@/stores/lightweightCharacterStore';
import { getStorageStatistics } from '@/lib/storageMigration';
import { useProfileStore } from '@/stores/profileStore';

export default function StorageManagement() {
  const { cleanupStorage, getStorageSize, characterMessages } = useChatStore();
  const { profiles } = useProfileStore();
  const { cleanupOldCharacters, getStorageSize: getLightweightSize } = useLightweightCharacterStore();
  const [storageStats, setStorageStats] = useState({
    lightweightCharacters: 0,
    fullProfiles: 0,
    lightweightSize: 0,
    fullProfileSize: 0,
    totalSize: 0
  });
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    // Calculate initial storage statistics
    const stats = getStorageStatistics();
    setStorageStats(stats);
  }, []);

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
      const beforeStats = getStorageStatistics();
      
      // Clean up both full profiles and lightweight characters
      cleanupStorage();
      cleanupOldCharacters();
      
      // Wait a bit for the cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const afterStats = getStorageStatistics();
      setStorageStats(afterStats);
      
      const removedProfiles = beforeStats.fullProfiles - afterStats.fullProfiles;
      const removedCharacters = beforeStats.lightweightCharacters - afterStats.lightweightCharacters;
      const sizeReduction = beforeStats.totalSize - afterStats.totalSize;
      
      setCleanupResult(
        `Cleanup completed! Removed ${removedProfiles} full profiles and ${removedCharacters} lightweight characters. Storage reduced by ${formatBytes(sizeReduction)}.`
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Total Storage</h4>
            <p className="text-2xl font-bold text-white">{formatBytes(storageStats.totalSize)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {storageStats.totalSize > 5 * 1024 * 1024 ? '⚠️ Over 5MB limit' : '✅ Within limits'}
            </p>
          </div>
          
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Lightweight Characters</h4>
            <p className="text-2xl font-bold text-white">{storageStats.lightweightCharacters.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">Max: 5000 characters</p>
            <p className="text-xs text-blue-400 mt-1">{formatBytes(storageStats.lightweightSize)}</p>
          </div>
          
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Full Profiles</h4>
            <p className="text-2xl font-bold text-white">{storageStats.fullProfiles}</p>
            <p className="text-xs text-gray-400 mt-1">Max: 100 profiles</p>
            <p className="text-xs text-green-400 mt-1">{formatBytes(storageStats.fullProfileSize)}</p>
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
          <h4 className="text-blue-400 font-medium mb-2">💡 Dual Storage System</h4>
          <ul className="text-blue-200 text-sm space-y-1">
            <li>• <strong>Lightweight Characters</strong>: Gender + species for up to 5000 characters (~250KB)</li>
            <li>• <strong>Full Profiles</strong>: Complete profile data for up to 100 characters (~50MB)</li>
            <li>• Gender coloring works for all characters, even without full profiles</li>
            <li>• Full profiles are only stored when explicitly viewed/requested</li>
            <li>• Old data is automatically cleaned up when limits are reached</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
