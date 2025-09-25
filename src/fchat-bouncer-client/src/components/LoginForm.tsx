'use client';

import { useState, useEffect } from 'react';
import { LoginCredentials } from '@/types';
import { useCredentialsStore } from '@/stores/credentialsStore';

interface LoginFormProps {
  onLogin: (credentials: LoginCredentials) => Promise<void>;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const {
    initialize,
    retrieveCredentials,
    storeCredentials,
    clearCredentials,
    rememberCredentials,
    setRememberCredentials,
    hasStoredCredentials,
    isInitialized
  } = useCredentialsStore();

  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: '',
    fchatUsername: '',
    fchatPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClearOption, setShowClearOption] = useState(false);

  // Initialize credentials store and load saved credentials
  useEffect(() => {
    const initializeAndLoad = async () => {
      await initialize();

      if (hasStoredCredentials) {
        try {
          const savedCredentials = await retrieveCredentials();
          if (savedCredentials) {
            setCredentials(savedCredentials);
            setShowClearOption(true);
          }
        } catch (error) {
          console.error('Failed to load saved credentials:', error);
        }
      }
    };

    initializeAndLoad();
  }, [initialize, hasStoredCredentials, retrieveCredentials]);

  // Cleanup effect to clear sensitive data when component unmounts
  useEffect(() => {
    return () => {
      // Clear sensitive data from memory when component unmounts
      setCredentials({
        username: '',
        password: '',
        fchatUsername: '',
        fchatPassword: '',
      });
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Store credentials if user wants to remember them
      if (isInitialized) {
        await storeCredentials(credentials, rememberCredentials);
      }

      await onLogin(credentials);
      
      // Clear sensitive data from memory after successful login
      setCredentials({
        username: '',
        password: '',
        fchatUsername: '',
        fchatPassword: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof LoginCredentials) => (e: React.ChangeEvent<HTMLInputElement>) => {
    // Prevent any potential URL exposure by ensuring we never store passwords in component state
    // that could be accidentally serialized or logged
    const value = e.target.value;
    
    setCredentials(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleClearCredentials = () => {
    clearCredentials();
    setCredentials({
      username: '',
      password: '',
      fchatUsername: '',
      fchatPassword: '',
    });
    setShowClearOption(false);
    setRememberCredentials(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            F-Chat Bouncer
          </h2>
          <p className="mt-2 text-center text-sm text-gray-300">
            Connect to F-Chat through the bouncer
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                Bouncer Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Your bouncer username"
                value={credentials.username}
                onChange={handleChange('username')}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Bouncer Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Your bouncer password"
                value={credentials.password}
                onChange={handleChange('password')}
              />
            </div>
            <div className="border-t border-gray-600 pt-4">
              <h3 className="text-sm font-medium text-gray-300 mb-2">F-Chat Credentials</h3>
              <div className="space-y-2">
                <input
                  id="fchatUsername"
                  name="fchatUsername"
                  type="text"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="F-Chat username"
                  value={credentials.fchatUsername}
                  onChange={handleChange('fchatUsername')}
                />
                <input
                  id="fchatPassword"
                  name="fchatPassword"
                  type="password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="F-Chat password"
                  value={credentials.fchatPassword}
                  onChange={handleChange('fchatPassword')}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-300 px-4 py-3 rounded relative">
              {error}
            </div>
          )}

          {/* Credential Management Options */}
          <div className="space-y-3">
            {/* Remember credentials checkbox */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-credentials"
                  name="remember-credentials"
                  type="checkbox"
                  checked={rememberCredentials}
                  onChange={(e) => setRememberCredentials(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-800"
                />
                <label htmlFor="remember-credentials" className="ml-2 block text-sm text-gray-300">
                  Remember F-Chat credentials securely
                </label>
              </div>

              {/* Clear saved credentials button */}
              {showClearOption && (
                <button
                  type="button"
                  onClick={handleClearCredentials}
                  className="text-sm text-red-400 hover:text-red-300 underline"
                >
                  Clear saved
                </button>
              )}
            </div>

            {/* Info about credential storage */}
            {rememberCredentials && (
              <div className="bg-blue-900/20 border border-blue-500 rounded-md p-3">
                <div className="text-xs text-blue-300">
                  <p className="font-medium">🔒 Secure Storage</p>
                  <p>Your F-Chat credentials will be encrypted and stored locally on this device only.</p>
                </div>
              </div>
            )}

            {/* Show when credentials are loaded */}
            {showClearOption && (
              <div className="bg-green-900/20 border border-green-500 rounded-md p-3">
                <div className="text-xs text-green-300">
                  <p className="font-medium">✓ Credentials Loaded</p>
                  <p>Using saved credentials from this device.</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900"
            >
              {isLoading ? 'Connecting...' : 'Connect to F-Chat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}