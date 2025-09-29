'use client';

import React from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ConnectionStatusIndicatorProps {
  isConnected: boolean;
  isConnecting?: boolean;
  className?: string;
}

export default function ConnectionStatusIndicator({ 
  isConnected, 
  isConnecting = false, 
  className = '' 
}: ConnectionStatusIndicatorProps) {
  if (isConnecting) {
    return (
      <div className={`flex items-center ${className}`}>
        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className={`flex items-center ${className}`}>
        <CheckCircleIcon className="w-3 h-3 text-green-500" />
      </div>
    );
  }

  return (
    <div className={`flex items-center ${className}`}>
      <ExclamationTriangleIcon className="w-3 h-3 text-red-500" />
    </div>
  );
}
