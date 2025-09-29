'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useProfileStore } from '@/stores/profileStore';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import BackendCharacterLookup from '@/components/BackendCharacterLookup';
import FrontendCharacterInspection from '@/components/FrontendCharacterInspection';
import ManualProfileRequest from '@/components/ManualProfileRequest';

export default function CharactersPage() {
  const { token, isAuthenticated } = useAuthStore();
  const { knownCharacters } = useChatStore();
  const { profiles } = useProfileStore();
  const { connections } = useCharacterIndexedDBStore();
  const [activeTab, setActiveTab] = useState<'backend' | 'frontend' | 'manual'>('backend');

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Character Diagnostics</h1>
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6">
            <p className="text-red-200">Please log in to access character diagnostic tools.</p>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'backend', label: 'Backend API Lookup', description: 'Query character data from the database' },
    { id: 'frontend', label: 'Frontend Data Inspection', description: 'View character data stored in the client' },
    { id: 'manual', label: 'Manual Profile Requests', description: 'Request profile updates from F-Chat' }
  ] as const;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Character Diagnostics</h1>
          <p className="text-gray-400">
            Diagnostic tools for investigating character data capture and storage issues.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-1">Known Characters</h3>
            <p className="text-2xl font-bold text-blue-400">{knownCharacters.size}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-1">Stored Profiles</h3>
            <p className="text-2xl font-bold text-green-400">{Object.keys(profiles).length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-1">User Connections</h3>
            <p className="text-2xl font-bold text-purple-400">{connections.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-1">Active Character</h3>
            <p className="text-lg font-semibold text-yellow-400">
              {connections.find(c => c.isActive)?.characterName || 'None'}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-700 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'backend' && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold mb-2">Backend API Lookup</h2>
                <p className="text-gray-400">{tabs.find(t => t.id === 'backend')?.description}</p>
              </div>
              <BackendCharacterLookup token={token!} />
            </div>
          )}

          {activeTab === 'frontend' && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold mb-2">Frontend Data Inspection</h2>
                <p className="text-gray-400">{tabs.find(t => t.id === 'frontend')?.description}</p>
              </div>
              <FrontendCharacterInspection />
            </div>
          )}

          {activeTab === 'manual' && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold mb-2">Manual Profile Requests</h2>
                <p className="text-gray-400">{tabs.find(t => t.id === 'manual')?.description}</p>
              </div>
              <ManualProfileRequest token={token!} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
