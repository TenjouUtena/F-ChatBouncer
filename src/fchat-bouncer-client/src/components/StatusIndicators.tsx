'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useStatusStore } from '@/stores/statusStore';
import { useChatStore } from '@/stores/chatStore';
import { BackendStatus, FrontendServiceStatus } from '@/types';

interface StatusPillProps {
  status: BackendStatus | 'ready' | 'loading' | 'failed';
  label: string;
  onClick?: () => void;
}

function StatusPill({ status, label, onClick }: StatusPillProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
      case 'ready':
        return 'bg-green-500';
      case 'waiting-for-character':
      case 'loading':
        return 'bg-yellow-500';
      case 'needs-credentials':
        return 'bg-orange-500';
      case 'not-connected':
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'not-connected':
        return 'Not Connected';
      case 'waiting-for-character':
        return 'Waiting';
      case 'needs-credentials':
        return 'Needs Credentials';
      case 'ready':
        return 'Ready';
      case 'loading':
        return 'Loading';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div
      className={`group relative inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-white transition-all ${
        onClick ? 'cursor-pointer hover:opacity-80' : ''
      }`}
      onClick={onClick}
    >
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
      <span className="text-gray-200">{label}: {getStatusText()}</span>
    </div>
  );
}

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
}

function Tooltip({ children, content }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 w-64">
          <div className="bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 border border-gray-700">
            {content}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-8 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BackendStatusTooltipContentProps {
  status: BackendStatus;
  characterName?: string;
  lastActivity?: string;
  statusMessage?: string;
  isConnectedToFChat: boolean;
  hasCredentials: boolean;
}

function BackendStatusTooltipContent({
  status,
  characterName,
  lastActivity,
  statusMessage,
  isConnectedToFChat,
  hasCredentials,
}: BackendStatusTooltipContentProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="space-y-2">
      <div className="font-semibold border-b border-gray-600 pb-1">Backend Status</div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-400">Status:</span>
          <span className="font-medium">{status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
        </div>
        
        {characterName && (
          <div className="flex justify-between">
            <span className="text-gray-400">Character:</span>
            <span className="font-medium">{characterName}</span>
          </div>
        )}
        
        <div className="flex justify-between">
          <span className="text-gray-400">F-Chat Connection:</span>
          <span className={`font-medium ${isConnectedToFChat ? 'text-green-400' : 'text-red-400'}`}>
            {isConnectedToFChat ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-400">Credentials:</span>
          <span className={`font-medium ${hasCredentials ? 'text-green-400' : 'text-orange-400'}`}>
            {hasCredentials ? 'Configured' : 'Not Configured'}
          </span>
        </div>
        
        {lastActivity && (
          <div className="flex justify-between">
            <span className="text-gray-400">Last Activity:</span>
            <span className="font-medium text-xs">{formatDate(lastActivity)}</span>
          </div>
        )}
        
        {statusMessage && (
          <div className="mt-2 pt-2 border-t border-gray-600">
            <span className="text-gray-400 text-xs">{statusMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface FrontendStatusTooltipContentProps {
  signalR: FrontendServiceStatus;
  indexedDB: FrontendServiceStatus;
}

function FrontendStatusTooltipContent({ signalR, indexedDB }: FrontendStatusTooltipContentProps) {
  const getServiceStatusText = (status: FrontendServiceStatus) => {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'loading':
        return 'Loading';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const getServiceStatusColor = (status: FrontendServiceStatus) => {
    switch (status) {
      case 'ready':
        return 'text-green-400';
      case 'loading':
        return 'text-yellow-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-2">
      <div className="font-semibold border-b border-gray-600 pb-1">Frontend Status</div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-400">SignalR:</span>
          <span className={`font-medium ${getServiceStatusColor(signalR)}`}>
            {getServiceStatusText(signalR)}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-400">IndexedDB:</span>
          <span className={`font-medium ${getServiceStatusColor(indexedDB)}`}>
            {getServiceStatusText(indexedDB)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function StatusIndicators() {
  const { backend, frontend, refreshStatus, isRefreshing, initializeStatusTracking, setIndexedDBStatus } = useStatusStore();
  const { indexedDBReady, indexedDBFailed } = useChatStore();

  // Initialize status tracking on mount
  useEffect(() => {
    const cleanup = initializeStatusTracking();
    return cleanup;
  }, [initializeStatusTracking]);

  // Track IndexedDB status from chat store
  useEffect(() => {
    if (indexedDBReady) {
      setIndexedDBStatus('ready');
    } else if (indexedDBFailed) {
      setIndexedDBStatus('failed');
    } else {
      setIndexedDBStatus('loading');
    }
  }, [indexedDBReady, indexedDBFailed, setIndexedDBStatus]);

  const handleRefresh = async () => {
    if (!isRefreshing) {
      await refreshStatus();
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Backend Status Pill */}
      <Tooltip
        content={
          <BackendStatusTooltipContent
            status={backend.status}
            characterName={backend.characterName}
            lastActivity={backend.lastActivity}
            statusMessage={backend.statusMessage}
            isConnectedToFChat={backend.isConnectedToFChat}
            hasCredentials={backend.hasCredentials}
          />
        }
      >
        <StatusPill status={backend.status} label="Backend" />
      </Tooltip>

      {/* Frontend Status Pill */}
      <Tooltip
        content={
          <FrontendStatusTooltipContent
            signalR={frontend.signalR}
            indexedDB={frontend.indexedDB}
          />
        }
      >
        <StatusPill status={frontend.overallStatus} label="Frontend" />
      </Tooltip>

      {/* Refresh Button */}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className={`p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-all ${
          isRefreshing ? 'animate-spin' : ''
        }`}
        title="Refresh status"
      >
        <RefreshCw size={16} />
      </button>
    </div>
  );
}


