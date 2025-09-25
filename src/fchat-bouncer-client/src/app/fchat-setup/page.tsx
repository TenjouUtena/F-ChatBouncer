'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { FChatCredentialsRequest } from '@/types';

export default function FChatSetupPage() {
  const [credentials, setCredentials] = useState<FChatCredentialsRequest>({
    fchatUsername: '',
    fchatPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/');
      return;
    }

    // Check if F-Chat credentials are already set
    const hasFChatCredentials = localStorage.getItem('has_fchat_credentials') === 'true';
    if (hasFChatCredentials) {
      router.push('/');
      return;
    }
  }, [router]);

  const handleInputChange = (field: keyof FChatCredentialsRequest) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      await api.updateFChatCredentials(token, credentials);
      
      // Update local storage
      localStorage.setItem('has_fchat_credentials', 'true');
      
      // Redirect to main app
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update F-Chat credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    // Allow user to skip this step and proceed to main app
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            F-Chat Credentials Setup
          </h2>
          <p className="mt-2 text-center text-sm text-gray-300">
            Enter your F-Chat credentials to connect to the chat network
          </p>
          <div className="mt-4 bg-blue-900/20 border border-blue-500 rounded-md p-3">
            <div className="text-xs text-blue-300">
              <p className="font-medium">🔒 Secure Storage</p>
              <p>Your F-Chat credentials will be encrypted and stored securely on the server.</p>
            </div>
          </div>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="fchatUsername" className="block text-sm font-medium text-gray-300">
                F-Chat Username
              </label>
              <input
                id="fchatUsername"
                name="fchatUsername"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Your F-Chat username"
                value={credentials.fchatUsername}
                onChange={handleInputChange('fchatUsername')}
              />
            </div>
            <div>
              <label htmlFor="fchatPassword" className="block text-sm font-medium text-gray-300">
                F-Chat Password
              </label>
              <input
                id="fchatPassword"
                name="fchatPassword"
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Your F-Chat password"
                value={credentials.fchatPassword}
                onChange={handleInputChange('fchatPassword')}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-300 px-4 py-3 rounded relative">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900"
            >
              {isLoading ? 'Saving...' : 'Save F-Chat Credentials'}
            </button>
            
            <button
              type="button"
              onClick={handleSkip}
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-gray-600 text-sm font-medium rounded-md text-gray-300 bg-transparent hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900"
            >
              Skip for now
            </button>
          </div>
          
          <div className="bg-yellow-900/20 border border-yellow-500 rounded-md p-3">
            <div className="text-xs text-yellow-300">
              <p className="font-medium">ℹ️ Note</p>
              <p>You can add F-Chat credentials later from your account settings if you skip this step.</p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
