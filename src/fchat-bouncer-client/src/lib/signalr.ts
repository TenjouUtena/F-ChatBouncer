import * as signalR from '@microsoft/signalr';
import { Message, ConnectionStatus } from '@/types';
import { api } from '@/lib/api';
import { config } from '@/lib/config';

class SignalRService {
  public connection: signalR.HubConnection | null = null;
  private currentToken: string | null = null;
  private storedCredentials: { username: string; password: string; fchatUsername?: string; fchatPassword?: string } | null = null;
  private isConnecting: boolean = false;
  private eventListenersSetup: boolean = false;
  private onProfileAvailable: ((data: { characterName: string; timestamp: string }) => void) | null = null;

  async connect(token: string, credentials?: { username: string; password: string; fchatUsername?: string; fchatPassword?: string }): Promise<void> {
    // Prevent multiple simultaneous connections
    if (this.isConnecting) {
      console.log('Connection already in progress, skipping...');
      return;
    }

    // If already connected with the same token, don't reconnect
    if (this.isConnected && this.currentToken === token) {
      console.log('Already connected with same token, skipping reconnection');
      return;
    }

    this.isConnecting = true;

    try {
      // Disconnect existing connection if any
      if (this.connection) {
        console.log('Disconnecting existing connection...');
        await this.disconnect();
      }

      this.currentToken = token;

      // Store credentials for potential re-auth
      if (credentials) {
        this.storedCredentials = credentials;
      }

      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(config.signalRUrl, {
          accessTokenFactory: () => this.currentToken!,
        })
        .withAutomaticReconnect()
        .build();

      // Set up event handlers only once
      this.setupEventHandlers();

      await this.connection.start();
    } catch (err) {
      console.error('SignalR Connection Error:', err);

      // Check if it's a 401 error and try to re-authenticate
      if (this.is401Error(err) && this.storedCredentials) {
        console.log('401 error detected, attempting re-authentication...');
        try {
          await this.attemptReauth();
          // Retry connection with new token
          if (this.connection) {
            await this.connection.start();
          }
        } catch (reauthErr) {
          console.error('Re-authentication failed:', reauthErr);
          throw reauthErr;
        }
      } else {
        throw err;
      }
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        // Clean up all event listeners
        this.cleanupAllListeners();
        await this.connection.stop();
      } catch (error) {
        console.error('Error stopping SignalR connection:', error);
      }
      this.connection = null;
    }

    // Reset state
    this.isConnecting = false;
    this.eventListenersSetup = false;
    this.callbacks.clear();
    this.currentToken = null;
    this.storedCredentials = null;
  }

  private cleanupAllListeners(): void {
    if (!this.connection) return;


    // Clean up custom listeners
    this.callbacks.forEach((callbacks, eventName) => {
      callbacks.forEach(callback => {
        this.connection!.off(eventName, callback as any);
      });
    });

    // Clean up built-in listeners
    this.connection.off('ReceiveMessage');
    this.connection.off('ReceiveHistory');
    this.connection.off('ReceiveRecentMessages');
    this.connection.off('NotifyConnectionStatus');
    this.connection.off('ReceiveCharacters');
    this.connection.off('CharacterSelected');
    this.connection.off('CharacterRestored');
    this.connection.off('CharacterError');
    this.connection.off('BouncerReconnected');
    this.connection.off('ReceiveChannelList');
    this.connection.off('ChannelListError');
    this.connection.off('MessageQueued');
    this.connection.off('StatusUpdated');
    this.connection.off('UserOnline');
    this.connection.off('UserOffline');
    this.connection.off('QueuedMessagesProcessed');
    this.connection.off('ProfileRequested');
    this.connection.off('ProfileError');
    this.connection.off('ProfileReceived');
    this.connection.off('ProfileAvailable');
    // Multi-character event listeners
    this.connection.off('CharacterConnected');
    this.connection.off('CharacterDisconnected');
    this.connection.off('ActiveCharacterSwitched');
    this.connection.off('ReceiveActiveCharacters');
    this.connection.off('ChannelJoined');
    this.connection.off('ChannelLeft');
    this.connection.off('MessageSent');
    this.connection.off('MessageError');
    this.connection.off('ChannelError');
    this.connection.off('StatusUpdated');
    this.connection.off('UserOnline');
    this.connection.off('UserOffline');
  }

  private is401Error(error: any): boolean {
    // Check various ways 401 might be reported
    return (
      error?.status === 401 ||
      error?.statusCode === 401 ||
      error?.response?.status === 401 ||
      (typeof error === 'string' && error.includes('401')) ||
      (error?.message && error.message.includes('401')) ||
      (error?.message && error.message.includes('Unauthorized'))
    );
  }

  private async attemptReauth(): Promise<void> {
    if (!this.storedCredentials) {
      throw new Error('No stored credentials for re-authentication');
    }

    console.log('Attempting to re-authenticate with stored credentials...');

    try {
      // Try to login again with stored credentials
      const loginResponse = await api.login(this.storedCredentials);
      this.currentToken = loginResponse.token;

      // Update global auth store with fresh token so REST calls stop 401'ing
      try {
        const { useAuthStore } = await import('@/stores/authStore');
        const setToken = useAuthStore.getState().setToken;
        if (setToken) setToken(this.currentToken);
      } catch (e) {
        console.warn('Failed to update auth token in store after reauth:', e);
      }

      // Clean up existing connection properly
      if (this.connection) {
        this.cleanupAllListeners();
        await this.connection.stop();
      }

      // Reset state before creating new connection
      this.eventListenersSetup = false;
      this.callbacks.clear();

      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(config.signalRUrl, {
          accessTokenFactory: () => this.currentToken!,
        })
        .withAutomaticReconnect()
        .build();

      this.setupEventHandlers();

      console.log('Re-authentication successful, token updated');

      // Emit token update event for the app to update its auth state
      this.onTokenUpdated?.(this.currentToken);
    } catch (error) {
      console.error('Re-authentication failed:', error);
      throw new Error('Failed to re-authenticate: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  // Callback for when token is updated during re-auth
  private onTokenUpdated?: (newToken: string) => void;

  public setTokenUpdateCallback(callback: (newToken: string) => void): void {
    this.onTokenUpdated = callback;
  }

  // Callbacks for FChat connection events
  private onFChatConnectionEstablished?: (characterName: string) => void;
  private onFChatConnectionFailed?: (error: string) => void;
  private onSearchResultsReceived?: (data: { Results: any[]; Timestamp: string }) => void;
  private onBookmarkAdded?: (data: { characterName: string }) => void;
  private onBookmarkRemoved?: (data: { characterName: string }) => void;
  private onFriendsListUpdated?: (data: { Friends: any[]; Timestamp: string }) => void;

  public setFChatConnectionCallbacks(
    onEstablished: (characterName: string) => void,
    onFailed: (error: string) => void
  ): void {
    this.onFChatConnectionEstablished = onEstablished;
    this.onFChatConnectionFailed = onFailed;
  }

  public setSearchResultsCallback(callback: (data: { Results: any[]; Timestamp: string }) => void): void {
this.onSearchResultsReceived = callback;
  }

  public setBookmarkCallbacks(
    onAdded: (data: { characterName: string }) => void,
    onRemoved: (data: { characterName: string }) => void
  ): void {
    this.onBookmarkAdded = onAdded;
    this.onBookmarkRemoved = onRemoved;
  }

  public setFriendsListUpdatedCallback(callback: (data: { Friends: any[]; Timestamp: string }) => void): void {
    this.onFriendsListUpdated = callback;
  }

  public onProfileAvailableNotification(callback: (data: { characterName: string; timestamp: string }) => void): void {
    this.onProfileAvailable = callback;
  }

  private setupEventHandlers(): void {
    if (!this.connection || this.eventListenersSetup) return;


    this.connection.on('ReceiveMessage', (message: Message) => {
      // This will be handled by the component that sets up the listener
      //console.log('Received message:', message);
    });

    this.connection.on('ReceiveHistory', (data: { channel: string; messages: Message[]; hasMore: boolean }) => {
      console.log('Received history:', data);
    });

    this.connection.on('ReceiveRecentMessages', (messages: Message[]) => {
      console.log('Received recent messages:', messages);
    });

    this.connection.on('NotifyConnectionStatus', (status: ConnectionStatus) => {
      console.log('Connection status update:', status);
    });

    this.connection.on('ReceiveCharacters', (characters: any[]) => {
      console.log('Received characters:', characters);
    });

    // Character events are handled by custom listeners set up via onCharacterSelected, onCharacterRestored, etc.

    this.connection.on('BouncerReconnected', (data: { Character: any; JoinedChannels: { Id: string; Name: string; Title: string; UserCount: number; Mode: string }[]; Message: string }) => {
      console.log('Bouncer reconnected:', data);
    });

    // Multi-character event handlers
    this.connection.on('CharacterConnected', (data: { CharacterName: string; Message: string }) => {
      console.log('Character connected:', data);
    });

    this.connection.on('CharacterDisconnected', (data: { CharacterName: string; Message: string }) => {
      console.log('Character disconnected:', data);
    });

    this.connection.on('ReceiveActiveCharacters', (data: { characters: any[]; activeCharacter: string }) => {
      console.log('Received active characters:', data);
    });

    this.connection.on('ChannelJoined', (data: { Channel: string; CharacterName: string; Message: string }) => {
      console.log('Channel joined:', data);
    });

    this.connection.on('ProfileAvailable', (data: { characterName: string; timestamp: string }) => {
      console.log('Profile available:', data);
      if (this.onProfileAvailable) {
        this.onProfileAvailable(data);
      }
    });

    this.connection.on('ChannelLeft', (data: { Channel: string; CharacterName: string; Message: string }) => {
      console.log('Channel left:', data);
    });

    this.connection.on('MessageSent', (data: { Channel: string; CharacterName: string; Content: string; Message: string }) => {
      console.log('Message sent:', data);
    });

    this.connection.on('MessageError', (error: string) => {
      console.log('Message error:', error);
    });

    this.connection.on('ChannelError', (error: string) => {
      console.log('Channel error:', error);
    });

    // Friends status event handlers
    this.connection.on('StatusUpdated', (data: { characterName: string; status: string; statusMessage: string; timestamp: string; viaCharacter: string }) => {
      //console.log('Status updated:', data);
    });

    this.connection.on('UserOnline', (data: { characterName: string; status: string; gender: string; timestamp: string; isOnline: boolean }) => {
      //console.log('User came online:', data);
    });

    this.connection.on('UserOffline', (data: { characterName: string; timestamp: string; isOnline: boolean }) => {
      //console.log('User went offline:', data);
    });

    // ReceiveTypingNotification is handled by custom listeners via onReceiveTypingNotification

    this.connection.on('FriendsListUpdated', (data: { Friends: any[]; Timestamp: string }) => {
      console.log('Friends list updated:', data);
      if (this.onFriendsListUpdated) {
        this.onFriendsListUpdated(data);
      }
    });

    // Secure credential request handlers
    this.connection.on('RequestFChatCredentials', async (request: { requestId: string; characterName: string; message: string; expiresAt: string }) => {
      try {
        // Import credentials store
        const { useCredentialsStore } = await import('@/stores/credentialsStore');
        const credentialsStore = useCredentialsStore.getState();
        
        // Check if we have stored credentials
        const storedCredentials = await credentialsStore.retrieveCredentials();
        
        if (storedCredentials?.fchatUsername && storedCredentials?.fchatPassword) {
          // Encrypt and send credentials
          const encryptedCredentials = await this.encryptCredentials({
            username: storedCredentials.fchatUsername,
            password: storedCredentials.fchatPassword
          });
          await this.connection?.invoke("ProvideFChatCredentials", request.requestId, encryptedCredentials);
        } else {
          // Show credential dialog
          this.showCredentialDialog(request);
        }
      } catch (error) {
        console.error('Failed to handle credential request:', error);
        this.showCredentialDialog(request);
      }
    });
    
    this.connection.on('CredentialRequestExpired', () => {
      console.log('Credential request expired');
      // Hide any open credential dialog
      this.hideCredentialDialog();
    });
    
    this.connection.on('FChatConnectionEstablished', (characterName: string) => {
      console.log('FChat connection established for:', characterName);
      // Emit event for UI to update
      this.onFChatConnectionEstablished?.(characterName);
    });
    
    this.connection.on('FChatConnectionFailed', (error: string) => {
      console.log('FChat connection failed:', error);
      // Emit event for UI to show error
      this.onFChatConnectionFailed?.(error);
    });

    this.connection.on('SearchResultsReceived', (data: { Results: any[]; Timestamp: string }) => {
      console.log('Search results received:', data);
      // Emit event for UI to handle search results
      this.onSearchResultsReceived?.(data);
    });

    this.connection.on('BookmarkAdded', (data: { characterName: string }) => {
      console.log('Bookmark added:', data);
      this.onBookmarkAdded?.(data);
    });

    this.connection.on('BookmarkRemoved', (data: { characterName: string }) => {
      console.log('Bookmark removed:', data);
      this.onBookmarkRemoved?.(data);
    });

    this.eventListenersSetup = true;
  }

  // Store callbacks to prevent duplicates
  private callbacks = new Map<string, Function[]>();

  // Method to add custom listeners with deduplication
  onReceiveMessage(callback: (message: Message) => void): void {
    this.addUniqueListener('ReceiveMessage', callback);
  }

  onReceiveHistory(callback: (data: { channel: string; messages: Message[]; hasMore: boolean }) => void): void {
    this.addUniqueListener('ReceiveHistory', callback);
  }

  onReceiveRecentMessages(callback: (messages: Message[]) => void): void {
    this.addUniqueListener('ReceiveRecentMessages', callback);
  }

  onConnectionStatusUpdate(callback: (status: ConnectionStatus) => void): void {
    this.addUniqueListener('NotifyConnectionStatus', callback);
  }

  onReceiveCharacters(callback: (characters: any[]) => void): void {
    this.addUniqueListener('ReceiveCharacters', callback);
  }

  onCharacterSelected(callback: (data: { CharacterName: string }) => void): void {
    this.addUniqueListener('CharacterSelected', callback);
  }

  onCharacterRestored(callback: (data: { CharacterName: string }) => void): void {
    console.log('=== SignalR Service: Setting up CharacterRestored listener ===');
    this.addUniqueListener('CharacterRestored', (data: { CharacterName: string }) => {
      console.log('=== SignalR Service: CharacterRestored event received ===');
      console.log('Event data:', data);
      callback(data);
    });
    console.log('CharacterRestored listener set up');
  }

  onCharacterError(callback: (data: { errorType: string; characterName?: string; message: string; originalError: string; timestamp: string }) => void): void {
    this.addUniqueListener('CharacterError', callback);
  }

  onReceiveChannelList(callback: (channels: any[]) => void): void {
    this.addUniqueListener('ReceiveChannelList', callback);
  }

  onChannelListError(callback: (error: string) => void): void {
    this.addUniqueListener('ChannelListError', callback);
  }

  onReceiveTypingNotification(callback: (data: { FromCharacter?: string; ReceivingCharacter?: string; Status?: string; Timestamp?: string; characterName?: string; fromCharacter?: string; receivingCharacter?: string; status?: string; timestamp?: string }) => void): void {
    this.addUniqueListener('ReceiveTypingNotification', callback);
  }

  onBouncerReconnected(callback: (data: { Character: any; JoinedChannels: { Id: string; Name: string; Title: string; UserCount: number; Mode: string }[]; Message: string }) => void): void {
    this.addUniqueListener('BouncerReconnected', callback);
  }

  onMessageQueued(callback: (data: { Channel: string; Content: string; QueuedAt: string; Message: string }) => void): void {
    this.addUniqueListener('MessageQueued', callback);
  }

  onQueuedMessagesProcessed(callback: (data: { ProcessedCount: number; Message: string }) => void): void {
    this.addUniqueListener('QueuedMessagesProcessed', callback);
  }

  onProfileRequested(callback: (data: { CharacterName: string; Message: string }) => void): void {
    this.addUniqueListener('ProfileRequested', callback);
  }

  onProfileError(callback: (error: string) => void): void {
    this.addUniqueListener('ProfileError', callback);
  }

  onProfileReceived(callback: (data: { CharacterName: string; ProfileData: string; Message: string }) => void): void {
    this.addUniqueListener('ProfileReceived', callback);
  }

  // Multi-character event listeners
  onCharacterConnected(callback: (data: { CharacterName: string; Message: string }) => void): void {
    this.addUniqueListener('CharacterConnected', callback);
  }

  onCharacterDisconnected(callback: (data: { CharacterName: string; Message: string }) => void): void {
    this.addUniqueListener('CharacterDisconnected', callback);
  }

  onActiveCharacterSwitched(callback: (data: { CharacterName?: string; characterName?: string; Message: string }) => void): void {
    console.log('=== SignalR Service: Setting up ActiveCharacterSwitched listener ===');
    console.log('Current connection state:', this.connection?.state);
    console.log('Current connection ID:', this.connection?.connectionId);
    this.addUniqueListener('ActiveCharacterSwitched', (data: { CharacterName?: string; characterName?: string; Message: string }) => {
      console.log('=== SignalR Service: ActiveCharacterSwitched event received ===');
      console.log('Event data:', data);
      callback(data);
    });
    console.log('ActiveCharacterSwitched listener set up');
  }

  onReceiveActiveCharacters(callback: (data: { characters: any[]; activeCharacter: string }) => void): void {
    this.addUniqueListener('ReceiveActiveCharacters', callback);
  }

  onChannelJoined(callback: (data: { Channel: string; CharacterName: string; Message: string }) => void): void {
    this.addUniqueListener('ChannelJoined', callback);
  }

  onChannelLeft(callback: (data: { Channel: string; CharacterName: string; Message: string }) => void): void {
    this.addUniqueListener('ChannelLeft', callback);
  }

  onMessageSent(callback: (data: { Channel: string; CharacterName: string; Content: string; Message: string }) => void): void {
    this.addUniqueListener('MessageSent', callback);
  }

  // Channel character list event listeners
  onCharacterJoinedChannel(callback: (data: { channelId: string; characterName: string; joinedAt: string; status: string }) => void): void {
    this.addUniqueListener('CharacterJoinedChannel', callback);
  }

  onCharacterLeftChannel(callback: (data: { channelId: string; characterName: string; leftAt: string }) => void): void {
    this.addUniqueListener('CharacterLeftChannel', callback);
  }

  onReceiveChannelCharacters(callback: (data: { channelId: string; characters: any[]; requestingCharacter: string }) => void): void {
    this.addUniqueListener('ReceiveChannelCharacters', callback);
  }

  onChannelCharactersRefreshed(callback: (data: { channelId: string; message: string; requestingCharacter: string }) => void): void {
    this.addUniqueListener('ChannelCharactersRefreshed', callback);
  }

  onChannelCharacterError(callback: (error: string) => void): void {
    this.addUniqueListener('ChannelCharacterError', callback);
  }

  onChannelsSubscribed(callback: (channels: string[]) => void): void {
    this.addUniqueListener('ChannelsSubscribed', callback);
  }

  onMessageError(callback: (error: string) => void): void {
    this.addUniqueListener('MessageError', callback);
  }

  onChannelError(callback: (error: string) => void): void {
    this.addUniqueListener('ChannelError', callback);
  }

  // Friends status event listeners
  onStatusUpdated(callback: (data: { characterName: string; status: string; statusMessage: string; timestamp: string; viaCharacter: string }) => void): void {
    this.addUniqueListener('StatusUpdated', callback);
  }

  onUserOnline(callback: (data: { characterName: string; status: string; gender: string; timestamp: string; isOnline: boolean }) => void): void {
    this.addUniqueListener('UserOnline', callback);
  }

  onUserOffline(callback: (data: { characterName: string; timestamp: string; isOnline: boolean }) => void): void {
    this.addUniqueListener('UserOffline', callback);
  }


  private addUniqueListener(eventName: string, callback: Function): void {
    if (!this.connection) return;

    // Remove existing listener first to prevent duplicates
    if (this.callbacks.has(eventName)) {
      const existingCallbacks = this.callbacks.get(eventName)!;
      existingCallbacks.forEach(cb => {
        this.connection!.off(eventName, cb as any);
      });
    }

    // Add new listener
    this.connection.on(eventName, callback as any);

    // Store the callback for future cleanup
    this.callbacks.set(eventName, [callback]);
  }

  offCharacterListeners(): void {
    // Remove specific character-related listeners
    this.removeListener('ReceiveCharacters');
    this.removeListener('CharacterSelected');
    this.removeListener('CharacterError');
  }

  removeListener(eventName: string): void {
    if (!this.connection) return;

    if (this.callbacks.has(eventName)) {
      const callbacks = this.callbacks.get(eventName)!;
      callbacks.forEach(callback => {
        this.connection!.off(eventName, callback as any);
      });
      this.callbacks.delete(eventName);
    }
  }

  // Methods to send messages to server
  async subscribeToChannels(channels: string[], characterName?: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      if (characterName) {
        // Use character-specific channel joining
        for (const channel of channels) {
          await this.connection.invoke('JoinChannelForCharacter', characterName, channel);
        }
      } else {
        // Fallback to the old method for backward compatibility
        await this.connection.invoke('SubscribeToChannels', channels);
      }
    }
  }

  async sendMessage(channel: string, content: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('SendMessage', channel, content);
    }
  }

  async requestHistory(channel: string, since: Date, limit: number = 100): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      console.log('SignalR: Requesting history for channel:', channel, 'since:', since, 'limit:', limit);
      await this.connection.invoke('RequestHistory', channel, since.toISOString(), limit);
    } else {
      throw new Error('SignalR connection not available for history request');
    }
  }

  async requestFullSessionRestore(): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('RequestFullSessionRestore');
    }
  }

  async clearAllHistory(): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('ClearAllHistory');
    }
  }

  async requestProfile(characterName: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('RequestProfile', characterName);
    }
  }

  async getBasicInfo(characterName: string): Promise<any> {
    if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error('SignalR connection not available');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('ReceiveBasicInfo');
        this.removeListener('BasicInfoError');
        reject(new Error('GetBasicInfo request timed out'));
      }, 10000); // 10 second timeout

      const handleBasicInfo = (data: any) => {
        clearTimeout(timeout);
        this.removeListener('ReceiveBasicInfo');
        this.removeListener('BasicInfoError');
        resolve(data);
      };

      const handleError = (error: string) => {
        clearTimeout(timeout);
        this.removeListener('ReceiveBasicInfo');
        this.removeListener('BasicInfoError');
        reject(new Error(error));
      };

      this.addUniqueListener('ReceiveBasicInfo', handleBasicInfo);
      this.addUniqueListener('BasicInfoError', handleError);
      this.connection!.invoke('GetBasicInfo', characterName).catch(reject);
    });
  }

  async getCharacters(): Promise<any[]> {
    if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error('SignalR connection not available');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('ReceiveCharacters');
        reject(new Error('Timeout waiting for characters'));
      }, 10000); // 10 second timeout

      const handleCharacters = (characters: any[]) => {
        clearTimeout(timeout);
        this.removeListener('ReceiveCharacters');
        resolve(characters);
      };

      this.addUniqueListener('ReceiveCharacters', handleCharacters);
      this.connection!.invoke('GetCharacters').catch(reject);
    });
  }

  async selectCharacter(characterName: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('SelectCharacter', characterName);
    }
  }

  async setSelectedCharacter(characterName: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('SetSelectedCharacter', characterName);
    }
  }

  async setActiveCharacter(characterName: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('SetActiveCharacter', characterName);
    }
  }

  async getChannelList(): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('GetChannelList');
    }
  }

  // Multi-character management methods
  async connectCharacter(characterName: string, fchatUsername: string, fchatPassword: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('ConnectCharacter', characterName, fchatUsername, fchatPassword);
    }
  }

  async disconnectCharacter(characterName: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('DisconnectCharacter', characterName);
    }
  }

  async switchActiveCharacter(characterName: string): Promise<void> {
    console.log('=== SignalR Service: switchActiveCharacter called ===');
    console.log('Character name:', characterName);
    console.log('Connection state:', this.connection?.state);
    console.log('Connection ID:', this.connection?.connectionId);
    
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      console.log('Calling hub method SwitchActiveCharacter...');
      await this.connection.invoke('SwitchActiveCharacter', characterName);
      console.log('Hub method SwitchActiveCharacter completed');
    } else {
      console.error('SignalR connection not available for switchActiveCharacter');
    }
  }

  async getActiveCharacters(): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('GetActiveCharacters');
    }
  }

  async getCharactersForCharacter(characterName: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('GetCharactersForCharacter', characterName);
    }
  }

  async joinChannelForCharacter(characterName: string, channel: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('JoinChannelForCharacter', characterName, channel);
    }
  }

  async leaveChannelForCharacter(characterName: string, channel: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('LeaveChannelForCharacter', characterName, channel);
    }
  }

  async sendMessageFromCharacter(characterName: string, channel: string, content: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('SendMessageFromCharacter', characterName, channel, content);
    }
  }

  async requestProfileFromCharacter(characterName: string, requestingCharacter: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('RequestProfileFromCharacter', characterName, requestingCharacter);
    }
  }

  async getChannelCharacters(channelId: string, characterName?: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('GetChannelCharacters', channelId, characterName);
    }
  }

  async refreshChannelCharacters(channelId: string, characterName?: string): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('RefreshChannelCharacters', channelId, characterName);
    }
  }

  async sendTypingNotification(characterName: string, status: 'typing' | 'paused' | 'clear'): Promise<void> {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('SendTypingNotification', characterName, status);
    }
  }

  get connectionState(): signalR.HubConnectionState {
    return this.connection?.state ?? signalR.HubConnectionState.Disconnected;
  }

  get isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }

  get currentAuthToken(): string | null {
    return this.currentToken;
  }

  public storeCredentials(credentials: { username: string; password: string; fchatUsername?: string; fchatPassword?: string }): void {
    this.storedCredentials = credentials;
  }

  // Credential encryption for secure transmission
  private async encryptCredentials(credentials: { username: string; password: string }): Promise<string> {
    try {
      // For now, use simple base64 encoding
      // In production, this should use proper encryption with server's public key
      // Map to uppercase property names to match backend FChatCredentials class
      const credentialData = {
        Username: credentials.username,
        Password: credentials.password
      };
      const credentialJson = JSON.stringify(credentialData);
      return btoa(credentialJson);
    } catch (error) {
      console.error('Failed to encrypt credentials:', error);
      throw new Error('Failed to encrypt credentials');
    }
  }

  // Credential dialog management
  private currentCredentialRequest: { requestId: string; characterName: string; message: string; expiresAt: string } | null = null;
  private credentialDialogCallback?: (credentials: { username: string; password: string }) => void;

  private showCredentialDialog(request: { requestId: string; characterName: string; message: string; expiresAt: string }): void {
    this.currentCredentialRequest = request;
    
    // Emit event for UI to show credential dialog
    const event = new CustomEvent('showCredentialDialog', {
      detail: {
        requestId: request.requestId,
        characterName: request.characterName,
        message: request.message,
        expiresAt: request.expiresAt,
        onSubmit: (credentials: { username: string; password: string }) => {
          this.handleCredentialSubmission(credentials);
        },
        onCancel: () => {
          this.hideCredentialDialog();
        }
      }
    });
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(event);
    }
  }

  private hideCredentialDialog(): void {
    this.currentCredentialRequest = null;
    this.credentialDialogCallback = undefined;
    
    // Emit event for UI to hide credential dialog
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('hideCredentialDialog');
      window.dispatchEvent(event);
    }
  }

  private async handleCredentialSubmission(credentials: { username: string; password: string }): Promise<void> {
    if (!this.currentCredentialRequest || !this.connection) {
      console.error('No active credential request or connection');
      return;
    }

    try {
      // Encrypt and send credentials
      const encryptedCredentials = await this.encryptCredentials(credentials);
      await this.connection.invoke("ProvideFChatCredentials", this.currentCredentialRequest.requestId, encryptedCredentials);
      
      this.hideCredentialDialog();
    } catch (error) {
      console.error('Failed to submit credentials:', error);
      // Show error to user
      this.onFChatConnectionFailed?.('Failed to submit credentials');
    }
  }
}

// Export a singleton instance
export const signalRService = new SignalRService();
export default signalRService;