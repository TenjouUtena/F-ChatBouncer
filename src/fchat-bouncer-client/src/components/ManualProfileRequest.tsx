'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chatStore';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';

interface ManualProfileRequestProps {
  token: string;
}

export default function ManualProfileRequest({ token }: ManualProfileRequestProps) {
  const { requestProfileForCharacter, profiles } = useChatStore();
  const { connections } = useCharacterIndexedDBStore();
  
  const [characterName, setCharacterName] = useState('');
  const [requestHistory, setRequestHistory] = useState<Array<{
    characterName: string;
    timestamp: string;
    status: 'success' | 'error' | 'pending';
    message: string;
  }>>([]);
  const [loading, setLoading] = useState(false);

  const handleRequestProfile = async () => {
    if (!characterName.trim()) return;
    
    setLoading(true);
    const timestamp = new Date().toISOString();
    
    // Add to history immediately
    setRequestHistory(prev => [{
      characterName,
      timestamp,
      status: 'pending',
      message: 'Requesting profile...'
    }, ...prev]);

    try {
      // Use the existing API method for profile requests
      await api.requestProfileManually(token, characterName);
      
      // Update history with success
      setRequestHistory(prev => prev.map((item, index) => 
        index === 0 ? {
          ...item,
          status: 'success',
          message: 'Profile request submitted successfully'
        } : item
      ));
      
      // Clear the input
      setCharacterName('');
      
    } catch (error) {
      // Update history with error
      setRequestHistory(prev => prev.map((item, index) => 
        index === 0 ? {
          ...item,
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to request profile'
        } : item
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestProfileManual = async () => {
    if (!characterName.trim()) return;
    
    setLoading(true);
    const timestamp = new Date().toISOString();
    
    // Add to history immediately
    setRequestHistory(prev => [{
      characterName,
      timestamp,
      status: 'pending',
      message: 'Requesting profile via diagnostic API...'
    }, ...prev]);

    try {
      // Use the new diagnostic API method
      await api.requestProfileManually(token, characterName);
      
      // Update history with success
      setRequestHistory(prev => prev.map((item, index) => 
        index === 0 ? {
          ...item,
          status: 'success',
          message: 'Manual profile request submitted successfully'
        } : item
      ));
      
      // Clear the input
      setCharacterName('');
      
    } catch (error) {
      // Update history with error
      setRequestHistory(prev => prev.map((item, index) => 
        index === 0 ? {
          ...item,
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to request profile'
        } : item
      ));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'pending': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'pending': return '⏳';
      default: return '?';
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Request Form */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Request Profile from F-Chat</h3>
        <p className="text-gray-400 mb-4">
          Manually request profile data from F-Chat for a specific character. This will trigger a PRO command to fetch the latest profile information.
        </p>
        
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="Enter character name..."
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            onKeyPress={(e) => e.key === 'Enter' && handleRequestProfile()}
          />
        </div>
        
        <div className="flex gap-4">
          <button
            onClick={handleRequestProfile}
            disabled={loading || !characterName.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg text-sm font-medium"
          >
            {loading ? 'Requesting...' : 'Request Profile (Standard)'}
          </button>
          
          <button
            onClick={handleRequestProfileManual}
            disabled={loading || !characterName.trim()}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg text-sm font-medium"
          >
            {loading ? 'Requesting...' : 'Request Profile (Diagnostic)'}
          </button>
        </div>
      </div>

      {/* Quick Character Selection */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Select from Known Characters</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {connections.map((connection) => (
            <button
              key={connection.characterName}
              onClick={() => setCharacterName(connection.characterName)}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-left transition-colors"
            >
              <p className="font-medium text-white">{connection.characterName}</p>
              <p className="text-xs text-gray-400">
                {connection.isActive ? 'Active' : 'Inactive'} • {connection.status}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Request History */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Request History</h3>
          <button
            onClick={() => setRequestHistory([])}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Clear History
          </button>
        </div>
        
        {requestHistory.length === 0 ? (
          <p className="text-gray-400">No profile requests made yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {requestHistory.map((request, index) => (
              <div key={index} className="bg-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg ${getStatusColor(request.status)}`}>
                      {getStatusIcon(request.status)}
                    </span>
                    <div>
                      <p className="font-medium text-white">{request.characterName}</p>
                      <p className="text-sm text-gray-400">{request.message}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">{formatDate(request.timestamp)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile Status Overview */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Profile Status Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="font-medium text-white mb-2">Characters with Profiles</h4>
            <p className="text-2xl font-bold text-green-400">{Object.keys(profiles).length}</p>
            <p className="text-sm text-gray-400">out of {connections.length} connected characters</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="font-medium text-white mb-2">Profile Coverage</h4>
            <p className="text-2xl font-bold text-blue-400">
              {connections.length > 0 ? Math.round((Object.keys(profiles).length / connections.length) * 100) : 0}%
            </p>
            <p className="text-sm text-gray-400">of connected characters have profiles</p>
          </div>
        </div>
        
        {Object.keys(profiles).length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium text-white mb-2">Characters with Profiles</h4>
            <div className="flex flex-wrap gap-2">
              {Object.keys(profiles).map((characterName) => (
                <span
                  key={characterName}
                  className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-sm"
                >
                  {characterName}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-900/20 border border-blue-500/50 rounded-lg p-4">
        <h4 className="font-medium text-blue-300 mb-2">How Profile Requests Work</h4>
        <ul className="text-sm text-blue-200 space-y-1">
          <li>• <strong>Standard Request:</strong> Uses the existing profile request system</li>
          <li>• <strong>Diagnostic Request:</strong> Uses the new diagnostic API endpoint</li>
          <li>• Both methods will send a PRO command to F-Chat to fetch the latest profile data</li>
          <li>• Profile data will be automatically parsed and stored when received</li>
          <li>• Check the request history above to see the status of your requests</li>
        </ul>
      </div>
    </div>
  );
}
