'use client';

import { useState, useEffect } from 'react';
import { useCredentialsStore } from '@/stores/credentialsStore';

interface FChatCredentialDialogProps {
  isOpen: boolean;
  requestId: string;
  characterName: string;
  message: string;
  expiresAt?: string;
  onSubmit: (credentials: { username: string; password: string }) => void;
  onCancel: () => void;
}

export default function FChatCredentialDialog({
  isOpen,
  requestId,
  characterName,
  message,
  expiresAt,
  onSubmit,
  onCancel
}: FChatCredentialDialogProps) {
  const { storeCredentials } = useCredentialsStore();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCredentials({ username: '', password: '' });
      setRememberCredentials(false);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!credentials.username.trim() || !credentials.password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Store credentials if requested
      if (rememberCredentials) {
        await storeCredentials({
          username: '', // App username (not needed for FChat)
          password: '', // App password (not needed for FChat)
          fchatUsername: credentials.username,
          fchatPassword: credentials.password
        }, true);
      }

      // Submit credentials
      onSubmit(credentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store credentials');
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: 'username' | 'password') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({
      ...prev,
      [field]: e.target.value
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">FChat Credentials Required</h2>
        
        <p className="text-gray-600 mb-4">
          {message || `Please provide your FChat credentials to connect as ${characterName}.`}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fchat-username" className="block text-sm font-medium text-gray-700 mb-1">
              FChat Username
            </label>
            <input
              type="text"
              id="fchat-username"
              value={credentials.username}
              onChange={handleInputChange('username')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your FChat username"
              disabled={isSubmitting}
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="fchat-password" className="block text-sm font-medium text-gray-700 mb-1">
              FChat Password
            </label>
            <input
              type="password"
              id="fchat-password"
              value={credentials.password}
              onChange={handleInputChange('password')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your FChat password"
              disabled={isSubmitting}
              autoComplete="current-password"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="remember-credentials"
              checked={rememberCredentials}
              onChange={(e) => setRememberCredentials(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={isSubmitting}
            />
            <label htmlFor="remember-credentials" className="ml-2 block text-sm text-gray-700">
              Remember these credentials for future use
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !credentials.username.trim() || !credentials.password.trim()}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Connecting...' : 'Connect'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </form>

        <div className="mt-4 text-xs text-gray-500">
          <p>Request ID: {requestId}</p>
          {expiresAt && <p>Expires: {new Date(expiresAt).toLocaleString()}</p>}
        </div>
      </div>
    </div>
  );
}
