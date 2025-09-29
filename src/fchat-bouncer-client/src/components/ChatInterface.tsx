'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useFriendsStore } from '@/stores/friendsStore';
import { useLightweightCharacterStore } from '@/stores/lightweightCharacterStore';
import { signalRService } from '@/lib/signalr';
import { Message, ProfileData } from '@/types';
import BBCodeEditor from './BBCodeEditor';
import { useTypingStatus } from '@/hooks/useTypingStatus';
import { useNotifications } from '@/hooks/useNotifications';
import MessageList from './messages/MessageList';
import JoinChannelModal from './JoinChannelModal';
import UnknownChannelNotification from './UnknownChannelNotification';
import TypingToastNotification from './TypingToastNotification';
import ProfileModal from './ProfileModal';
import CharacterSwitcher from './CharacterSwitcher';
import CharacterManagement from './CharacterManagement';
import ChannelCharacterList from './ChannelCharacterList';
import FriendsList from './FriendsList';
import SearchModal from './SearchModal';
import DebugPanel from './DebugPanel';
import Console from './Console';
import MobileDrawer from './MobileDrawer';
import MobileTabs from './MobileTabs';

interface ChatInterfaceProps {
  isCharacterRestoring?: boolean;
}

export default function ChatInterface({ isCharacterRestoring = false }: ChatInterfaceProps) {
  const { user, logout } = useAuthStore();
  const { activeCharacter, connections } = useCharacterStore();
  const { messages, addMessage, addMessages, mergeHistoryMessages, clearAllHistory, setConnected, isConnected, selectedChannels, unknownChannels, unknownChannelCounts, addToSelectedChannels, clearUnknownChannel, getChannelDisplayName, addProfile, getProfile, getCharacterGender, getCharacterSpecies, hasCharacterData, isProfileStale, requestProfileForCharacter, refreshProfile, getMessagesForCharacter, getSelectedChannelsForCharacter, isCharacterKnown, getProfileRequestStatus, markCharacterKnown, openPMChannel, getUnknownChannelsForCharacter, getUnknownChannelCountsForCharacter, hasUnreadActivityOnOtherCharacters, getTotalUnreadCountOnOtherCharacters, getUnreadCount, getTotalUnreadCountForCharacter, getUnreadCountsForCharacter, clearUnreadCountForChannel, getHighUrgencyUnreadCountForCharacter, getRegularUnreadCountForCharacter, updateTypingState, clearTypingState, getTypingDisplayText } = useChatStore();
  
  // Initialize notifications
  const { 
    showPMNotification, 
    showChannelNotification, 
    showTypingNotification,
    requestPermission,
    isReady: isNotificationReady 
  } = useNotifications();
  const [bbcodeInput, setBbcodeInput] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [notificationChannel, setNotificationChannel] = useState<string | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileCharacter, setSelectedProfileCharacter] = useState<string>('');
  const [isForceJoining, setIsForceJoining] = useState(false);
  const [channelMenu, setChannelMenu] = useState<{ x: number; y: number; channel: string } | null>(null);
  const [showCharacterManagement, setShowCharacterManagement] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<string | null>(null);
  const [typingToast, setTypingToast] = useState<{ fromCharacter: string; status: 'typing' | 'paused' | 'clear' } | null>(null);
  const messageListRef = useRef<{ scrollToBottom: () => void; scrollToBottomFast: () => void; isNearBottom: (thresholdPx?: number) => boolean; scrollToMessage: (messageId: string) => void }>(null);

  // Determine if current channel is a PM and get the PM character name
  const isPMChannel = selectedChannel.startsWith('PRI-');
  const pmCharacterName = isPMChannel ? selectedChannel.replace('PRI-', '') : undefined;

  // Set up typing status tracking for PM channels
  const typingStatus = useTypingStatus({
    isPMChannel,
    pmCharacterName,
    activeCharacter: activeCharacter || undefined,
  });

  // Stable callback functions to prevent unnecessary re-renders
  const handleReceiveMessage = useCallback(async (message: Message) => {
    console.log('Received message:', message, 'for character:', message.characterName, 'isActive:', message.isActiveCharacter);

    // Check if we have gender data for the sender - if not, request basic info
    const senderGender = getCharacterGender(message.sender);
    if (!senderGender && message.sender && message.sender !== activeCharacter) {
      console.log(`No gender data for ${message.sender}, requesting basic info...`);
      try {
        const basicInfo = await signalRService.getBasicInfo(message.sender);
        if (basicInfo.HasData) {
          console.log(`Retrieved basic info for ${message.sender}:`, basicInfo);
          // Store the basic info in lightweight character store
          const { addCharacter } = useLightweightCharacterStore.getState();
          addCharacter(
            message.sender,
            basicInfo.Gender || 'Unknown',
            basicInfo.Species || 'Unknown'
          );
        }
      } catch (error) {
        console.warn(`Failed to get basic info for ${message.sender}:`, error);
      }
    }

    // Always store the message regardless of which character received it
    // The character context helps us organize messages properly
    addMessage(message, message.characterName || activeCharacter || undefined);
    
    // Debug: Log unread counts after adding message
    if (message.isActiveCharacter && activeCharacter) {
      const unreadCounts = getUnreadCountsForCharacter(activeCharacter);
    }
    
    // If this is a message for the active character, we need to handle unread counts specially
    // Clear unread count for the currently selected channel if this message is for it
    if (message.isActiveCharacter && message.channel === selectedChannel && activeCharacter) {
      clearUnreadCountForChannel(activeCharacter, message.channel);
    }

    // Check if this is a PM message
    const isPM = message.channel && message.channel.startsWith('PRI-');
    const isToInactiveCharacter = !message.isActiveCharacter;

    if (isPM && message.characterName) {
      const pmChannelId = message.channel;
      const characterName = message.characterName;
      
      // Auto-open PM window for inactive character
      if (isToInactiveCharacter) {
        // Add PM channel to selected channels for the character
        if (!getSelectedChannelsForCharacter(characterName).includes(pmChannelId)) {
          addToSelectedChannels([pmChannelId], characterName);
        }
        console.log(`Auto-opened PM window for inactive character ${characterName}: ${pmChannelId}`);
      }
      
      // Show notification for PM (both active and inactive characters)
      if (isNotificationReady) {
        const senderName = message.sender;
        const messageContent = message.content || 'New PM message';
        
        // Only show notification if the PM channel is not currently selected
        const shouldShowNotification = selectedChannel !== pmChannelId;
        
        if (shouldShowNotification) {
          showPMNotification(
            senderName,
            messageContent,
            characterName,
            () => {
              // Open PM when notification is clicked
              openPMChannel(senderName, characterName);
              setSelectedChannel(pmChannelId);
            }
          );
        }
      }
    }

    // Show notification for new unknown channel activity (only for active character)
    if (message.isActiveCharacter) {
      // Get current selected channels for the active character at the time of message
      const activeCharacterName = useCharacterStore.getState().activeCharacter;
      const currentSelectedChannelsForMessage = activeCharacterName 
        ? getSelectedChannelsForCharacter(activeCharacterName) 
        : selectedChannels;
      
      // Check if this is from an unknown channel before adding
      // A channel is "unknown" if it's not in the selected channels (what's open in the UI)
      const wasUnknown = message.channel && !currentSelectedChannelsForMessage.includes(message.channel);

      // Show notification for new unknown channel activity
      // Only show if we're not currently in the process of joining this channel
      if (wasUnknown && message.channel && !notificationChannel) {
        setNotificationChannel(message.channel);
      }
    }

    // Only request profile if we don't know the sender's gender
    try {
      const sender = message.sender;
      if (sender) {
        const requestStatus = getProfileRequestStatus(sender);
        const hasData = hasCharacterData(sender);
        const knownGender = getCharacterGender(sender);
        
        if (!hasData && requestStatus !== 'requesting') {
          // We don't have any data for this character, so request profile to get gender info
          markCharacterKnown(sender);
          requestProfileForCharacter(sender);
        } else if (hasData && (!knownGender || knownGender === 'None') && requestStatus !== 'requesting') {
          // We have data but gender is unknown/None, refresh profile
          refreshProfile(sender);
        }
      }
    } catch (e) {
      console.warn('Profile fetch attempt failed:', e);
    }
   }, [addMessage, activeCharacter, selectedChannel, clearUnreadCountForChannel, addToSelectedChannels, getSelectedChannelsForCharacter, selectedChannels, notificationChannel, hasCharacterData, getCharacterGender, getProfileRequestStatus, markCharacterKnown, requestProfileForCharacter, refreshProfile, isNotificationReady, showPMNotification, openPMChannel, setSelectedChannel]);

  const handleReceiveRecentMessages = useCallback((recentMessages: Message[]) => {
    addMessages(recentMessages, activeCharacter || undefined);
  }, [addMessages, activeCharacter]);

  const handleReceiveHistory = useCallback((data: any) => {
    // Use mergeHistoryMessages to intelligently merge without duplicates
    // Pass the active character name so messages are stored per character
    mergeHistoryMessages(data.messages, activeCharacter || undefined);
  }, [mergeHistoryMessages, activeCharacter]);

  const handleChannelsSubscribed = useCallback((channels: string[]) => {
    console.log('Successfully subscribed to channels:', channels);
    // Update the store with the confirmed channels
    addToSelectedChannels(channels, activeCharacter || undefined);
    // Clear notification if we joined the notified channel
    if (notificationChannel && channels.includes(notificationChannel)) {
      setNotificationChannel(null);
    }
  }, [addToSelectedChannels, activeCharacter, notificationChannel]);

  // Get messages and channels for the active character
  const currentMessages = activeCharacter ? getMessagesForCharacter(activeCharacter) : messages;
  const currentSelectedChannels = activeCharacter ? getSelectedChannelsForCharacter(activeCharacter) : selectedChannels;
  
  // Get unknown channels for the active character
  const currentUnknownChannels = activeCharacter ? getUnknownChannelsForCharacter(activeCharacter) : unknownChannels;
  const currentUnknownChannelCounts = activeCharacter ? getUnknownChannelCountsForCharacter(activeCharacter) : unknownChannelCounts;
  
  // Get unread counts for the active character
  const currentUnreadCounts = activeCharacter ? getUnreadCountsForCharacter(activeCharacter) : {};
  
  // Check if there are unread messages on other characters
  const hasOtherCharacterActivity = activeCharacter ? hasUnreadActivityOnOtherCharacters(activeCharacter) : false;
  const totalOtherCharacterCount = activeCharacter ? getTotalUnreadCountOnOtherCharacters(activeCharacter) : 0;

  // Request notification permission on component mount
  useEffect(() => {
    if (!isNotificationReady) {
      requestPermission();
    }
  }, [isNotificationReady, requestPermission]);

  // Optimized useEffect for SignalR listeners - only runs when necessary
  useEffect(() => {
    console.log('Setting up SignalR listeners (optimized)');
    
    // Set up SignalR message listeners using stable callbacks
    signalRService.onReceiveMessage(handleReceiveMessage);
    signalRService.onReceiveRecentMessages(handleReceiveRecentMessages);
    signalRService.onReceiveHistory(handleReceiveHistory);
    signalRService.onChannelsSubscribed(handleChannelsSubscribed);

    // Handle queued message notifications
    signalRService.onMessageQueued((_data) => {
      // Could show a toast notification to user
    });

    signalRService.onQueuedMessagesProcessed((_data) => {
      // Could show a toast notification about messages being sent
    });

    // Handle profile request notifications
    signalRService.onProfileRequested((_data) => {
      // Profile request notification received
    });

    signalRService.onProfileError((error) => {
      console.error('Profile error:', error);
    });

    // Handle character errors (e.g., character not found)
    signalRService.onCharacterError((data) => {
      console.warn('Character error received:', data);
      
      // Show user-friendly error message
      const errorMessage = data.message || data.originalError || 'An unknown character error occurred';
      
      // You could show a toast notification here
      // For now, we'll just log it and could add a toast system later
      console.warn(`Character Error (${data.errorType}): ${errorMessage}`);
      
      // Handle different error types
      if (data.errorType === 'ServerOverloaded') {
        console.warn(`F-List server is overloaded. Please try again in a few minutes.`);
        // You could show a special toast for server overload
      } else if (data.errorType === 'CharacterNotFound' || data.errorType === 'CharacterOffline') {
        console.warn(`Character '${data.characterName}' is not available: ${errorMessage}`);
      } else if (data.errorType === 'SwitchFailed') {
        console.warn(`Failed to switch to character '${data.characterName}': ${errorMessage}`);
      }
    });

    // Handle typing notifications
    signalRService.onReceiveTypingNotification((data) => {
      console.log('Typing notification received:', data);
      
      // Only process typing notifications for PM channels
      if (data.ReceivingCharacter && data.FromCharacter && data.Status) {
        const pmChannelId = `PRI-${data.FromCharacter}`;
        
        // Create typing state
        const typingState = {
          characterName: data.FromCharacter,
          status: data.Status as 'typing' | 'paused' | 'clear',
          timestamp: new Date(data.Timestamp)
        };
        
        // Update typing state in store
        updateTypingState(data.ReceivingCharacter, pmChannelId, typingState);
        
        // Show toast notification if PM window is not currently open
        if (selectedChannel !== pmChannelId && (data.Status === 'typing' || data.Status === 'paused')) {
          console.log(`Typing notification from ${data.FromCharacter}: ${data.Status} (PM window not open)`);
          setTypingToast({
            fromCharacter: data.FromCharacter,
            status: data.Status as 'typing' | 'paused' | 'clear'
          });
          
          // Show browser notification for typing status
          if (isNotificationReady) {
            showTypingNotification(data.FromCharacter, data.Status as 'typing' | 'paused');
          }
        }
      }
    });

    signalRService.onProfileReceived((data: any) => {
      // Handle both naming conventions (camelCase and PascalCase)
      const profileData = data.profileData || data.ProfileData;
      const characterName = data.characterName || data.CharacterName;
      const onlineStatus = data.onlineStatus || data.OnlineStatus;

      try {
        // Check if profileData is structured or raw
        if (typeof profileData === 'object' && profileData !== null) {
          // It's already a structured ProfileData object
          addProfile(characterName, profileData);
        } else if (typeof profileData === 'string') {
          // Try to parse it as JSON
          const parsedProfile = JSON.parse(profileData) as ProfileData;
          addProfile(characterName, parsedProfile);
        } else {
          console.error('Unexpected profileData format:', typeof profileData, profileData);
        }

        // Update friend/bookmark status if online status is provided
        if (onlineStatus && characterName) {
          console.log('Updating online status for character:', characterName, onlineStatus);
          
          // Update the friend status in the store
          const { updateFriendStatus, setFriendOnline } = useFriendsStore.getState();
          
          if (onlineStatus.isOnline) {
            setFriendOnline(characterName, true);
            // Update status and gender separately
            updateFriendStatus(characterName, onlineStatus.status, onlineStatus.gender);
          } else {
            setFriendOnline(characterName, false);
            updateFriendStatus(characterName, 'offline', undefined);
          }
        }
      } catch (error) {
        console.error('Failed to process profile data:', error);
      }
    });

    // Update connection status
    setConnected(signalRService.isConnected);

    return () => {
      // Cleanup listeners when component unmounts or effect re-runs
      console.log('Cleaning up SignalR listeners');
      signalRService.removeListener('ReceiveMessage');
      signalRService.removeListener('ReceiveRecentMessages');
      signalRService.removeListener('ReceiveHistory');
      signalRService.removeListener('MessageQueued');
      signalRService.removeListener('QueuedMessagesProcessed');
      signalRService.removeListener('ProfileRequested');
      signalRService.removeListener('ProfileError');
      signalRService.removeListener('ProfileReceived');
      signalRService.removeListener('ChannelsSubscribed');
    };
  }, [handleReceiveMessage, handleReceiveRecentMessages, handleReceiveHistory, handleChannelsSubscribed, addProfile, setConnected, isNotificationReady, showTypingNotification]); // Only re-run when these stable callbacks change

  // Separate effect for setting initial channel to avoid re-running listeners
  useEffect(() => {
    if (!selectedChannel && currentSelectedChannels.length > 0) {
      setSelectedChannel(currentSelectedChannels[0]);
    }
  }, [selectedChannel, currentSelectedChannels]);

  // Separate effect for ActiveCharacterSwitched listener (only runs once)
  useEffect(() => {
    console.log('Setting up ActiveCharacterSwitched listener (once only)');
    
    // Handle active character switching
    signalRService.onActiveCharacterSwitched((data: { CharacterName?: string; characterName?: string; Message: string }) => {
      console.log('=== ChatInterface: ActiveCharacterSwitched event received ===');
      console.log('Event data:', data);
      
      const newCharacterName = data.CharacterName || data.characterName;
      if (newCharacterName) {
        console.log('Character switched to:', newCharacterName);
        console.log('Previous active character:', activeCharacter);
        
        // Update the character store
        useCharacterStore.getState().setActiveCharacter(newCharacterName);
        
        // Auto-select the first channel for the new character
        const newCharacterChannels = getSelectedChannelsForCharacter(newCharacterName);
        console.log('Available channels for new character:', newCharacterChannels);
        
        if (newCharacterChannels.length > 0) {
          console.log('Auto-selecting first channel for new character:', newCharacterChannels[0]);
          setSelectedChannel(newCharacterChannels[0]);
        } else {
          console.log('No channels available for new character, clearing selected channel');
          setSelectedChannel('');
        }
      }
    });

    return () => {
      console.log('Cleaning up ActiveCharacterSwitched listener');
      signalRService.removeListener('ActiveCharacterSwitched');
    };
  }, []); // Empty dependency array - only runs once

  useEffect(() => {
    // Smart autoscroll: only scroll to bottom if user is already near the bottom
    const nearBottom = messageListRef.current?.isNearBottom?.(120);
    if (nearBottom) {
      messageListRef.current?.scrollToBottom();
    }
  }, [currentMessages, selectedChannel]);

  // Ensure scroll to bottom when switching channels
  useEffect(() => {
    // Defer to next frame to let the list render the new channel
    if (selectedChannel) {
      requestAnimationFrame(() => {
        messageListRef.current?.scrollToBottomFast?.();
      });
    }
  }, [selectedChannel]);

  // Clear unread when switching to a channel (including PMs)
  useEffect(() => {
    if (selectedChannel && activeCharacter) {
      clearUnreadCountForChannel(activeCharacter, selectedChannel);
    }
  }, [selectedChannel, activeCharacter, clearUnreadCountForChannel]);

  const handleSendBBCodeMessage = async (bbcode: string) => {
    if (!bbcode.trim() || !selectedChannel || !activeCharacter) return;

    try {
      await signalRService.sendMessageFromCharacter(activeCharacter, selectedChannel, bbcode);
      setBbcodeInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleLogout = async () => {
    await signalRService.disconnect();
    logout();
  };

  // Handle message actions
  const handleMessageAction = (action: string, message: Message) => {
    console.log(`Action ${action} on message:`, message);

    if (action === 'openPM') {
      // Handle PM opening from username clicks
      const pmData = message as any; // This contains { sender, pmChannelId }
      const pmChannelId = pmData.pmChannelId;

      // Add PM channel to selected channels if not already there
      if (!currentSelectedChannels.includes(pmChannelId)) {
        addToSelectedChannels([pmChannelId], activeCharacter || undefined);
      }

      // Switch to the PM channel
      setSelectedChannel(pmChannelId);

      console.log(`Opened PM channel: ${pmChannelId} with ${pmData.sender}`);
      return;
    }

    // Handle other message actions here
  };

  // Handle message selection
  const handleMessageSelect = (message: Message) => {
    console.log('Selected message:', message);
    // Handle message selection here
  };

  const handleChannelsJoined = async (channels: string[]) => {
    console.log('Joining channels:', channels);
    try {
      // Actually join the channels via SignalR
      // The store will be updated when we receive ChannelsSubscribed confirmation
      await signalRService.subscribeToChannels(channels);
      
      // Switch to the first newly joined channel if no channel is currently selected
      if (!selectedChannel && channels.length > 0) {
        setSelectedChannel(channels[0]);
      }
      // Optionally scroll to bottom of the current channel
      messageListRef.current?.scrollToBottom();
    } catch (error) {
      console.error('Failed to join channels:', error);
    }
  };

  const handleJoinNotificationChannel = () => {
    if (notificationChannel) {
      // Join the channel - store will be updated when we receive ChannelsSubscribed confirmation
      signalRService.subscribeToChannels([notificationChannel]);
      setSelectedChannel(notificationChannel);
      setNotificationChannel(null);
    }
  };

  const handleDismissNotification = () => {
    setNotificationChannel(null);
  };

  const handleShowProfile = (characterName: string) => {
    setSelectedProfileCharacter(characterName);
    setShowProfileModal(true);
  };

  const handleCloseProfileModal = () => {
    setShowProfileModal(false);
    setSelectedProfileCharacter('');
  };

  const handleClearAllHistory = async () => {
    if (confirm('Are you sure you want to clear ALL message history? This will clear both frontend and backend history and cannot be undone.')) {
      try {
        // Clear backend history first
        await signalRService.clearAllHistory();
        // Clear frontend history
        clearAllHistory();
        console.log('All history cleared successfully (frontend + backend)');
      } catch (error) {
        console.error('Failed to clear history:', error);
        alert('Failed to clear history. Check console for details.');
      }
    }
  };

  const handleForceJoinSelected = async () => {
    if (!selectedChannel) return;
    try {
      setIsForceJoining(true);
      await signalRService.subscribeToChannels([selectedChannel]);
      addToSelectedChannels([selectedChannel], activeCharacter || undefined);
    } catch (error) {
      console.error('Failed to force join channel:', error);
      alert('Failed to force join channel.');
    } finally {
      setIsForceJoining(false);
    }
  };

  const handleChannelContextMenu = (e: React.MouseEvent, channel: string) => {
    e.preventDefault();
    setChannelMenu({ x: e.clientX, y: e.clientY, channel });
  };

  const handleCloseChannel = (channel: string) => {
    // Clear unread count for this channel
    if (activeCharacter) {
      clearUnreadCountForChannel(activeCharacter, channel);
    }

    // Remove from character-scoped channels if we have an active character
    if (activeCharacter) {
      useChatStore.setState((state) => ({
        characterSelectedChannels: {
          ...state.characterSelectedChannels,
          [activeCharacter]: (state.characterSelectedChannels[activeCharacter] || []).filter((ch) => ch !== channel)
        }
      }));
    } else {
      // Legacy behavior
      useChatStore.setState((state) => ({
        selectedChannels: state.selectedChannels.filter((ch) => ch !== channel),
      }));
    }

    // If we closed the active channel, select the next available one
    if (selectedChannel === channel) {
      const remaining = activeCharacter ? 
        useChatStore.getState().characterSelectedChannels[activeCharacter] || [] :
        useChatStore.getState().selectedChannels;
      setSelectedChannel(remaining[0] || '');
    }

    setChannelMenu(null);
  };

  const handleGlobalClick = () => {
    if (channelMenu) setChannelMenu(null);
  };

  const handleOpenPM = (friendName: string) => {
    if (activeCharacter) {
      openPMChannel(friendName, activeCharacter);
      // Set the PM channel as the selected channel
      setSelectedChannel(`PRI-${friendName}`);
    }
  };

  const handleMobileTabClick = (tab: string) => {
    if (activeMobileTab === tab) {
      setActiveMobileTab(null);
    } else {
      setActiveMobileTab(tab);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900" onClick={handleGlobalClick}>
      {/* Sidebar - Hidden on mobile */}
      <div className="hidden lg:flex w-64 bg-gray-800 shadow-md flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-bold text-lg text-white">F-Chat Bouncer</h2>
          <p className="text-sm text-gray-300">Welcome, {user?.username}</p>
          
          {/* Character Management */}
          <div className="mt-3 space-y-2">
            <CharacterSwitcher className="w-full" isCharacterRestoring={isCharacterRestoring} />
            <button
              onClick={() => setShowCharacterManagement(true)}
              className="w-full px-3 py-2 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
            >
              Manage Characters
            </button>

          </div>
          
          <div className="flex items-center mt-2">
            <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-300">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Friends List */}
        <div className="p-4 border-b border-gray-700">
          <FriendsList onOpenPM={handleOpenPM} />
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="font-semibold text-sm text-gray-300 mb-2">Channels & Messages</h3>
          <div className="space-y-1 mb-4">
            {currentSelectedChannels.map((channel) => {
              const isPM = channel.startsWith('PRI-');
              return (
                <button
                  key={channel}
                  onClick={() => {
                    setSelectedChannel(channel);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    selectedChannel === channel
                      ? 'bg-indigo-600 text-white'
                      : currentUnreadCounts[channel]
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  onContextMenu={(e) => handleChannelContextMenu(e, channel)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1">
                      <span className="mr-2">
                        {isPM ? '💬' : '#'}
                      </span>
                      <div className="flex flex-col">
                        <span>{getChannelDisplayName(channel)}</span>
                        {/* Show typing indicator for PM channels */}
                        {isPM && activeCharacter && (
                          <span className="text-xs text-gray-400 opacity-75">
                            {getTypingDisplayText(activeCharacter, channel)}
                          </span>
                        )}
                      </div>
                    </div>
                    {currentUnreadCounts[channel] && selectedChannel !== channel && (
                      <span className="ml-2 bg-indigo-600 text-indigo-100 text-xs rounded-full px-2 py-0.5">
                        {currentUnreadCounts[channel]}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Character Activity Overview */}
          {activeCharacter && (
            <div>
              <h3 className="font-semibold text-sm text-gray-400 mb-2 flex items-center">
                <span className="mr-1">👥</span>
                Character Activity
              </h3>
              <div className="space-y-1">
                {connections.map((connection) => {
                  const characterUnknownChannels = getUnknownChannelsForCharacter(connection.characterName);
                  const characterUnknownCounts = getUnknownChannelCountsForCharacter(connection.characterName);
                  const characterUnreadCounts = getUnreadCountsForCharacter(connection.characterName);
                  const isActive = connection.characterName === activeCharacter;
                  
                  // Get high-urgency and regular counts
                  const highUrgencyCount = getHighUrgencyUnreadCountForCharacter(connection.characterName);
                  const regularCount = getRegularUnreadCountForCharacter(connection.characterName);
                  const totalUnreadCount = highUrgencyCount + regularCount;
                  
                  return (
                    <button
                      key={connection.characterName}
                      onClick={async () => {
                        if (connection.characterName !== activeCharacter) {
                          // Switch to this character using the same logic as CharacterSwitcher
                          try {
                            await signalRService.switchActiveCharacter(connection.characterName);
                            // Note: The ActiveCharacterSwitched event handler will auto-select the first channel
                          } catch (error) {
                            console.error('Failed to switch character:', error);
                          }
                        }
                      }}
                      disabled={connection.characterName === activeCharacter}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        isActive 
                          ? 'bg-blue-900/20 text-blue-300 border border-blue-600/30 cursor-default' 
                          : totalUnreadCount > 0
                            ? highUrgencyCount > 0
                              ? 'bg-yellow-900/20 text-yellow-300 border border-yellow-600/30 hover:bg-yellow-900/30'
                              : 'bg-blue-900/20 text-blue-300 border border-blue-600/30 hover:bg-blue-900/30'
                            : 'bg-gray-800/50 text-gray-400 border border-gray-600/30 hover:bg-gray-800/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-2 ${
                            connection.isConnected ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <span className={isActive ? 'font-medium' : ''}>{connection.characterName}</span>
                          {isActive && <span className="ml-1 text-xs">(active)</span>}
                        </div>
                        {totalUnreadCount > 0 && !isActive && (
                          <span className={`text-xs rounded-full px-2 py-0.5 ${
                            highUrgencyCount > 0 
                              ? 'bg-yellow-600 text-yellow-100' // Yellow for high-urgency (PMs)
                              : 'bg-blue-600 text-blue-100'    // Blue for regular messages only
                          }`}>
                            {totalUnreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unknown Channels Section for Current Character */}
          {currentUnknownChannels.size > 0 && (
            <div>
              <h3 className="font-semibold text-sm text-yellow-400 mb-2 flex items-center">
                <span className="mr-1">⚠️</span>
                New Activity ({activeCharacter || 'Current'})
              </h3>
              <div className="space-y-1">
                {Array.from(currentUnknownChannels).map((channel) => (
                  <button
                    key={`unknown-${channel}`}
                    onClick={() => {
                      // Option 1: Open join modal with this channel pre-selected
                      // setShowJoinModal(true);
                      // Option 2: Auto-join and switch to channel (uncomment below)
                      addToSelectedChannels([channel], activeCharacter || undefined);
                      signalRService.subscribeToChannels([channel]);
                      setSelectedChannel(channel);
                    }}
                    className="w-full text-left px-3 py-2 rounded text-sm text-yellow-300 hover:bg-yellow-600 hover:bg-opacity-20 border border-yellow-600 border-opacity-30"
                  >
                    <div className="flex items-center justify-between">
                      <span>#{getChannelDisplayName(channel)}</span>
                      {currentUnknownChannelCounts[channel] && (
                        <span className="bg-yellow-600 text-yellow-100 text-xs rounded-full px-2 py-0.5">
                          {currentUnknownChannelCounts[channel]}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-yellow-400 opacity-75">Click to join</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-200"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header - Hidden on mobile */}
        <div className="hidden lg:block bg-gray-800 shadow-sm p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-lg text-white">
              {selectedChannel ?
                (selectedChannel.startsWith('PRI-') ?
                  getChannelDisplayName(selectedChannel) :
                  `#${getChannelDisplayName(selectedChannel)}`
                ) :
                'Select a channel'
              }
            </h1>
            <div className="flex items-center space-x-3">
              {/* Unknown channels indicator for current character */}
              {currentUnknownChannels.size > 0 && (
                <div className="flex items-center text-yellow-400 text-sm">
                  <span className="mr-1">⚠️</span>
                  <span>{currentUnknownChannels.size} new channel{currentUnknownChannels.size === 1 ? '' : 's'}</span>
                </div>
              )}
              
              {/* Indicator for unread activity on other characters */}
              {hasOtherCharacterActivity && (
                <div className="flex items-center text-blue-400 text-sm">
                  <span className="mr-1">👥</span>
                  <span>{totalOtherCharacterCount} unread on other characters</span>
                </div>
              )}

              {/* Debug Panel Toggle */}
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className="flex items-center px-2 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors text-sm"
                title="Debug panel"
              >
                🔧
              </button>

              {/* Join Channel Button */}
              <button
                onClick={() => setShowJoinModal(true)}
                className="flex items-center px-3 py-2 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                title="Join channels"
              >
                <span className="mr-1">➕</span>
                <span>Join Channel</span>
              </button>
              <button
              onClick={() => setShowSearchModal(true)}
              className="flex items-center px-3 py-2 text-xs bg-blue-700 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Search Characters
            </button>
            <button
              onClick={() => window.open('/logs', '_blank')}
              className="flex items-center px-3 py-2 text-xs bg-purple-700 text-white rounded hover:bg-purple-600 transition-colors"
            >
              View Logs
            </button>
              {/* Force Join Current Button */}
              <button
                onClick={handleForceJoinSelected}
                disabled={!selectedChannel || isForceJoining}
                className={`flex items-center px-3 py-2 text-xs rounded-md transition-colors text-white ${(!selectedChannel || isForceJoining) ? 'bg-gray-600 opacity-60 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                title="Force the backend to join the currently selected channel"
              >
                <span className="mr-1">🚀</span>
                <span>{isForceJoining ? 'Joining…' : 'Force Join Current'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebugPanel && (
          <DebugPanel
            messages={currentMessages}
            selectedChannels={currentSelectedChannels}
            onClearAllHistory={handleClearAllHistory}
            onShowProfile={handleShowProfile}
            getProfile={getProfile}
            showConsole={showConsole}
            onToggleConsole={() => setShowConsole(!showConsole)}
          />
        )}

        {/* Chat Content Area */}
        <div className="flex-1 flex min-h-0">
          {/* Messages */}
          <div className="flex-1 flex flex-col min-h-0 w-full lg:w-auto">
            <div className="flex-1 min-h-0">
              <MessageList
                ref={messageListRef}
                messages={currentMessages}
                selectedChannel={selectedChannel}
                onMessageAction={handleMessageAction}
                onMessageSelect={handleMessageSelect}
                showTimestamps={true}
                showAvatars={false}
                groupConsecutive={true}
                enableLazyLoading={true}
              />
            </div>

            {/* Message Input */}
            {selectedChannel && (
              <div className="bg-gray-800 border-t border-gray-700 p-4 flex-shrink-0">
                <BBCodeEditor
                  value={bbcodeInput}
                  onChange={setBbcodeInput}
                  onSubmit={handleSendBBCodeMessage}
                  onBlur={typingStatus.handleBlur}
                  onTypingStart={typingStatus.handleTypingStart}
                  onTypingStop={typingStatus.handleTypingStop}
                  onInputChange={typingStatus.handleInputChange}
                  placeholder={`Message ${selectedChannel.startsWith('PRI-') ? getChannelDisplayName(selectedChannel) : `#${getChannelDisplayName(selectedChannel)}`}... Use [b], [i], [u] for formatting`}
                  disabled={!isConnected}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Character List Sidebar - Hidden on mobile, shown on desktop */}
          {selectedChannel && !selectedChannel.startsWith('PRI-') && (
            <div className="hidden xl:flex w-80 bg-gray-800 border-l border-gray-700 flex-col h-full p-4">
              <ChannelCharacterList channelId={selectedChannel} onOpenPM={handleOpenPM} />
            </div>
          )}
        </div>
      </div>

      {/* Join Channel Modal */}
      <JoinChannelModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onChannelsJoined={handleChannelsJoined}
      />

      {/* Unknown Channel Notification */}
      {notificationChannel && unknownChannelCounts[notificationChannel] && (
        <UnknownChannelNotification
          channel={notificationChannel}
          messageCount={unknownChannelCounts[notificationChannel]}
          onJoin={handleJoinNotificationChannel}
          onDismiss={handleDismissNotification}
        />
      )}

      {/* Typing Toast Notification */}
      {typingToast && (
        <TypingToastNotification
          fromCharacter={typingToast.fromCharacter}
          status={typingToast.status}
          onDismiss={() => setTypingToast(null)}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={handleCloseProfileModal}
        profileData={selectedProfileCharacter ? getProfile(selectedProfileCharacter) : null}
        characterName={selectedProfileCharacter}
      />

      {/* Channel Context Menu */}
      {channelMenu && (
        <div
          className="fixed z-50 bg-gray-800 text-gray-200 border border-gray-700 rounded shadow-lg"
          style={{ left: channelMenu.x, top: channelMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="block w-full text-left px-4 py-2 hover:bg-gray-700"
            onClick={() => handleCloseChannel(channelMenu.channel)}
          >
            Close Channel
          </button>
        </div>
      )}

      {/* Character Management Modal */}
      <CharacterManagement
        isOpen={showCharacterManagement}
        onClose={() => setShowCharacterManagement(false)}
      />

      {/* Mobile Tabs */}
      <MobileTabs
        activeTab={activeMobileTab}
        onTabClick={handleMobileTabClick}
        unreadCounts={{
          channels: Object.values(currentUnreadCounts).reduce((sum, count) => sum + count, 0),
          friends: 0, // TODO: Add friends unread count
          characters: hasOtherCharacterActivity ? totalOtherCharacterCount : 0
        }}
      />

      {/* Mobile Drawers */}
      <MobileDrawer
        isOpen={activeMobileTab === 'friends'}
        onClose={() => setActiveMobileTab(null)}
        title="Friends"
        position="left"
      >
        <div className="p-4">
          <FriendsList onOpenPM={handleOpenPM} />
        </div>
      </MobileDrawer>

      <MobileDrawer
        isOpen={activeMobileTab === 'channels'}
        onClose={() => setActiveMobileTab(null)}
        title="Channels & Messages"
        position="left"
      >
        <div className="p-4">
          <div className="space-y-1 mb-4">
            {currentSelectedChannels.map((channel) => {
              const isPM = channel.startsWith('PRI-');
              return (
                <button
                  key={channel}
                  onClick={() => {
                    setSelectedChannel(channel);
                    setActiveMobileTab(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    selectedChannel === channel
                      ? 'bg-indigo-600 text-white'
                      : currentUnreadCounts[channel]
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  onContextMenu={(e) => handleChannelContextMenu(e, channel)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1">
                      <span className="mr-2">
                        {isPM ? '💬' : '#'}
                      </span>
                      <div className="flex flex-col">
                        <span>{getChannelDisplayName(channel)}</span>
                        {/* Show typing indicator for PM channels */}
                        {isPM && activeCharacter && (
                          <span className="text-xs text-gray-400 opacity-75">
                            {getTypingDisplayText(activeCharacter, channel)}
                          </span>
                        )}
                      </div>
                    </div>
                    {currentUnreadCounts[channel] && selectedChannel !== channel && (
                      <span className="ml-2 bg-indigo-600 text-indigo-100 text-xs rounded-full px-2 py-0.5">
                        {currentUnreadCounts[channel]}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Character Activity Overview */}
          {activeCharacter && (
            <div>
              <h3 className="font-semibold text-sm text-gray-400 mb-2 flex items-center">
                <span className="mr-1">👥</span>
                Character Activity
              </h3>
              <div className="space-y-1">
                {connections.map((connection) => {
                  const characterUnknownChannels = getUnknownChannelsForCharacter(connection.characterName);
                  const characterUnknownCounts = getUnknownChannelCountsForCharacter(connection.characterName);
                  const characterUnreadCounts = getUnreadCountsForCharacter(connection.characterName);
                  const isActive = connection.characterName === activeCharacter;
                  
                  // Get high-urgency and regular counts
                  const highUrgencyCount = getHighUrgencyUnreadCountForCharacter(connection.characterName);
                  const regularCount = getRegularUnreadCountForCharacter(connection.characterName);
                  const totalUnreadCount = highUrgencyCount + regularCount;
                  
                  return (
                    <button
                      key={connection.characterName}
                      onClick={() => {
                        // Switch character logic would go here
                        setActiveMobileTab(null);
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        isActive
                          ? 'bg-green-600 text-white'
                          : totalUnreadCount > 0
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-1">
                          <div className={`w-2 h-2 rounded-full mr-2 ${
                            isActive ? 'bg-green-500' : connection.isConnected ? 'bg-blue-500' : 'bg-red-500'
                          }`}></div>
                          <div className="flex flex-col">
                            <span className="font-medium">{connection.characterName}</span>
                            <span className="text-xs text-gray-400">
                              {isActive ? 'Active' : connection.isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>
                        </div>
                        {totalUnreadCount > 0 && !isActive && (
                          <span className="ml-2 bg-indigo-600 text-indigo-100 text-xs rounded-full px-2 py-0.5">
                            {totalUnreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </MobileDrawer>

      <MobileDrawer
        isOpen={activeMobileTab === 'characters'}
        onClose={() => setActiveMobileTab(null)}
        title="Manage Characters"
        position="left"
      >
        <div className="p-4">
          <div className="space-y-4">
            {/* Character Switcher */}
            <div>
              <h3 className="font-semibold text-sm text-gray-400 mb-2">Switch Character</h3>
              <CharacterSwitcher className="w-full" isCharacterRestoring={isCharacterRestoring} />
            </div>

            {/* Character Management Button */}
            <button
              onClick={() => {
                setActiveMobileTab(null);
                setShowCharacterManagement(true);
              }}
              className="w-full px-3 py-2 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
            >
              Manage Characters
            </button>

            {/* Character Activity with Notifications */}
            {activeCharacter && (
              <div>
                <h3 className="font-semibold text-sm text-gray-400 mb-2 flex items-center">
                  <span className="mr-1">👥</span>
                  Character Activity
                </h3>
                <div className="space-y-1">
                  {connections.map((connection) => {
                    const characterUnknownChannels = getUnknownChannelsForCharacter(connection.characterName);
                    const characterUnknownCounts = getUnknownChannelCountsForCharacter(connection.characterName);
                    const characterUnreadCounts = getUnreadCountsForCharacter(connection.characterName);
                    const isActive = connection.characterName === activeCharacter;
                    
                    // Get high-urgency and regular counts
                    const highUrgencyCount = getHighUrgencyUnreadCountForCharacter(connection.characterName);
                    const regularCount = getRegularUnreadCountForCharacter(connection.characterName);
                    const totalUnreadCount = highUrgencyCount + regularCount;
                    
                    return (
                      <div
                        key={connection.characterName}
                        className={`w-full text-left px-3 py-2 rounded text-sm ${
                          isActive
                            ? 'bg-green-600 text-white'
                            : totalUnreadCount > 0
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1">
                            <div className={`w-2 h-2 rounded-full mr-2 ${
                              isActive ? 'bg-green-500' : connection.isConnected ? 'bg-blue-500' : 'bg-red-500'
                            }`}></div>
                            <div className="flex flex-col">
                              <span className="font-medium">{connection.characterName}</span>
                              <span className="text-xs text-gray-400">
                                {isActive ? 'Active' : connection.isConnected ? 'Connected' : 'Disconnected'}
                              </span>
                            </div>
                          </div>
                          {totalUnreadCount > 0 && !isActive && (
                            <span className="ml-2 bg-indigo-600 text-indigo-100 text-xs rounded-full px-2 py-0.5">
                              {totalUnreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </MobileDrawer>

      {/* Search Modal */}
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onOpenPM={handleOpenPM}
      />

      {/* Console */}
      <Console
        isVisible={showConsole}
        onClose={() => setShowConsole(false)}
      />
    </div>
  );
}