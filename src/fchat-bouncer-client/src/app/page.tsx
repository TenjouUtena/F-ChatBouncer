'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useCredentialsStore } from '@/stores/credentialsStore';
import { useFriendsStore } from '@/stores/friendsStore';
import AuthFlow from '@/components/AuthFlow';
import CharacterSelection from '@/components/CharacterSelection';
import ChannelSelection from '@/components/ChannelSelection';
import ChatInterface from '@/components/ChatInterface';
import CharacterSwitcher from '@/components/CharacterSwitcher';
import CharacterManagement from '@/components/CharacterManagement';
import FriendsList from '@/components/FriendsList';
import { signalRService } from '@/lib/signalr';
import { api, ApiError } from '@/lib/api';
import { LoginCredentials, Character, FChatCredentialsRequest } from '@/types';
import { preventUrlExposure, clearSensitiveMemory } from '@/lib/security';
import { consoleUtils } from '@/components/Console';

export default function Home() {
  const {
    isAuthenticated,
    login,
    token,
    areChannelsSelected,
    setAvailableCharacters,
    setChannelsSelected,
    setToken
  } = useAuthStore();
  const { setConnected, setSelectedChannels, setJoinedChannels, mergeHistoryMessages, getLastMessageTime } = useChatStore();
  const { activeCharacter, setActiveCharacter, addConnection, clearActiveCharacter } = useCharacterStore();
  const { initialize, hasStoredCredentials, retrieveCredentials } = useCredentialsStore();
  const { updateFriendStatus, setFriendOnline, isFriendOrBookmark, addBookmark, removeBookmark } = useFriendsStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoLogging, setIsAutoLogging] = useState(false);
  const [isCharacterRestoring, setIsCharacterRestoring] = useState(!!activeCharacter);
  const [lastCredentials, setLastCredentials] = useState<LoginCredentials | null>(null);
  const [showCharacterManagement, setShowCharacterManagement] = useState(false);
  const hasAttemptedAutoLoginRef = useRef(false);

  // Security: Prevent any sensitive data from being exposed in URLs
  useEffect(() => {
    preventUrlExposure();
  }, []);

  // Auto-login effect - check for stored credentials and auto-login
  useEffect(() => {
    const attemptAutoLogin = async () => {
      // Skip if already attempted, authenticated, or loading
      if (hasAttemptedAutoLoginRef.current || isAuthenticated || isLoading || isAutoLogging) {
        return;
      }

      hasAttemptedAutoLoginRef.current = true;

      try {
        setIsAutoLogging(true);
        await initialize();

        if (hasStoredCredentials) {
          console.log('Found stored credentials, attempting auto-login...');
          const savedCredentials = await retrieveCredentials();

          if (savedCredentials) {
            console.log('Auto-logging in with saved credentials...');
            await handleLogin(savedCredentials);
          }
        }
      } catch (error) {
        console.error('Auto-login failed:', error);
        // Don't show error to user, just fall through to manual login
      } finally {
        setIsAutoLogging(false);
      }
    };

    // Only trigger auto-login when not authenticated and not already attempted
    if (!isAuthenticated && !hasAttemptedAutoLoginRef.current) {
      attemptAutoLogin();
    }
  }, [isAuthenticated]); // Only depend on authentication status

  useEffect(() => {
    // Connect to SignalR after authentication, before character selection
    if (isAuthenticated && token) {
      connectToSignalR(token, lastCredentials);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    // Set up token expiration listener
    const handleTokenExpired = () => {
      console.log('Token expired, logging out user...');
      // The auth store will handle the logout automatically
      // We can show a notification to the user
      alert('Your session has expired. Please log in again.');
    };

    window.addEventListener('auth:token-expired', handleTokenExpired);

    // Set up character restoration listener
    signalRService.onCharacterRestored(async (data) => {
      console.log('Character restoration confirmed:', data.CharacterName);
      console.log('Token available for friends loading:', !!token);
      // Character is already selected in store, just update connection status
      
      // Load friends and bookmarks for the restored character
      try {
        console.log('Attempting to load friends and bookmarks...');
        const friendsResponse = await api.getFriends(token!);
        console.log('Friends API response:', friendsResponse);
        const { setFriendsAndBookmarks } = useAuthStore.getState();
        
            // Convert friends data to Friend objects
            const friends = friendsResponse.friends.map((friend: any) => ({
              name: friend.Name || friend.name,
              status: friend.Status || friend.status as any,
              statusMessage: friend.StatusMessage || friend.statusMessage,
              isOnline: friend.IsOnline || friend.isOnline,
              lastSeen: friend.LastSeen || friend.lastSeen,
              gender: friend.Gender || friend.gender
            }));
        
        await setFriendsAndBookmarks(friends, friendsResponse.bookmarks, friendsResponse.bookmarksWithStatus);
        console.log('Loaded friends and bookmarks for restored character:', friends.length, 'friends,', friendsResponse.bookmarks.length, 'bookmarks');
      } catch (error) {
        console.error('Failed to load friends and bookmarks for restored character:', error);
      }
    });

    signalRService.onCharacterError((error) => {
      console.error('Character restoration error:', error);
      // Could show user a notification about character restoration failure
    });

    // Set up token update callback for re-authentication
    signalRService.setTokenUpdateCallback((newToken: string) => {
      console.log('Token updated after re-authentication');
      setToken(newToken);
    });

    // Set up bouncer reconnection handler
    signalRService.onBouncerReconnected(async (data) => {
      console.log('Bouncer reconnected with state:', data);

      if (data.Character) {
        // Add character connection to character store
        addConnection({
          characterName: data.Character.Name,
          isConnected: true,
          isActive: true,
          status: 'connected',
          lastActivity: new Date().toISOString(),
          connectedAt: new Date().toISOString()
        });
        
        // Set as active character
        setActiveCharacter(data.Character.Name);

        // If user has joined channels, restore them in chat store
        if (data.JoinedChannels && data.JoinedChannels.length > 0) {
          // Extract channel names for the chat store
          const channelNames = data.JoinedChannels.map(channel => channel.Name);
          
          // Set both joined channels (what the character is actually in) and selected channels (what's open in UI)
          setJoinedChannels(channelNames, data.Character.Name);
          setSelectedChannels(channelNames, data.Character.Name);
          setChannelsSelected(true);

          // Request message history for each channel since last known message
          try {
            console.log('Requesting message history for restored channels...');

            for (const channel of channelNames) {
              const lastMessageTime = getLastMessageTime(channel);
              const since = lastMessageTime || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours if no messages

              // Request history for this channel
              await signalRService.requestHistory(channel, since, 200);
            }

            // Also request full session restore to get any additional state
            await signalRService.requestFullSessionRestore();
          } catch (error) {
            console.error('Failed to request message history:', error);
          }
        }
      }

      // Show reconnection message to user
      console.log(data.Message);
    });

    // Set up character connection event handlers
    signalRService.onCharacterConnected((data) => {
      console.log('Character connected:', data);
      // Add character connection to character store
      addConnection({
        characterName: data.CharacterName,
        isConnected: true,
        isActive: false, // Will be set to true if this becomes the active character
        status: 'connected',
        lastActivity: new Date().toISOString(),
        connectedAt: new Date().toISOString()
      });
    });

    signalRService.onCharacterDisconnected((data) => {
      console.log('Character disconnected:', data);
      // Update character connection status in store
      const { updateConnection } = useCharacterStore.getState();
      updateConnection(data.CharacterName, {
        isConnected: false,
        status: 'disconnected',
        lastActivity: new Date().toISOString()
      });
    });

    signalRService.onCharacterJoinedChannel((data) => {
      const { addToJoinedChannels } = useChatStore.getState();
      addToJoinedChannels([data.channelId], data.characterName);
    });



    return () => {
      // Cleanup listeners using the new service methods
      signalRService.removeListener('CharacterRestored');
      signalRService.removeListener('CharacterError');
      signalRService.removeListener('BouncerReconnected');
      signalRService.removeListener('CharacterConnected');
      signalRService.removeListener('CharacterDisconnected');
      signalRService.removeListener('CharacterJoinedChannel');
      signalRService.removeListener('ReceiveActiveCharacters');
      
      // Cleanup token expiration listener
      window.removeEventListener('auth:token-expired', handleTokenExpired);
    };
  }, [setToken, setActiveCharacter, addConnection, setChannelsSelected, setSelectedChannels]);

  const connectToSignalR = async (authToken: string, credentials?: LoginCredentials | null) => {
    try {
      await signalRService.connect(authToken, credentials || undefined);
      setConnected(true);

      // Set up the ReceiveActiveCharacters listener after connection is established
      signalRService.onReceiveActiveCharacters((data) => {
        // Update character store with all character connections from backend
        const { setConnections } = useCharacterStore.getState();
        const connections = data.characters.map((char: any) => ({
          characterName: char.characterName,
          isConnected: char.isConnected,
          isActive: char.isActive,
          status: (char.isConnected ? 'connected' : 'disconnected') as 'connecting' | 'connected' | 'disconnected' | 'error',
          lastActivity: char.lastActivityAt || new Date().toISOString(),
          connectedAt: char.connectedAt || new Date().toISOString()
        }));
        
        // Clear any persisted data first to avoid conflicts
        const { clearAllConnections } = useCharacterStore.getState();
        clearAllConnections();
        
        // Now set the new connections
        setConnections(connections);
        
        // Set the active character if specified
        if (data.activeCharacter) {
          setActiveCharacter(data.activeCharacter);
        }
      });

      // Set up the ActiveCharacterSwitched listener after connection is established
      signalRService.onActiveCharacterSwitched(async (data) => {
        console.log('=== ActiveCharacterSwitched Event Received ===');
        console.log('Event data:', data);
        console.log('CharacterName from event:', data.CharacterName || data.characterName);
        console.log('Current activeCharacter before update:', activeCharacter);
        
        // Handle both case variations (server sends CharacterName, but some events might send characterName)
        const characterName = data.CharacterName || data.characterName;
        
        if (characterName) {
          // Update active character in store
          setActiveCharacter(characterName);
          
          console.log('Called setActiveCharacter with:', characterName);
        } else {
          console.warn('ActiveCharacterSwitched event received but no character name found in data:', data);
        }
        
        // Request updated character and channel information
        try {
          console.log('Requesting updated character data...');
          await signalRService.getActiveCharacters();
          console.log('Character data refresh completed');
        } catch (error) {
          console.error('Failed to refresh character data after switch:', error);
        }
      });

      // Set up friends status event listeners
      signalRService.onStatusUpdated((data) => {
        // Only update if this character is actually a friend or bookmark
        if (isFriendOrBookmark(data.characterName)) {
          updateFriendStatus(data.characterName, data.status as any, data.statusMessage);
          consoleUtils.friend(`Status updated: ${data.characterName} is now ${data.status}`, data);
        }

      });

      // Set up bookmark event listeners
      signalRService.setBookmarkCallbacks(
        (data) => {
          console.log('Bookmark added:', data);
          addBookmark(data.characterName);
        },
        (data) => {
          console.log('Bookmark removed:', data);
          removeBookmark(data.characterName);
        }
      );

      signalRService.onUserOnline((data) => {
        // Only update if this character is actually a friend or bookmark
        if (isFriendOrBookmark(data.characterName)) {
          setFriendOnline(data.characterName, true);
          
          consoleUtils.friend(`${data.characterName} came online (${data.status})`, data);
          // Update friend status if provided
          if (data.status) {
            updateFriendStatus(data.characterName, data.status as any);
          }
        }
      });

      signalRService.onUserOffline((data) => {
        // Only update if this character is actually a friend or bookmark
        if (isFriendOrBookmark(data.characterName)) {
          setFriendOnline(data.characterName, false);
          consoleUtils.friend(`${data.characterName} went offline`, data);
        }
      });

      // Set up friends list updated listener
      signalRService.setFriendsListUpdatedCallback(async (data) => {
        console.log('Friends list updated from backend:', data);
        
        // Re-request friends list to get the latest data
        try {
          const friendsResponse = await api.getFriends(token!);
          console.log('Re-fetched friends after backend update:', friendsResponse);
          
          const { setFriendsAndBookmarks } = useAuthStore.getState();
          
          // Convert friends data to Friend objects
          const friends = friendsResponse.friends.map((friend: any) => ({
            name: friend.Name || friend.name,
            status: friend.Status || friend.status as any,
            statusMessage: friend.StatusMessage || friend.statusMessage,
            isOnline: friend.IsOnline || friend.isOnline,
            lastSeen: friend.LastSeen || friend.lastSeen,
            gender: friend.Gender || friend.gender
          }));
          
          setFriendsAndBookmarks(friends, friendsResponse.bookmarks, friendsResponse.bookmarksWithStatus);
          console.log('Updated friends store with new data:', friends.length, 'friends');
        } catch (error) {
          console.error('Failed to re-fetch friends after backend update:', error);
        }
      });

      // Set up profile available listener
      signalRService.onProfileAvailableNotification(async (data) => {
        console.log('Profile available notification received:', data);
        
        // Validate that we have a character name
        if (!data?.characterName) {
          console.error('Profile available notification received without CharacterName:', data);
          return;
        }
        
        try {
          // Fetch the profile via REST API
          const profileResponse = await api.getProfile(token!, data.characterName, true);
          console.log('Successfully fetched profile after notification:', profileResponse);
          
          // Update the profile in the chat store
          const { addProfile } = useChatStore.getState();
          if (profileResponse.profileData) {
            addProfile(data.characterName, profileResponse.profileData);
            console.log(`Added profile for ${data.characterName} to chat store`);
          }
        } catch (error) {
          console.error('Failed to fetch profile after notification:', error);
        }
      });

      // Sync character store with backend state (with a small delay to ensure listeners are set up)
      setTimeout(async () => {
        await signalRService.getActiveCharacters();
      }, 100);

      // If user already has an active character, restore it on the server
      if (activeCharacter) {
        console.log('Restoring active character:', activeCharacter);
        console.log('Setting isCharacterRestoring to true');
        setIsCharacterRestoring(true);
        // Add a small delay to ensure SignalR is fully ready
        setTimeout(async () => {
          try {
            await signalRService.setActiveCharacter(activeCharacter);
            console.log('Character restored successfully');
            
            // Load friends and bookmarks for the restored character
            try {
              console.log('Attempting to load friends and bookmarks for restored character...');
              const friendsResponse = await api.getFriends(token!);
              console.log('Friends API response:', friendsResponse);
              const { setFriendsAndBookmarks } = useAuthStore.getState();

            // Convert friends data to Friend objects
            const friends = friendsResponse.friends.map((friend: any) => ({
              name: friend.Name || friend.name,
              status: friend.Status || friend.status as any,
              statusMessage: friend.StatusMessage || friend.statusMessage,
              isOnline: friend.IsOnline || friend.isOnline,
              lastSeen: friend.LastSeen || friend.lastSeen,
              gender: friend.Gender || friend.gender
            }));

              await setFriendsAndBookmarks(friends, friendsResponse.bookmarks, friendsResponse.bookmarksWithStatus);
              console.log('Loaded friends and bookmarks for restored character:', friends.length, 'friends,', friendsResponse.bookmarks.length, 'bookmarks');
            } catch (error) {
              console.error('Failed to load friends and bookmarks for restored character:', error);
            }
          } catch (error) {
            console.error('Failed to restore character:', error);
            // Don't fail the connection, just log the error
          } finally {
            console.log('Setting isCharacterRestoring to false');
            setIsCharacterRestoring(false);
          }
        }, 1000);
      } else {
        console.log('No active character to restore');
      }
    } catch (error) {
      console.error('Failed to connect to SignalR:', error);
      setConnected(false);
    }
  };

  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      // Store credentials for potential re-auth
      setLastCredentials(credentials);

      // First try to login to get a token
      const loginResponse = await api.login(credentials);

      // Store the authentication state - useEffect will handle SignalR connection
      login(loginResponse.user, loginResponse.token, loginResponse.refreshToken);
      
      // Clear sensitive data from memory after successful login
      clearSensitiveMemory();

    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
        // If login fails with 401 (Unauthorized) or 404, try to register
        try {
          const registerResponse = await api.register(credentials);
          // Store the authentication state - useEffect will handle SignalR connection
          login(registerResponse.user, registerResponse.token, registerResponse.refreshToken);
          
          // Clear sensitive data from memory after successful registration
          clearSensitiveMemory();
        } catch (registerError) {
          throw registerError;
        }
      } else {
        throw error;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    api.googleLogin();
  };

  const handleFChatCredentialsUpdate = async (credentials: FChatCredentialsRequest) => {
    if (!token) {
      throw new Error('No authentication token available');
    }
    
    try {
      await api.updateFChatCredentials(token, credentials);
      // Refresh the page or update the user state as needed
      window.location.reload();
    } catch (error) {
      console.error('Failed to update F-Chat credentials:', error);
      throw error;
    }
  };

  const handleCharacterSelect = async (character: Character) => {
    console.log('Character selected:', character.name);
    console.log('Token available for friends loading:', !!token);
    // Add character connection to character store
    addConnection({
      characterName: character.name,
      isConnected: true,
      isActive: true,
      status: 'connected',
      lastActivity: new Date().toISOString(),
      connectedAt: new Date().toISOString()
    });
    
    // Set as active character
    setActiveCharacter(character.name);

    // Load friends and bookmarks for this character
    try {
      console.log('Attempting to load friends and bookmarks for selected character...');
      const friendsResponse = await api.getFriends(token!);
      console.log('Friends API response:', friendsResponse);
      const { setFriendsAndBookmarks } = useAuthStore.getState();
      
            // Convert friends data to Friend objects
            const friends = friendsResponse.friends.map((friend: any) => ({
              name: friend.Name || friend.name,
              status: friend.Status || friend.status as any,
              statusMessage: friend.StatusMessage || friend.statusMessage,
              isOnline: friend.IsOnline || friend.isOnline,
              lastSeen: friend.LastSeen || friend.lastSeen,
              gender: friend.Gender || friend.gender
            }));
      
      setFriendsAndBookmarks(friends, friendsResponse.bookmarks, friendsResponse.bookmarksWithStatus);
      console.log('Loaded friends and bookmarks:', friends.length, 'friends,', friendsResponse.bookmarks.length, 'bookmarks');
    } catch (error) {
      console.error('Failed to load friends and bookmarks:', error);
    }
  };

  const handleChannelsSelected = async (channels: string[]) => {
    try {
      // Subscribe to the selected channels via SignalR
      await signalRService.subscribeToChannels(channels);
      setChannelsSelected(true);
    } catch (error) {
      console.error('Failed to subscribe to channels:', error);
      throw error;
    }
  };

  const handleBackToCharacterSelection = () => {
    console.log('Going back to character selection');
    // Clear the active character to go back to character selection
    clearActiveCharacter();
    // Reset channels selected state
    setChannelsSelected(false);
  };

  if (isLoading || isAutoLogging) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="F-Chat Bouncer" className="h-16 w-16" />
          </div>
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {isAutoLogging ? 'Restoring your session...' : 'Connecting to F-Chat...'}
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('Rendering AuthFlow - isAuthenticated:', isAuthenticated);
    return (
      <AuthFlow 
        onLogin={handleLogin}
        onGoogleLogin={handleGoogleLogin}
        onFChatCredentialsUpdate={handleFChatCredentialsUpdate}
      />
    );
  }

  if (!activeCharacter) {
    console.log('Rendering CharacterSelection - activeCharacter:', activeCharacter);
    return (
      <CharacterSelection
        onCharacterSelect={handleCharacterSelect}
      />
    );
  }

  if (!areChannelsSelected && !isCharacterRestoring) {
    console.log('Rendering ChannelSelection - areChannelsSelected:', areChannelsSelected, 'isCharacterRestoring:', isCharacterRestoring);
    return (
      <ChannelSelection
        onChannelsSelected={handleChannelsSelected}
        onBackToCharacterSelection={handleBackToCharacterSelection}
      />
    );
  }

  return <ChatInterface isCharacterRestoring={isCharacterRestoring} />;
}