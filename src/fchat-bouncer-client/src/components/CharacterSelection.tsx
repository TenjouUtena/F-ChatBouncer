'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { signalRService } from '@/lib/signalr';
import { Character } from '@/types';

interface CharacterSelectionProps {
  onCharacterSelect: (character: Character) => Promise<void>;
}

export default function CharacterSelection({ onCharacterSelect }: CharacterSelectionProps) {
  const { user, availableCharacters, setAvailableCharacters } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set up SignalR listeners for character selection events
    signalRService.onCharacterError((data) => {
      console.error('Character error from SignalR:', data);
      setError(data.message || data.originalError || 'An unknown character error occurred');
      setIsLoading(false);
    });

    signalRService.onCharacterSelected(() => {
      setIsLoading(false);
      // Character selection successful - parent component will handle navigation
    });

    // Wait a bit for SignalR to be ready, then fetch characters
    const timer = setTimeout(() => {
      handleGetCharacters();
    }, 500);

    // Cleanup listeners on unmount
    return () => {
      clearTimeout(timer);
      signalRService.offCharacterListeners();
    };
  }, [setAvailableCharacters]);

  const handleGetCharacters = async () => {
    setIsLoading(true);
    setError(null);
    try {

      if (!signalRService.isConnected) {
        throw new Error('SignalR is not connected. Please wait and try again.');
      }

      const characters = await signalRService.getCharacters();
      
      // Update the available characters directly
      const formattedCharacters: Character[] = characters.map(c => ({
        name: c.name || c.Name,
        status: c.status || c.Status,
        statusMessage: c.statusMessage || c.StatusMessage,
        gender: c.gender || c.Gender,
      }));
      setAvailableCharacters(formattedCharacters);
      setIsLoading(false);
    } catch (err) {
      console.error('Error getting characters:', err);
      setError(err instanceof Error ? err.message : 'Failed to get characters');
      setIsLoading(false);
    }
  };

  const handleCharacterSelect = async () => {
    if (!selectedCharacter) return;

    setIsLoading(true);
    setError(null);
    try {
      await signalRService.selectCharacter(selectedCharacter.name);
      // Call the parent callback to update state and navigate
      await onCharacterSelect(selectedCharacter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select character');
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      case 'idle': return 'bg-gray-400';
      case 'away': return 'bg-orange-500';
      case 'crown': return 'bg-purple-500';
      case 'looking': return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Select Character
          </h2>
          <p className="mt-2 text-center text-sm text-gray-300">
            Welcome, {user?.username}! Choose a character to chat as.
          </p>
        </div>

        {isLoading && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-2 text-gray-300">Loading characters...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-500 text-red-300 px-4 py-3 rounded relative">
            {error}
            <button
              onClick={handleGetCharacters}
              className="ml-2 text-red-400 underline hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && availableCharacters.length === 0 && !error && (
          <div className="text-center">
            <p className="text-gray-300">No characters found.</p>
            <button
              onClick={handleGetCharacters}
              className="mt-2 text-indigo-400 underline hover:text-indigo-300"
            >
              Refresh
            </button>
          </div>
        )}

        {availableCharacters.length > 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              {availableCharacters.map((character) => (
                <div
                  key={character.name}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedCharacter?.name === character.name
                      ? 'border-indigo-500 bg-indigo-900/20'
                      : 'border-gray-600 hover:border-gray-500 bg-gray-800'
                  }`}
                  onClick={() => setSelectedCharacter(character)}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(character.status)}`}></div>
                    <div className="flex-1">
                      <h3 className="font-medium text-white">{character.name}</h3>
                      <div className="flex items-center space-x-2 text-sm text-gray-300">
                        <span className="capitalize">{character.gender}</span>
                        <span>•</span>
                        <span className="capitalize">{character.status}</span>
                      </div>
                      {character.statusMessage && (
                        <p className="text-sm text-gray-400 mt-1">{character.statusMessage}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleCharacterSelect}
              disabled={!selectedCharacter || isLoading}
              className="w-full py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900"
            >
              {isLoading ? 'Connecting...' : 'Connect as ' + (selectedCharacter?.name || 'Character')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}