'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Hash, MessageSquareMore, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useCharacterIndexedDBStore } from '@/stores/characterIndexedDBStore';
import { useFriendsStore } from '@/stores/friendsStore';
import { useLightweightCharacterStore } from '@/stores/lightweightCharacterStore';
import { signalRService } from '@/lib/signalr';
import { Message, ProfileData } from '@/types';
import { getAppVersion } from '@/lib/version';
import BBCodeEditor from './BBCodeEditor';
import { useTypingStatus } from '@/hooks/useTypingStatus';
import { useNotifications } from '@/hooks/useNotifications';
import MessageList from './messages/MessageList';
import JoinChannelModal from './JoinChannelModal';
import UnknownChannelNotification from './UnknownChannelNotification';
import TypingToastNotification from './TypingToastNotification';
import TypingIndicator from './TypingIndicator';
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

interface SortableChannelItemProps {
  channel: string;
  isPM: boolean;
  typingState: any;
  selectedChannel: string;
  currentUnreadCounts: Record<string, number>;
  getChannelDisplayName: (channel: string) => string;
  getTypingState: (characterName: string, channel: string) => any;
  activeCharacter: string | null;
  onChannelClick: (channel: string) => void;
  onContextMenu: (e: React.MouseEvent, channel: string) => void;
}

function SortableChannelItem({
  channel,
  isPM,
  typingState,
  selectedChannel,
  currentUnreadCounts,
  getChannelDisplayName,
  onChannelClick,
  onContextMenu,
}: SortableChannelItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <button
        onClick={() => onChannelClick(channel)}
        className={`w-full text-left px-3 py-2 rounded text-sm ${
          selectedChannel === channel
            ? 'bg-indigo-600 text-white'
            : currentUnreadCounts[channel]
              ? 'bg-gray-700 text-white'
              : 'text-gray-300 hover:bg-gray-700'
        }`}
        onContextMenu={(e) => onContextMenu(e, channel)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1">
            <div
              {...attributes}
              {...listeners}
              className="mr-2 cursor-grab active:cursor-grabbing touch-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={16} className="text-gray-500" />
            </div>
            <span className="mr-2">
              {isPM ? (
                typingState?.status === 'typing' ? (
                  <MessageSquare size={16} className="text-gray-400 animate-bounce" />
                ) : typingState?.status === 'paused' ? (
                  <MessageSquareMore size={16} className="text-gray-400" />
                ) : (
                  <MessageSquare size={16} className="text-gray-400" />
                )
              ) : (
                typingState?.status === 'typing' ? (
                  <Hash size={16} className="text-gray-400 animate-bounce" />
                ) : (
                  <Hash size={16} className="text-gray-400" />
                )
              )}
            </span>
            <div className="flex flex-col">
              <span>{getChannelDisplayName(channel)}</span>
            </div>
          </div>
          {currentUnreadCounts[channel] && selectedChannel !== channel && (
            <span className="ml-2 bg-indigo-600 text-indigo-100 text-xs rounded-full px-2 py-0.5">
              {currentUnreadCounts[channel]}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

export default function ChatInterface({ isCharacterRestoring = false }: ChatInterfaceProps) {
  const { user, logout } = useAuthStore();
  const { activeCharacter, connections } = useCharacterIndexedDBStore();
  const {
    messages,
    addMessage,
    clearAllHistory,
    setConnected,
    isConnected,
    selectedChannels,
    unknownChannels,
    unknownChannelCounts,
    addToSelectedChannels,
    clearUnknownChannel,
    getChannelDisplayName,
    addProfile,
    getProfile,
    getCharacterGender,
    getCharacterSpecies,
    hasCharacterData,
    isProfileStale,
    requestProfileForCharacter,
    refreshProfile,
    getMessagesForCharacter,
    getSelectedChannelsForCharacter,
    isCharacterKnown,
    getProfileRequestStatus,
    markCharacterKnown,
    openPMChannel,
    getUnknownChannelsForCharacter,
    getUnknownChannelCountsForCharacter,
    hasUnreadActivityOnOtherCharacters,
    getTotalUnreadCountOnOtherCharacters,
    getUnreadCount,
    getTotalUnreadCountForCharacter,
    getUnreadCountsForCharacter,
    clearUnreadCountForChannel,
    getHighUrgencyUnreadCountForCharacter,
    getRegularUnreadCountForCharacter,
    updateTypingState,
    clearTypingState,
    getTypingState,
    characterTypingStates,
    clearAllUnreadCountsForCharacter,
    setFocusedChannel,
    ingestRecentMessages,
    ingestHistoryMessages,
    indexedDBReady,
    characterSelectedChannels,
    getLastMessageTime,
    addToJoinedChannels,
    loadMessagesForNewChannel,
    getJoinedChannelsForCharacter,
    reorderChannelsForCharacter
  } = useChatStore();
  
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
  const [typingToast, setTypingToast] = useState<{ fromCharacter: string; status: 'typing' | 'paused' | 'clear'; isPM: boolean } | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const messageListRef = useRef<{ scrollToBottom: () => void; scrollToBottomFast: () => void; isNearBottom: (thresholdPx?: number) => boolean; scrollToMessage: (messageId: string) => void }>(null);
  const pendingRecentMessagesRef = useRef<Record<string, Message[]>>({});
  const requestedRecentCharactersRef = useRef<Record<string, boolean>>({});
  const requestedChannelHistoryRef = useRef<Record<string, boolean>>({});
  
  // Draggable divider state
  const [friendsSectionHeight, setFriendsSectionHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('friendsSectionHeight');
      return saved ? parseInt(saved, 10) : 200;
    }
    return 200;
  });
  const [isResizingDivider, setIsResizingDivider] = useState(false);
  const [resizeStart, setResizeStart] = useState({ y: 0, height: 0 });
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for channel reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !activeCharacter) {
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = currentSelectedChannels.indexOf(active.id as string);
      const newIndex = currentSelectedChannels.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderChannelsForCharacter(activeCharacter, oldIndex, newIndex);
      }
    }
  };

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
    const senderGender = await getCharacterGender(message.sender);
    if (!senderGender && message.sender && message.sender !== activeCharacter) {
      console.log(`No gender data for ${message.sender}, requesting basic info...`);
      try {
        const basicInfo = await signalRService.getBasicInfo(message.sender);
        if (basicInfo.HasData) {
          console.log(`Retrieved basic info for ${message.sender}:`, basicInfo);
          // Store the basic info in lightweight character store
          const { addCharacter } = useLightweightCharacterStore.getState();
          await addCharacter(
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
    
    // Note: Unread count handling is now done in the store's addMessage method
    // to prevent unnecessary increments for messages in the currently selected channel

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
      const activeCharacterName = useCharacterIndexedDBStore.getState().activeCharacter;
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
        const hasData = await hasCharacterData(sender);
        const knownGender = await getCharacterGender(sender);
        
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
      console.debug('Profile fetch attempt failed:', e);
    }
   }, [addMessage, activeCharacter, selectedChannel, clearUnreadCountForChannel, addToSelectedChannels, getSelectedChannelsForCharacter, selectedChannels, notificationChannel, hasCharacterData, getCharacterGender, getProfileRequestStatus, markCharacterKnown, requestProfileForCharacter, refreshProfile, isNotificationReady, showPMNotification, openPMChannel, setSelectedChannel]);

  const flushPendingRecentMessages = useCallback((characterName?: string) => {
    const targetCharacter = characterName || activeCharacter;
    if (!targetCharacter) {
      return;
    }

    const isCharacterConnected = connections.some(
      (conn) => conn.characterName === targetCharacter && conn.isConnected
    );

    if (!isCharacterConnected) {
      return;
    }

    const pending = pendingRecentMessagesRef.current[targetCharacter];
    if (pending && pending.length > 0) {
      ingestRecentMessages(pending, targetCharacter);
      delete pendingRecentMessagesRef.current[targetCharacter];
    }

    const unassigned = pendingRecentMessagesRef.current.__unassigned__;
    if (unassigned && unassigned.length > 0) {
      ingestRecentMessages(unassigned, targetCharacter);
      delete pendingRecentMessagesRef.current.__unassigned__;
    }
  }, [activeCharacter, ingestRecentMessages, connections]);

  const handleReceiveRecentMessages = useCallback((recentMessages: Message[]) => {
    if (!recentMessages || recentMessages.length === 0) {
      console.error("No recent messages received");
      return;
    }

    const payloadCharacter = recentMessages[0]?.characterName;
    const targetCharacter = payloadCharacter || activeCharacter;

    if (targetCharacter) {
      const normalizedMessages: Message[] = recentMessages.map((msg) => ({
        ...msg,
        characterName: msg.characterName || targetCharacter,
      }));

      const isCharacterConnected = connections.some(
        (conn) => conn.characterName === targetCharacter && conn.isConnected
      );

      console.log('Persisting recent messages for character:', targetCharacter, 'isCharacterConnected', isCharacterConnected);
      ingestRecentMessages(normalizedMessages, targetCharacter);
      return;
    }

    const normalizedQueuedMessages = recentMessages.map((msg) => ({
      ...msg,
      characterName: msg.characterName || payloadCharacter || undefined,
    }));
    const bucketKey = payloadCharacter || '__unassigned__';
    const existing = pendingRecentMessagesRef.current[bucketKey] || [];
    pendingRecentMessagesRef.current[bucketKey] = [...existing, ...normalizedQueuedMessages];
  }, [ingestRecentMessages, activeCharacter, connections]);

  useEffect(() => {
    flushPendingRecentMessages();
  }, [flushPendingRecentMessages]);

  useEffect(() => {
    connections
      .filter((conn) => conn.isConnected && pendingRecentMessagesRef.current[conn.characterName]?.length)
      .forEach((conn) => flushPendingRecentMessages(conn.characterName));
  }, [connections, flushPendingRecentMessages]);

  useEffect(() => {
    if (!indexedDBReady) {
      return;
    }

    const requestBackfill = async () => {
      for (const connection of connections) {
        if (!connection.isConnected || !connection.characterName) {
          continue;
        }

        const characterName = connection.characterName;

        if (!requestedRecentCharactersRef.current[characterName]) {
          requestedRecentCharactersRef.current[characterName] = true;
          try {
            await signalRService.getRecentMessages(characterName);
          } catch (error) {
            console.error(`Failed to request recent messages for ${characterName}:`, error);
          }
        }

        const openChannels = characterSelectedChannels[characterName] || [];
        for (const channelId of openChannels) {
          const historyKey = `${characterName}:${channelId}`;
          if (requestedChannelHistoryRef.current[historyKey]) {
            continue;
          }
          requestedChannelHistoryRef.current[historyKey] = true;
          const lastMessageTime = getLastMessageTime(channelId, characterName);
          const since = lastMessageTime ?? new Date();
          try {
            await signalRService.getHistory(channelId, since, 200);
          } catch (error) {
            console.error(`Failed to request history for ${channelId} (${characterName}):`, error);
          }
        }
      }
    };

    requestBackfill();
  }, [indexedDBReady, connections, characterSelectedChannels, getLastMessageTime]);

  const handleReceiveHistory = useCallback((data: any) => {
    const channel = data.channel;
    const messages = data.messages || [];
    const characterName = activeCharacter || undefined;
    
    if (channel && characterName) {
      // Ensure the channel is added to joined channels if we're receiving history for it
      // This helps maintain the channel list when history is received
      const currentJoinedChannels = getJoinedChannelsForCharacter(characterName);
      if (!currentJoinedChannels.includes(channel)) {
        console.log(`Adding channel ${channel} to joined channels for ${characterName} based on history`);
        addToJoinedChannels([channel], characterName);
      }
    }
    
    if (messages.length > 0) {
      ingestHistoryMessages(messages, characterName);
    }
  }, [ingestHistoryMessages, activeCharacter, addToJoinedChannels, getJoinedChannelsForCharacter]);

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

  // Optimized useEffect for SignalR listeners - re-runs when connection changes
  useEffect(() => {
    console.log('Setting up SignalR listeners (optimized)');
    console.log('SignalR connection state:', signalRService.connectionState);
    console.log('SignalR connection ID:', signalRService.connection?.connectionId);
    
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
      console.debug('Profile error:', error);
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
      
      // Handle both camelCase and PascalCase property names
      const fromCharacter = data.FromCharacter || data.fromCharacter;
      const receivingCharacter = data.ReceivingCharacter || data.receivingCharacter;
      const status = data.Status || data.status;
      const timestamp = data.Timestamp || data.timestamp;
      
      // Only process typing notifications for PM channels
      if (receivingCharacter && fromCharacter && status) {
        const pmChannelId = `PRI-${fromCharacter}`;
        
        // Create typing state
        const typingState = {
          characterName: fromCharacter,
          status: status as 'typing' | 'paused' | 'clear',
          timestamp: new Date(timestamp || new Date().toISOString())
        };
        
        // Update typing state in store
        updateTypingState(receivingCharacter, pmChannelId, typingState);
        
        // Show toast notification if PM window is not currently open
        if (selectedChannel !== pmChannelId && (status === 'typing' || status === 'paused')) {
          console.log(`Typing notification from ${fromCharacter}: ${status} (PM window not open)`);
          setTypingToast({
            fromCharacter: fromCharacter,
            status: status as 'typing' | 'paused' | 'clear',
            isPM: true
          });
          
          // Show browser notification for typing status
          if (isNotificationReady) {
            showTypingNotification(fromCharacter, status as 'typing' | 'paused');
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
          console.debug('Unexpected profileData format:', typeof profileData, profileData);
        }

        // Update friend/bookmark status if online status is provided
        if (onlineStatus && characterName) {
          console.debug('Updating online status for character:', characterName, onlineStatus);
          
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
        console.debug('Failed to process profile data:', error);
      }
    });

    // Update connection status
    setConnected(signalRService.isConnected);

    return () => {
      // Cleanup listeners when component unmounts or effect re-runs
      console.log('Cleaning up SignalR listeners');
      signalRService.removeListener('ReceiveMessage', handleReceiveMessage);
      signalRService.removeListener('ReceiveRecentMessages', handleReceiveRecentMessages);
      signalRService.removeListener('ReceiveHistory', handleReceiveHistory);
      signalRService.removeListener('MessageQueued');
      signalRService.removeListener('QueuedMessagesProcessed');
      signalRService.removeListener('ProfileRequested');
      signalRService.removeListener('ProfileError');
      signalRService.removeListener('ProfileReceived');
      signalRService.removeListener('ChannelsSubscribed', handleChannelsSubscribed);
    };
  }, [handleReceiveMessage, handleReceiveRecentMessages, handleReceiveHistory, handleChannelsSubscribed, addProfile, setConnected, isNotificationReady, showTypingNotification, signalRService.connectionState, signalRService.connection?.connectionId]); // Re-run when callbacks change or SignalR connection changes

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
        useCharacterIndexedDBStore.getState().setActiveCharacter(newCharacterName);
        
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

  // Handle ChannelJoined events - add channel to list without changing active channel
  useEffect(() => {
    console.log('Setting up ChannelJoined listener');
    
    signalRService.onChannelJoined((data: { channel: string; characterName: string; message: string }) => {
      console.log('=== ChatInterface: ChannelJoined event received ===');
      console.log('Event data:', data);
      
      const channelId = data.channel;
      const characterName = data.characterName;

      console.log('channelId', channelId);
      console.log('characterName', characterName);
      
      if (!channelId || !characterName) {
        console.warn('ChannelJoined event missing required data:', data);
        return;
      }
      
      // Add channel to joined channels for this character
      addToJoinedChannels([channelId], characterName);
      console.log(`Added ${channelId} to joined channels for ${characterName}`);
      
      // Check if channel is already in selected channels
      const currentSelectedChannels = getSelectedChannelsForCharacter(characterName);
      const isAlreadySelected = currentSelectedChannels.includes(channelId);
      
      if (!isAlreadySelected) {
        // Add channel to selected channels (this will make it appear in the channel list)
        addToSelectedChannels([channelId], characterName);
        console.log(`Added ${channelId} to selected channels for ${characterName}`);
        
        // Load messages for the newly joined channel
        loadMessagesForNewChannel(characterName, channelId).catch(error => {
          console.error(`Failed to load messages for new channel ${channelId}:`, error);
        });
        
        // Only change the active channel if no channel is currently selected
        // AND this is for the active character
        if (characterName === activeCharacter && !selectedChannel) {
          console.log(`No channel currently selected, setting ${channelId} as active channel`);
          setSelectedChannel(channelId);
        } else {
          console.log(`Channel ${channelId} added to list but not changing active channel (current: ${selectedChannel})`);
        }
      } else {
        console.log(`Channel ${channelId} already in selected channels for ${characterName}`);
      }
    });
    
    return () => {
      console.log('Cleaning up ChannelJoined listener');
      signalRService.removeListener('ChannelJoined');
    };
  }, [activeCharacter, selectedChannel, addToJoinedChannels, addToSelectedChannels, getSelectedChannelsForCharacter, setSelectedChannel, loadMessagesForNewChannel]);

  useEffect(() => {
    // Smart autoscroll: only scroll to bottom if user is already near the bottom
    const nearBottom = messageListRef.current?.isNearBottom?.(220);
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

  // Clear unread when switching to a channel (including PMs) and set focused channel
  useEffect(() => {
    if (selectedChannel && activeCharacter) {
      clearUnreadCountForChannel(activeCharacter, selectedChannel);
      setFocusedChannel(activeCharacter, selectedChannel);
    }
  }, [selectedChannel, activeCharacter, clearUnreadCountForChannel, setFocusedChannel]);

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
    console.log('Joining channels:', channels, 'for character:', activeCharacter);
    try {
      // Actually join the channels via SignalR with the active character
      // The store will be updated when we receive ChannelsSubscribed confirmation
      await signalRService.subscribeToChannels(channels, activeCharacter || undefined);
      
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
      signalRService.subscribeToChannels([notificationChannel], activeCharacter || undefined);
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

  // Load profile data when selectedProfileCharacter changes
  useEffect(() => {
    const loadProfileData = async () => {
      if (selectedProfileCharacter && showProfileModal) {
        setIsLoadingProfile(true);
        try {
          // Request profile if not already available
          const hasData = await hasCharacterData(selectedProfileCharacter);
          if (!hasData) {
            requestProfileForCharacter(selectedProfileCharacter);
          }
        } catch (error) {
          console.debug('Failed to load profile:', error);
        } finally {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfileData();
  }, [selectedProfileCharacter, showProfileModal, hasCharacterData, requestProfileForCharacter]);

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
    if (!selectedChannel || !activeCharacter) return;
    try {
      setIsForceJoining(true);
      await signalRService.joinChannelForCharacter(activeCharacter, selectedChannel);
      addToSelectedChannels([selectedChannel], activeCharacter);
    } catch (error) {
      console.error('Failed to force join channel:', error);
      alert('Failed to force join channel.');
    } finally {
      setIsForceJoining(false);
    }
  };

  const handleChannelContextMenu = (e: React.MouseEvent, channel: string) => {
    // Allow browser context menu if Ctrl/Cmd is held
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    
    e.preventDefault();
    setChannelMenu({ x: e.clientX, y: e.clientY, channel });
  };

  const handleCloseChannel = async (channel: string) => {
    // Leave the channel on the backend first
    if (activeCharacter) {
      try {
        await signalRService.leaveChannelForCharacter(activeCharacter, channel);
      } catch (error) {
        console.error('Failed to leave channel on backend:', error);
        // Continue with local cleanup even if backend call fails
      }
    }

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

  // Handle divider resize mouse down
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingDivider(true);
    setResizeStart({
      y: e.clientY,
      height: friendsSectionHeight
    });
  };

  // Handle divider resize mouse move and mouse up
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingDivider && sidebarRef.current) {
        const sidebarRect = sidebarRef.current.getBoundingClientRect();
        const newHeight = resizeStart.height + (e.clientY - resizeStart.y);
        
        // Apply constraints: min 100px, max 70% of sidebar height
        const minHeight = 100;
        const maxHeight = sidebarRect.height * 0.7;
        const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
        
        setFriendsSectionHeight(constrainedHeight);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isResizingDivider && sidebarRef.current) {
        const sidebarRect = sidebarRef.current.getBoundingClientRect();
        const newHeight = resizeStart.height + (e.clientY - resizeStart.y);
        
        // Apply constraints: min 100px, max 70% of sidebar height
        const minHeight = 100;
        const maxHeight = sidebarRect.height * 0.7;
        const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
        
        setIsResizingDivider(false);
        // Save to localStorage using the calculated height
        if (typeof window !== 'undefined') {
          localStorage.setItem('friendsSectionHeight', constrainedHeight.toString());
        }
      }
    };

    if (isResizingDivider) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingDivider, resizeStart]);

  return (
    <div className="flex h-screen bg-gray-900" onClick={handleGlobalClick}>
      {/* Sidebar - Hidden on mobile */}
      <div ref={sidebarRef} className="hidden lg:flex w-64 bg-gray-800 shadow-md flex-col">
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
        <div 
          className="overflow-y-auto flex-shrink-0"
          style={{ height: `${friendsSectionHeight}px` }}
        >
          <div className="p-4">
            <FriendsList onOpenPM={handleOpenPM} />
          </div>
        </div>

        {/* Draggable Divider */}
        <div
          onMouseDown={handleDividerMouseDown}
          className={`relative flex-shrink-0 cursor-row-resize bg-gray-700 hover:bg-gray-600 transition-colors group ${
            isResizingDivider ? 'bg-gray-500' : ''
          }`}
          style={{ height: '6px' }}
          title="Drag to resize"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`w-16 h-0.5 rounded transition-colors ${
              isResizingDivider ? 'bg-gray-400' : 'bg-gray-500 group-hover:bg-gray-400'
            }`}></div>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto min-h-0">
          <h3 className="font-semibold text-sm text-gray-300 mb-2">Channels & Messages</h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={currentSelectedChannels}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1 mb-4">
                {currentSelectedChannels.map((channel) => {
                  const isPM = channel.startsWith('PRI-');
                  const typingState = activeCharacter ? getTypingState(activeCharacter, channel) : null;
                  return (
                    <SortableChannelItem
                      key={channel}
                      channel={channel}
                      isPM={isPM}
                      typingState={typingState}
                      selectedChannel={selectedChannel}
                      currentUnreadCounts={currentUnreadCounts}
                      getChannelDisplayName={getChannelDisplayName}
                      getTypingState={getTypingState}
                      activeCharacter={activeCharacter}
                      onChannelClick={setSelectedChannel}
                      onContextMenu={handleChannelContextMenu}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          {/* Character Activity Overview */}
          {activeCharacter && (
            <div>
              <h3 
                className="font-semibold text-sm text-gray-400 mb-2 flex items-center cursor-pointer hover:text-gray-300"
                onContextMenu={(e) => {
                  e.preventDefault();
                  const hasUnreadActivity = connections.some(connection => {
                    const totalUnreadCount = getHighUrgencyUnreadCountForCharacter(connection.characterName) + 
                                           getRegularUnreadCountForCharacter(connection.characterName);
                    return totalUnreadCount > 0;
                  });
                  
                  if (hasUnreadActivity) {
                    if (confirm('Mark all unread messages as read for all characters?')) {
                      connections.forEach(connection => {
                        clearAllUnreadCountsForCharacter(connection.characterName);
                      });
                    }
                  }
                }}
                title="Right-click to mark all as read"
              >
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
                      signalRService.subscribeToChannels([channel], activeCharacter || undefined);
                      setSelectedChannel(channel);
                    }}
                    className="w-full text-left px-3 py-2 rounded text-sm text-yellow-300 hover:bg-yellow-600 hover:bg-opacity-20 border border-yellow-600 border-opacity-30"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Hash size={16} className="text-gray-400 mr-1" />
                        <span>{getChannelDisplayName(channel)}</span>
                      </div>
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
          <div className="flex flex-col items-start space-y-1">
            <div className="text-xs text-gray-500">
              v{getAppVersion()}
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-gray-200"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header - Hidden on mobile */}
        <div className="hidden lg:block bg-gray-800 shadow-sm p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {selectedChannel && (
                <span className="mr-2">
                  {selectedChannel.startsWith('PRI-') ? (
                    <MessageSquare size={20} className="text-gray-400" />
                  ) : (
                    <Hash size={20} className="text-gray-400" />
                  )}
                </span>
              )}
              <h1 className="font-semibold text-lg text-white">
                {selectedChannel ?
                  getChannelDisplayName(selectedChannel) :
                  'Select a channel'
                }
              </h1>
            </div>
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
                  placeholder={`Message ${getChannelDisplayName(selectedChannel)}... Use [b], [i], [u] for formatting`}
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
          isPM={typingToast.isPM}
          onDismiss={() => setTypingToast(null)}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={handleCloseProfileModal}
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={currentSelectedChannels}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1 mb-4">
                {currentSelectedChannels.map((channel) => {
                  const isPM = channel.startsWith('PRI-');
                  const typingState = activeCharacter ? getTypingState(activeCharacter, channel) : null;
                  return (
                    <SortableChannelItem
                      key={channel}
                      channel={channel}
                      isPM={isPM}
                      typingState={typingState}
                      selectedChannel={selectedChannel}
                      currentUnreadCounts={currentUnreadCounts}
                      getChannelDisplayName={getChannelDisplayName}
                      getTypingState={getTypingState}
                      activeCharacter={activeCharacter}
                      onChannelClick={(channel) => {
                        setSelectedChannel(channel);
                        setActiveMobileTab(null);
                      }}
                      onContextMenu={handleChannelContextMenu}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

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