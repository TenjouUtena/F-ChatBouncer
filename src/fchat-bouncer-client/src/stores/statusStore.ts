import { create } from 'zustand';
import { BackendStatus, FrontendServiceStatus, BackendStatusInfo, FrontendStatusInfo, DetailedStatus } from '@/types';
import { signalRService } from '@/lib/signalr';
import * as signalR from '@microsoft/signalr';

interface StatusState {
  backend: BackendStatusInfo;
  frontend: FrontendStatusInfo;
  isRefreshing: boolean;
  lastRefresh: Date | null;
}

interface StatusStore extends StatusState {
  // Backend status setters
  setBackendStatus: (status: Partial<BackendStatusInfo>) => void;
  updateBackendFromDto: (dto: any) => void;
  
  // Frontend status setters
  setSignalRStatus: (status: FrontendServiceStatus) => void;
  setIndexedDBStatus: (status: FrontendServiceStatus) => void;
  
  // Compute overall frontend status
  computeFrontendOverallStatus: () => 'ready' | 'loading' | 'failed';
  
  // Manual refresh
  refreshStatus: () => Promise<void>;
  
  // Get detailed status
  getDetailedStatus: () => DetailedStatus;
  
  // Initialize status tracking
  initializeStatusTracking: () => void;
}

const getDefaultBackendStatus = (): BackendStatusInfo => ({
  status: 'not-connected',
  isConnectedToFChat: false,
  hasCredentials: false,
  timestamp: new Date().toISOString(),
});

const getDefaultFrontendStatus = (): FrontendStatusInfo => ({
  signalR: 'loading',
  indexedDB: 'loading',
  overallStatus: 'loading',
});

export const useStatusStore = create<StatusStore>((set, get) => ({
  backend: getDefaultBackendStatus(),
  frontend: getDefaultFrontendStatus(),
  isRefreshing: false,
  lastRefresh: null,

  setBackendStatus: (status) => {
    set((state) => ({
      backend: {
        ...state.backend,
        ...status,
        timestamp: new Date().toISOString(),
      },
    }));
  },

  updateBackendFromDto: (dto) => {
    // Convert backend DTO to frontend format
    const statusMap: Record<string, BackendStatus> = {
      'Connected': 'connected',
      'NotConnected': 'not-connected',
      'WaitingForCharacter': 'waiting-for-character',
      'NeedsCredentials': 'needs-credentials',
    };

    const backendStatus: BackendStatus = statusMap[dto.backendStatus] || 'not-connected';

    set((state) => ({
      backend: {
        status: backendStatus,
        characterName: dto.characterName,
        lastActivity: dto.lastActivity,
        isConnectedToFChat: dto.isConnectedToFChat || false,
        hasCredentials: dto.hasCredentials || false,
        statusMessage: dto.statusMessage,
        timestamp: dto.timestamp || new Date().toISOString(),
      },
    }));
  },

  setSignalRStatus: (status) => {
    set((state) => {
      const newFrontend = {
        ...state.frontend,
        signalR: status,
      };
      newFrontend.overallStatus = get().computeFrontendOverallStatus();
      return { frontend: newFrontend };
    });
  },

  setIndexedDBStatus: (status) => {
    set((state) => {
      const newFrontend = {
        ...state.frontend,
        indexedDB: status,
      };
      newFrontend.overallStatus = get().computeFrontendOverallStatus();
      return { frontend: newFrontend };
    });
  },

  computeFrontendOverallStatus: (): 'ready' | 'loading' | 'failed' => {
    const { frontend } = get();
    
    // If any service failed, overall is failed
    if (frontend.signalR === 'failed' || frontend.indexedDB === 'failed') {
      return 'failed';
    }
    
    // If any service is loading, overall is loading
    if (frontend.signalR === 'loading' || frontend.indexedDB === 'loading') {
      return 'loading';
    }
    
    // All services ready
    return 'ready';
  },

  refreshStatus: async () => {
    const { isRefreshing } = get();
    if (isRefreshing) {
      console.log('Status refresh already in progress');
      return;
    }

    set({ isRefreshing: true });

    try {
      if (signalRService.connection?.state === signalR.HubConnectionState.Connected) {
        // Request detailed status from backend
        const status = await signalRService.connection.invoke<any>('GetDetailedConnectionStatus');
        get().updateBackendFromDto(status);
        set({ lastRefresh: new Date() });
      } else {
        console.warn('Cannot refresh status: SignalR not connected');
      }
    } catch (error) {
      console.error('Failed to refresh status:', error);
    } finally {
      set({ isRefreshing: false });
    }
  },

  getDetailedStatus: () => {
    const { backend, frontend } = get();
    return {
      backend,
      frontend,
    };
  },

  initializeStatusTracking: () => {
    // Track SignalR connection state
    const updateSignalRStatus = () => {
      const state = signalRService.connection?.state;
      
      if (state === signalR.HubConnectionState.Connected) {
        get().setSignalRStatus('ready');
      } else if (state === signalR.HubConnectionState.Connecting || state === signalR.HubConnectionState.Reconnecting) {
        get().setSignalRStatus('loading');
      } else {
        get().setSignalRStatus('failed');
      }
    };

    // Initial update
    updateSignalRStatus();

    // Set up SignalR connection state tracking
    if (signalRService.connection) {
      signalRService.connection.onreconnecting(() => {
        get().setSignalRStatus('loading');
      });

      signalRService.connection.onreconnected(() => {
        get().setSignalRStatus('ready');
        // Refresh backend status after reconnection
        get().refreshStatus();
      });

      signalRService.connection.onclose(() => {
        get().setSignalRStatus('failed');
        get().setBackendStatus({ status: 'not-connected', isConnectedToFChat: false });
      });
    }

    // Listen for detailed status updates from backend
    signalRService.on('DetailedStatusUpdate', (dto: any) => {
      console.log('Received DetailedStatusUpdate:', dto);
      get().updateBackendFromDto(dto);
    });

    // Update SignalR status periodically
    const intervalId = setInterval(updateSignalRStatus, 5000);

    // Return cleanup function
    return () => {
      clearInterval(intervalId);
      signalRService.removeListener('DetailedStatusUpdate');
    };
  },
}));


