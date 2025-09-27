'use client';

import { useState, useEffect } from 'react';
import { LoginCredentials, AuthMethod, FChatCredentialsRequest } from '@/types';
import { api } from '@/lib/api';

interface AuthFlowProps {
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  onGoogleLogin: () => void;
  onFChatCredentialsUpdate: (credentials: FChatCredentialsRequest) => Promise<void>;
}

const AUTH_METHODS: AuthMethod[] = [
  {
    type: 'google',
    label: 'Continue with Google',
    description: 'Sign in using your Google account'
  },
  {
    type: 'local',
    label: 'Local Account',
    description: 'Sign in with username and password'
  }
];

export default function AuthFlow({ onLogin, onGoogleLogin, onFChatCredentialsUpdate }: AuthFlowProps) {
  const [step, setStep] = useState<'method-selection' | 'local-auth' | 'fchat-credentials'>('method-selection');
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod['type'] | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsFChatCredentials, setNeedsFChatCredentials] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Local auth form state
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: '',
    fchatUsername: '',
    fchatPassword: '',
  });

  // F-Chat credentials form state
  const [fchatCredentials, setFChatCredentials] = useState<FChatCredentialsRequest>({
    fchatUsername: '',
    fchatPassword: '',
  });

  // Check for auth success from Google OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const refreshToken = urlParams.get('refreshToken');
    const userId = urlParams.get('userId');
    const hasFChatCredentials = urlParams.get('hasFChatCredentials') === 'true';

    if (token && refreshToken && userId) {
      // Store tokens and check if F-Chat credentials are needed
      if (!hasFChatCredentials) {
        setNeedsFChatCredentials(true);
        setStep('fchat-credentials');
        setUser({ id: userId });
      } else {
        // Complete login flow
        window.history.replaceState({}, '', window.location.pathname);
        // Redirect to main app
      }
    }

    const error = urlParams.get('error');
    const message = urlParams.get('message');
    if (error) {
      const errorMessage = message ? decodeURIComponent(message) : error.replace(/_/g, ' ');
      setError(`Authentication failed: ${errorMessage}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleMethodSelection = (method: AuthMethod['type']) => {
    setSelectedMethod(method);
    setError(null);
    
    if (method === 'google') {
      onGoogleLogin();
    } else if (method === 'local') {
      setStep('local-auth');
    }
  };

  const handleLocalAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isRegistering) {
        const response = await api.register(credentials);
        if (!response.user.hasFChatCredentials) {
          setNeedsFChatCredentials(true);
          setStep('fchat-credentials');
          setUser(response.user);
          return;
        }
      } else {
        await onLogin(credentials);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFChatCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await onFChatCredentialsUpdate(fchatCredentials);
      // Complete the auth flow
      setStep('method-selection');
      setNeedsFChatCredentials(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update F-Chat credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof LoginCredentials) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const handleFChatInputChange = (field: keyof FChatCredentialsRequest) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFChatCredentials(prev => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  if (step === 'fchat-credentials') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <div className="flex justify-center mb-4">
              <img src="/logo.svg" alt="F-Chat Bouncer" className="h-16 w-16" />
            </div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
              F-Chat Credentials Required
            </h2>
            <p className="mt-2 text-center text-sm text-gray-300">
              Enter your F-Chat credentials to complete setup
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleFChatCredentialsSubmit}>
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
                  value={fchatCredentials.fchatUsername}
                  onChange={handleFChatInputChange('fchatUsername')}
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
                  value={fchatCredentials.fchatPassword}
                  onChange={handleFChatInputChange('fchatPassword')}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-500 text-red-300 px-4 py-3 rounded relative">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900"
              >
                {isLoading ? 'Updating...' : 'Complete Setup'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'local-auth') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <button
              onClick={() => setStep('method-selection')}
              className="text-indigo-400 hover:text-indigo-300 mb-4 flex items-center"
            >
              ← Back to options
            </button>
            <div className="flex justify-center mb-4">
              <img src="/logo.svg" alt="F-Chat Bouncer" className="h-16 w-16" />
            </div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
              {isRegistering ? 'Create Account' : 'Sign In'}
            </h2>
            <p className="mt-2 text-center text-sm text-gray-300">
              {isRegistering ? 'Create a new local account' : 'Sign in to your local account'}
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleLocalAuth}>
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Your username"
                  value={credentials.username}
                  onChange={handleInputChange('username')}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Your password"
                  value={credentials.password}
                  onChange={handleInputChange('password')}
                />
              </div>
              
              {isRegistering && (
                <>
                  <div className="border-t border-gray-600 pt-4">
                    <h3 className="text-sm font-medium text-gray-300 mb-2">F-Chat Credentials (Optional)</h3>
                    <div className="space-y-2">
                      <input
                        id="fchatUsername"
                        name="fchatUsername"
                        type="text"
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                        placeholder="F-Chat username (can be added later)"
                        value={credentials.fchatUsername || ''}
                        onChange={handleInputChange('fchatUsername')}
                      />
                      <input
                        id="fchatPassword"
                        name="fchatPassword"
                        type="password"
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                        placeholder="F-Chat password (can be added later)"
                        value={credentials.fchatPassword || ''}
                        onChange={handleInputChange('fchatPassword')}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-500 text-red-300 px-4 py-3 rounded relative">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900"
              >
                {isLoading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Sign In')}
              </button>
            </div>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-indigo-400 hover:text-indigo-300"
              >
                {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="F-Chat Bouncer" className="h-16 w-16" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            F-Chat Bouncer
          </h2>
          <p className="mt-2 text-center text-sm text-gray-300">
            Choose how you want to sign in
          </p>
        </div>
        
        <div className="space-y-4">
          {AUTH_METHODS.map((method) => (
            <button
              key={method.type}
              onClick={() => handleMethodSelection(method.type)}
              disabled={isLoading}
              className="group relative w-full flex flex-col items-center justify-center py-4 px-6 border border-gray-600 rounded-lg text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-gray-900 transition-colors"
            >
              <div className="flex items-center justify-center space-x-3 mb-1">
                {method.type === 'google' ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                <span className="text-lg font-medium">{method.label}</span>
              </div>
              <span className="text-sm text-gray-400">{method.description}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500 text-red-300 px-4 py-3 rounded relative">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
