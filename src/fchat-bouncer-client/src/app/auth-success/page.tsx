'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

function AuthSuccessContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleAuthSuccess = async () => {
      try {
        const token = searchParams.get('token');
        const refreshToken = searchParams.get('refreshToken');

        if (!token || !refreshToken) {
          throw new Error('Missing authentication data');
        }

        // Sign in through the same store the password login uses, so the main page sees it
        const user = await api.getMe(token);
        useAuthStore.getState().login(user, token, refreshToken);

        // replace() keeps the token-bearing URL out of browser history
        router.replace(user.hasFChatCredentials ? '/' : '/fchat-setup');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setIsLoading(false);
        
        // Redirect to login after a delay
        setTimeout(() => {
          router.push('/');
        }, 3000);
      }
    };

    handleAuthSuccess();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.349 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Authentication Error</h1>
          <p className="text-gray-300 mb-4">{error}</p>
          <p className="text-sm text-gray-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="mb-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Authentication Successful</h1>
        <p className="text-gray-300">Setting up your account...</p>
      </div>
    </div>
  );
}

export default function AuthSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Loading...</h1>
          <p className="text-gray-300">Processing authentication...</p>
        </div>
      </div>
    }>
      <AuthSuccessContent />
    </Suspense>
  );
}
