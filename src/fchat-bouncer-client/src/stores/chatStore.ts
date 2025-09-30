import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ChatState, Message, ConnectionStatus, Channel, ProfileData, TypingState, LightweightCharacterData } from '@/types';
import { generateMessageId } from '@/lib/messages/messageUtils';
import { api, setTokenRefreshCallback } from '@/lib/api';
import { useAuthStore } from './authStore';
import { useLightweightCharacterStore } from './lightweightCharacterStore';
import { useProfileStore } from './profileStore';
import { messageIndexedDBService } from '@/lib/messageIndexedDB';

interface ChatStore extends ChatState {
  // Character-scoped data
  characterMessages: Record<string, Message[]>; // characterName -> messages
  characterSelectedChannels: Record<string, string[]>; // characterName -> channels
  characterJoinedChannels: Record<string, string[]>; // characterName -> actually joined channels
  characterConnectionStatus: Record<string, ConnectionStatus>; // characterName -> status
  characterChannelMetadata: Record<string, Record<string, Channel>>; // characterName -> channelId -> metadata
  characterUnknownChannels: Record<string, Set<string>>; // characterName -> unknown channels
  characterUnknownChannelCounts: Record<string, Record<string, number>>; // characterName -> channelId -> count
  characterUnreadCounts: Record<string, Record<string, number>>; // characterName -> channelId -> unread count
  
  // Lazy loading state
  characterLazyLoadingState: Record<string, Record<string, {
    hasMore: boolean;
    isLoading: boolean;
    oldestMessageTime: Date | null;
    loadedMessageCount: number;
  }>>; // characterName -> channelId -> lazy loading state
  
  // Global data (shared across characters)
  knownCharacters: Set<string>;
  
  // Typing indicators state (character-scoped)
  characterTypingStates: Record<string, Record<string, TypingState>>; // characterName -> channelId -> typing state
  
  // Legacy fields (for backward compatibility)
  messages: Message[];
  selectedChannels: string[];
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  unknownChannels: Set<string>;
  unknownChannelCounts: Record<string, number>;
  channelMetadata: Record<string, Channel>;

  // Character-scoped methods
  addMessage: (message: Message, characterName?: string) => void;
  addMessages: (messages: Message[], characterName?: string) => void;
  setConnectionStatus: (status: ConnectionStatus, characterName?: string) => void;
  setConnected: (connected: boolean, characterName?: string) => void;
  setSelectedChannels: (channels: string[], characterName?: string) => void;
  addToSelectedChannels: (channels: string[], characterName?: string) => void;
  removeFromSelectedChannels: (channels: string[], characterName?: string) => void;
  setJoinedChannels: (channels: string[], characterName: string) => void;
  addToJoinedChannels: (channels: string[], characterName: string) => void;
  removeFromJoinedChannels: (channels: string[], characterName: string) => void;
  openPMChannel: (friendName: string, characterName?: string) => void;
  getMessagesForCharacter: (characterName: string) => Message[];
  getSelectedChannelsForCharacter: (characterName: string) => string[];
  getJoinedChannelsForCharacter: (characterName: string) => string[];
  getConnectionStatusForCharacter: (characterName: string) => ConnectionStatus;
  clearMessagesForCharacter: (characterName: string) => void;
  setChannelMetadata: (channels: Channel[], characterName?: string) => void;
  getChannelDisplayName: (channelId: string, characterName?: string) => string;
  mergeHistoryMessages: (messages: Message[], characterName?: string) => void;
  getLastMessageTime: (channel?: string, characterName?: string) => Date | null;
  
  // Lazy loading methods
  getMessagesForChannel: (characterName: string, channelId: string, limit?: number) => Message[];
  getDisplayMessagesForChannel: (characterName: string, channelId: string, displayLimit?: number) => Message[];
  loadMoreMessages: (characterName: string, channelId: string) => Promise<void>;
  checkAndLoadMissingMessages: (characterName: string, channelId: string) => Promise<void>;
  getLazyLoadingState: (characterName: string, channelId: string) => {
    hasMore: boolean;
    isLoading: boolean;
    oldestMessageTime: Date | null;
    loadedMessageCount: number;
  };
  setLazyLoadingState: (characterName: string, channelId: string, state: {
    hasMore?: boolean;
    isLoading?: boolean;
    oldestMessageTime?: Date | null;
    loadedMessageCount?: number;
  }) => void;
  initializeLazyLoading: (characterName: string, channelId: string, initialMessages: Message[]) => void;
  
  // Enhanced scrollback methods
  trimChannelMessages: (characterName: string, channelId: string, maxMessages?: number) => void;
  getLocalMessagesForChannel: (characterName: string, channelId: string, beforeTime?: Date, limit?: number) => Message[];
  hasMoreLocalMessages: (characterName: string, channelId: string, beforeTime?: Date) => boolean;
  clearLazyLoadingState: (characterName: string, channelId: string) => void;
  
  // Profile management (global) - now delegated to profileStore
  addProfile: (characterName: string, profileData: ProfileData) => Promise<void>;
  getProfile: (characterName: string) => Promise<ProfileData | null>;
  getCharacterGender: (characterName: string) => Promise<string | null>;
  getCharacterSpecies: (characterName: string) => Promise<string | null>;
  hasCharacterData: (characterName: string) => Promise<boolean>;
  markCharacterKnown: (characterName: string) => void;
  isCharacterKnown: (characterName: string) => boolean;
  requestProfileForCharacter: (characterName: string) => void;
  refreshProfile: (characterName: string) => Promise<ProfileData | null>;
  getProfileRequestStatus: (characterName: string) => 'idle' | 'requesting' | 'failed' | 'success';
  isProfileStale: (characterName: string) => boolean;
  
  // Character-scoped unknown channels
  addUnknownChannelForCharacter: (channel: string, characterName: string) => void;
  clearUnknownChannelForCharacter: (channel: string, characterName: string) => void;
  getUnknownChannelsForCharacter: (characterName: string) => Set<string>;
  getUnknownChannelCountsForCharacter: (characterName: string) => Record<string, number>;
  hasUnreadActivityOnOtherCharacters: (currentCharacter: string) => boolean;
  getTotalUnreadCountOnOtherCharacters: (currentCharacter: string) => number;
  
  // Unread count management
  incrementUnreadCount: (characterName: string, channelId: string, count?: number) => void;
  clearUnreadCount: (characterName: string, channelId: string) => void;
  getUnreadCount: (characterName: string, channelId: string) => number;
  getTotalUnreadCountForCharacter: (characterName: string) => number;
  getUnreadCountsForCharacter: (characterName: string) => Record<string, number>;
  clearUnreadCountForChannel: (characterName: string, channelId: string) => void;
  
  // High-urgency alert management
  isHighUrgencyChannel: (channelId: string) => boolean;
  getHighUrgencyUnreadCountForCharacter: (characterName: string) => number;
  getRegularUnreadCountForCharacter: (characterName: string) => number;
  
  // Typing indicators management
  updateTypingState: (characterName: string, channelId: string, typingState: TypingState | null) => void;
  getTypingState: (characterName: string, channelId: string) => TypingState | null;
  clearTypingState: (characterName: string, channelId: string) => void;
  getTypingDisplayText: (characterName: string, channelId: string) => string;
  
  // Legacy methods (for backward compatibility)
  addUnknownChannel: (channel: string) => void;
  clearUnknownChannel: (channel: string) => void;
  clearMessages: () => void;
  clearAllHistory: () => void;
  
  // Storage management
  cleanupStorage: () => void;
  getStorageSize: () => number;
  
  // IndexedDB message management
  loadMessagesFromIndexedDB: (characterName: string, channelId?: string, limit?: number) => Promise<Message[]>;
  loadAllMessagesFromIndexedDB: () => Promise<void>;
  loadMessagesForCharacter: (characterName: string) => Promise<void>;
}

// Storage quota management utilities
const STORAGE_QUOTA_LIMIT = 15 * 1024 * 1024; // 15MB limit
const MAX_MESSAGES_PER_CHANNEL = 500; // Limit messages per channel
const MAX_MESSAGES_PER_CHARACTER = 1000; // Limit total messages per character

function estimateStorageSize(data: any): number {
  return new Blob([JSON.stringify(data)]).size;
}

function cleanupOldMessages(characterMessages: Record<string, Message[]>): Record<string, Message[]> {
  const cleaned: Record<string, Message[]> = {};
  
  for (const [characterName, messages] of Object.entries(characterMessages)) {
    if (messages.length <= MAX_MESSAGES_PER_CHARACTER) {
      cleaned[characterName] = messages;
      continue;
    }
    
    // Keep only the most recent messages
    const sortedMessages = messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    cleaned[characterName] = sortedMessages.slice(-MAX_MESSAGES_PER_CHARACTER);
    console.log(`Cleaned up ${messages.length - MAX_MESSAGES_PER_CHARACTER} old messages for ${characterName}`);
  }
  
  return cleaned;
}

function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.code === DOMException.QUOTA_EXCEEDED_ERR) {
      console.warn('localStorage quota exceeded, attempting cleanup...');
      
      // Try to free up space by removing old data
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const currentKey = localStorage.key(i);
        if (currentKey && currentKey !== key && currentKey.startsWith('chat-storage')) {
          keysToRemove.push(currentKey);
        }
      }
      
      // Remove old storage entries
      keysToRemove.forEach(k => localStorage.removeItem(k));
      
      try {
        localStorage.setItem(key, value);
        console.log('Successfully stored after cleanup');
        return true;
      } catch (retryError) {
        console.error('Still unable to store after cleanup:', retryError);
        return false;
      }
    }
    console.error('localStorage error:', error);
    return false;
  }
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // Character-scoped data
      characterMessages: {},
      characterSelectedChannels: {},
      characterJoinedChannels: {},
      characterConnectionStatus: {},
      characterChannelMetadata: {},
      characterUnknownChannels: {},
      characterUnknownChannelCounts: {},
      characterUnreadCounts: {},
      characterLazyLoadingState: {},
      
      // Global data
      knownCharacters: new Set<string>(),
      
      // Typing indicators state
      characterTypingStates: {},
      
      // Legacy fields (for backward compatibility)
      messages: [],
      selectedChannels: [],
      connectionStatus: {
        isConnected: false,
        status: 'Disconnected',
        lastActivity: new Date().toISOString(),
      },
      isConnected: false,
      unknownChannels: new Set<string>(),
      unknownChannelCounts: {},
      channelMetadata: {},

      // Character-scoped methods
      addMessage: (message: Message, characterName?: string) => {
        const messageWithId = {
          ...message,
          id: message.id || generateMessageId()
        };

        // Store message in IndexedDB if character is specified
        if (characterName && message.channel) {
          messageIndexedDBService.storeMessage(characterName, message.channel, messageWithId).catch(error => {
            console.error('Failed to store message in IndexedDB:', error);
          });
        }

        set((state) => {
          // If no character specified, use legacy behavior
          if (!characterName) {
            const isDuplicate = state.messages.some(existingMsg =>
              existingMsg.id === messageWithId.id ||
              (existingMsg.timestamp === messageWithId.timestamp &&
               existingMsg.sender === messageWithId.sender &&
               existingMsg.content === messageWithId.content &&
               existingMsg.channel === messageWithId.channel)
            );

            if (isDuplicate) return state;

            return {
              messages: [...state.messages, messageWithId]
            };
          }

          // Character-scoped behavior
          const characterMessages = state.characterMessages[characterName] || [];
          const isDuplicate = characterMessages.some(existingMsg =>
            existingMsg.id === messageWithId.id ||
            (existingMsg.timestamp === messageWithId.timestamp &&
             existingMsg.sender === messageWithId.sender &&
             existingMsg.content === messageWithId.content &&
             existingMsg.channel === messageWithId.channel)
          );

          if (isDuplicate) return state;

          // Clean up old messages before adding new one
          const cleanedMessages = cleanupOldMessages({
            ...state.characterMessages,
            [characterName]: [...characterMessages, messageWithId]
          });

          const newState: Partial<ChatStore> = {
            characterMessages: cleanedMessages
          };

          // Handle unread counts for all messages
          const isPM = message.channel && message.channel.startsWith('PRI-');
          const isActiveCharacter = message.isActiveCharacter === true;
          
          // Always increment unread count for PMs (even if window is open)
          // For regular channels, increment for all messages (the component will clear it for the active channel)
          if (message.channel) {
            const currentUnreadCounts = state.characterUnreadCounts[characterName] || {};
            const newUnreadCounts = { ...currentUnreadCounts };
            const oldCount = newUnreadCounts[message.channel] || 0;
            newUnreadCounts[message.channel] = oldCount + 1;
            
            newState.characterUnreadCounts = {
              ...state.characterUnreadCounts,
              [characterName]: newUnreadCounts
            };
          }

          // Check if message is from an unknown channel for this character
          // A channel is "unknown" if it's not in the selected channels (what's open in the UI)
          const selectedChannels = state.characterSelectedChannels[characterName] || [];
          if (message.channel && !selectedChannels.includes(message.channel)) {
            // Add to character-specific unknown channels
            const currentUnknownChannels = state.characterUnknownChannels[characterName] || new Set();
            const newUnknownChannels = new Set(currentUnknownChannels);
            newUnknownChannels.add(message.channel);

            const currentCounts = state.characterUnknownChannelCounts[characterName] || {};
            const newCounts = { ...currentCounts };
            newCounts[message.channel] = (newCounts[message.channel] || 0) + 1;

            newState.characterUnknownChannels = {
              ...state.characterUnknownChannels,
              [characterName]: newUnknownChannels
            };
            newState.characterUnknownChannelCounts = {
              ...state.characterUnknownChannelCounts,
              [characterName]: newCounts
            };

            // Also maintain legacy global state for backward compatibility
            const globalUnknownChannels = new Set(state.unknownChannels);
            globalUnknownChannels.add(message.channel);
            const globalCounts = { ...state.unknownChannelCounts };
            globalCounts[message.channel] = (globalCounts[message.channel] || 0) + 1;
            
            newState.unknownChannels = globalUnknownChannels;
            newState.unknownChannelCounts = globalCounts;
          }

          // Only request profile if we don't know the sender's gender
          if (messageWithId.sender) {
            const profileStore = useProfileStore.getState();
            const status = profileStore.getProfileRequestStatus(messageWithId.sender);
            
            if (status === 'idle') {
              // Check if we have a profile and if it's stale
              profileStore.hasProfile(messageWithId.sender).then(hasProfile => {
                if (!hasProfile || profileStore.isProfileStale(messageWithId.sender)) {
                  setTimeout(() => {
                    get().requestProfileForCharacter(messageWithId.sender);
                  }, 0);
                }
              });
            }
          }

          return newState;
        });
      },

      addMessages: (messages: Message[], characterName?: string) => {
        // Store messages in IndexedDB if character is specified
        if (characterName) {
          messages.forEach(message => {
            if (message.channel) {
              messageIndexedDBService.storeMessage(characterName, message.channel, message).catch(error => {
                console.error('Failed to store message in IndexedDB:', error);
              });
            }
          });
        }

        if (!characterName) {
          // Legacy behavior
          set((state) => ({
            messages: [...state.messages, ...messages]
          }));
          return;
        }

        set((state) => {
          const existingMessages = state.characterMessages[characterName] || [];
          const newMessages = messages.filter(newMsg => 
            !existingMessages.some(existingMsg => 
              existingMsg.id === newMsg.id ||
              (existingMsg.timestamp === newMsg.timestamp &&
               existingMsg.sender === newMsg.sender &&
               existingMsg.content === newMsg.content &&
               existingMsg.channel === newMsg.channel)
            )
          );

          return {
            characterMessages: {
              ...state.characterMessages,
              [characterName]: [...existingMessages, ...newMessages]
            }
          };
        });
      },

      setConnectionStatus: (status: ConnectionStatus, characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          set(() => ({ connectionStatus: status }));
          return;
        }

        set((state) => ({
          characterConnectionStatus: {
            ...state.characterConnectionStatus,
            [characterName]: status
          }
        }));
      },

      setConnected: (connected: boolean, characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          set(() => ({ isConnected: connected }));
          return;
        }

        set((state) => ({
          characterConnectionStatus: {
            ...state.characterConnectionStatus,
            [characterName]: {
              ...state.characterConnectionStatus[characterName],
              isConnected: connected,
              lastActivity: new Date().toISOString()
            }
          }
        }));
      },

      setSelectedChannels: (channels: string[], characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          set(() => ({ selectedChannels: channels }));
          return;
        }

        set((state) => ({
          characterSelectedChannels: {
            ...state.characterSelectedChannels,
            [characterName]: channels
          }
        }));
      },

      addToSelectedChannels: (channels: string[], characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          set((state) => {
            const newSelectedChannels = Array.from(new Set([...state.selectedChannels, ...channels]));
            
            // Clear unknown channels that are now selected
            const newUnknownChannels = new Set(state.unknownChannels);
            const newUnknownCounts = { ...state.unknownChannelCounts };
            
            channels.forEach(channel => {
              newUnknownChannels.delete(channel);
              delete newUnknownCounts[channel];
            });
            
            return {
              selectedChannels: newSelectedChannels,
              unknownChannels: newUnknownChannels,
              unknownChannelCounts: newUnknownCounts
            };
          });
          return;
        }

        set((state) => {
          const currentChannels = state.characterSelectedChannels[characterName] || [];
          const newChannels = Array.from(new Set([...currentChannels, ...channels]));
          
          // Clear unknown channels that are now selected for this character
          const currentUnknownChannels = state.characterUnknownChannels[characterName] || new Set();
          const newCharacterUnknownChannels = new Set(currentUnknownChannels);
          const currentCounts = state.characterUnknownChannelCounts[characterName] || {};
          const newCharacterCounts = { ...currentCounts };
          
          channels.forEach(channel => {
            newCharacterUnknownChannels.delete(channel);
            delete newCharacterCounts[channel];
          });
          
          // Also clear from global state for backward compatibility
          const newGlobalUnknownChannels = new Set(state.unknownChannels);
          const newGlobalCounts = { ...state.unknownChannelCounts };
          
          channels.forEach(channel => {
            newGlobalUnknownChannels.delete(channel);
            delete newGlobalCounts[channel];
          });
          
          return {
            characterSelectedChannels: {
              ...state.characterSelectedChannels,
              [characterName]: newChannels
            },
            characterUnknownChannels: {
              ...state.characterUnknownChannels,
              [characterName]: newCharacterUnknownChannels
            },
            characterUnknownChannelCounts: {
              ...state.characterUnknownChannelCounts,
              [characterName]: newCharacterCounts
            },
            unknownChannels: newGlobalUnknownChannels,
            unknownChannelCounts: newGlobalCounts
          };
        });
      },

      removeFromSelectedChannels: (channels: string[], characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          set((state) => ({
            selectedChannels: state.selectedChannels.filter(channel => !channels.includes(channel))
          }));
          return;
        }

        set((state) => {
          const currentChannels = state.characterSelectedChannels[characterName] || [];
          const newChannels = currentChannels.filter(channel => !channels.includes(channel));
          
          return {
            characterSelectedChannels: {
              ...state.characterSelectedChannels,
              [characterName]: newChannels
            }
          };
        });
      },

      openPMChannel: (friendName: string, characterName?: string) => {
        const pmChannelId = `PRI-${friendName}`;
        
        if (!characterName) {
          // Legacy behavior
          set((state) => {
            const newSelectedChannels = Array.from(new Set([...state.selectedChannels, pmChannelId]));
            
            // Clear unknown channels that are now selected
            const newUnknownChannels = new Set(state.unknownChannels);
            const newUnknownCounts = { ...state.unknownChannelCounts };
            
            if (newUnknownChannels.has(pmChannelId)) {
              newUnknownChannels.delete(pmChannelId);
              delete newUnknownCounts[pmChannelId];
            }
            
            return {
              selectedChannels: newSelectedChannels,
              unknownChannels: newUnknownChannels,
              unknownChannelCounts: newUnknownCounts
            };
          });
          return;
        }

        set((state) => {
          const currentChannels = state.characterSelectedChannels[characterName] || [];
          const newChannels = Array.from(new Set([...currentChannels, pmChannelId]));
          
          // Clear unknown channels that are now selected for this character
          const currentUnknownChannels = state.characterUnknownChannels[characterName] || new Set();
          const newCharacterUnknownChannels = new Set(currentUnknownChannels);
          const currentCounts = state.characterUnknownChannelCounts[characterName] || {};
          const newCharacterCounts = { ...currentCounts };
          
          if (newCharacterUnknownChannels.has(pmChannelId)) {
            newCharacterUnknownChannels.delete(pmChannelId);
            delete newCharacterCounts[pmChannelId];
          }
          
          // Also clear from global state for backward compatibility
          const newGlobalUnknownChannels = new Set(state.unknownChannels);
          const newGlobalCounts = { ...state.unknownChannelCounts };
          
          if (newGlobalUnknownChannels.has(pmChannelId)) {
            newGlobalUnknownChannels.delete(pmChannelId);
            delete newGlobalCounts[pmChannelId];
          }
          
          return {
            characterSelectedChannels: {
              ...state.characterSelectedChannels,
              [characterName]: newChannels
            },
            characterUnknownChannels: {
              ...state.characterUnknownChannels,
              [characterName]: newCharacterUnknownChannels
            },
            characterUnknownChannelCounts: {
              ...state.characterUnknownChannelCounts,
              [characterName]: newCharacterCounts
            },
            unknownChannels: newGlobalUnknownChannels,
            unknownChannelCounts: newGlobalCounts
          };
        });
      },

      getMessagesForCharacter: (characterName: string) => {
        const currentState = get();
        const messages = currentState.characterMessages[characterName] || [];
        
        // If no messages in memory, try to load from IndexedDB in background
        if (messages.length === 0 && characterName) {
          currentState.loadMessagesForCharacter(characterName).catch(error => {
            console.error(`Failed to load messages for ${characterName}:`, error);
          });
        }
        
        return messages;
      },

      getSelectedChannelsForCharacter: (characterName: string) => {
        return get().characterSelectedChannels[characterName] || [];
      },

      setJoinedChannels: (channels: string[], characterName: string) => {
        set((state) => ({
          characterJoinedChannels: {
            ...state.characterJoinedChannels,
            [characterName]: channels
          }
        }));
      },

      addToJoinedChannels: (channels: string[], characterName: string) => {
        set((state) => {
          const currentChannels = state.characterJoinedChannels[characterName] || [];
          const newChannels = Array.from(new Set([...currentChannels, ...channels]));
          
          return {
            characterJoinedChannels: {
              ...state.characterJoinedChannels,
              [characterName]: newChannels
            }
          };
        });
      },

      removeFromJoinedChannels: (channels: string[], characterName: string) => {
        set((state) => {
          const currentChannels = state.characterJoinedChannels[characterName] || [];
          const newChannels = currentChannels.filter(channel => !channels.includes(channel));
          
          return {
            characterJoinedChannels: {
              ...state.characterJoinedChannels,
              [characterName]: newChannels
            }
          };
        });
      },

      getJoinedChannelsForCharacter: (characterName: string) => {
        return get().characterJoinedChannels[characterName] || [];
      },

      getConnectionStatusForCharacter: (characterName: string) => {
        return get().characterConnectionStatus[characterName] || {
          isConnected: false,
          status: 'Disconnected',
          lastActivity: new Date().toISOString()
        };
      },

      clearMessagesForCharacter: (characterName: string) => {
        set((state) => ({
          characterMessages: {
            ...state.characterMessages,
            [characterName]: []
          }
        }));
      },

      setChannelMetadata: (channels: Channel[], characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          const metadata = channels.reduce((acc, channel) => {
            acc[channel.id] = channel;
            return acc;
          }, {} as Record<string, Channel>);
          
          set(() => ({ channelMetadata: metadata }));
          return;
        }

        const metadata = channels.reduce((acc, channel) => {
          acc[channel.id] = channel;
          return acc;
        }, {} as Record<string, Channel>);

        set((state) => ({
          characterChannelMetadata: {
            ...state.characterChannelMetadata,
            [characterName]: metadata
          }
        }));
      },

      getChannelDisplayName: (channelId: string, characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          const metadata = get().channelMetadata;
          return metadata[channelId]?.title || metadata[channelId]?.name || channelId;
        }

        const characterMetadata = get().characterChannelMetadata[characterName] || {};
        return characterMetadata[channelId]?.title || characterMetadata[channelId]?.name || channelId;
      },

      mergeHistoryMessages: (messages: Message[], characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          set((state) => {
            const existingIds = new Set(state.messages.map(m => m.id));
            const newMessages = messages.filter(m => !existingIds.has(m.id));
            return {
              messages: [...newMessages, ...state.messages]
            };
          });
          return;
        }

        set((state) => {
          const existingMessages = state.characterMessages[characterName] || [];
          const existingIds = new Set(existingMessages.map(m => m.id));
          const newMessages = messages.filter(m => !existingIds.has(m.id));
          
          return {
            characterMessages: {
              ...state.characterMessages,
              [characterName]: [...newMessages, ...existingMessages]
            }
          };
        });
      },

      getLastMessageTime: (channel?: string, characterName?: string) => {
        if (!characterName) {
          // Legacy behavior
          const messages = get().messages;
          const channelMessages = channel ? messages.filter(m => m.channel === channel) : messages;
          if (channelMessages.length === 0) return null;
          
          const latestMessage = channelMessages.reduce((latest, current) => 
            new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
          );
          return new Date(latestMessage.timestamp);
        }

        const messages = get().characterMessages[characterName] || [];
        const channelMessages = channel ? messages.filter(m => m.channel === channel) : messages;
        if (channelMessages.length === 0) return null;
        
        const latestMessage = channelMessages.reduce((latest, current) => 
          new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
        );
        return new Date(latestMessage.timestamp);
      },

      // Profile management (global - shared across characters) - now delegated to profileStore
      addProfile: async (characterName: string, profileData: ProfileData) => {
        // Always store lightweight data (gender + species)
        const lightweightStore = useLightweightCharacterStore.getState();
        const species = profileData.info?.species || profileData.info?.Species || 'Unknown';
        lightweightStore.addCharacter(characterName, profileData.gender, species);
        
        // Store in IndexedDB via profileStore
        const profileStore = useProfileStore.getState();
        await profileStore.addProfile(characterName, profileData);
        
        get().markCharacterKnown(characterName);
      },

      getProfile: async (characterName: string) => {
        const profileStore = useProfileStore.getState();
        return await profileStore.getProfile(characterName);
      },

      getCharacterGender: async (characterName: string) => {
        // First try full profile, then lightweight storage
        const profileStore = useProfileStore.getState();
        const fullProfile = await profileStore.getProfile(characterName);
        if (fullProfile) {
          return fullProfile.gender;
        }
        
        const lightweightStore = useLightweightCharacterStore.getState();
        const lightweightData = lightweightStore.getCharacter(characterName);
        return lightweightData?.gender || null;
      },

      getCharacterSpecies: async (characterName: string) => {
        // First try full profile, then lightweight storage
        const profileStore = useProfileStore.getState();
        const fullProfile = await profileStore.getProfile(characterName);
        if (fullProfile) {
          return fullProfile.info?.species || fullProfile.info?.Species || 'Unknown';
        }
        
        const lightweightStore = useLightweightCharacterStore.getState();
        const lightweightData = lightweightStore.getCharacter(characterName);
        return lightweightData?.species || null;
      },

      hasCharacterData: async (characterName: string) => {
        // Check both full profile and lightweight storage
        const profileStore = useProfileStore.getState();
        const hasFullProfile = await profileStore.hasProfile(characterName);
        if (hasFullProfile) return true;
        
        const lightweightStore = useLightweightCharacterStore.getState();
        return lightweightStore.hasCharacter(characterName);
      },

      markCharacterKnown: (characterName: string) => {
        set((state) => ({
          knownCharacters: new Set([...Array.from(state.knownCharacters), characterName])
        }));
      },

      isCharacterKnown: (characterName: string) => {
        return get().knownCharacters.has(characterName);
      },

      requestProfileForCharacter: async (characterName: string) => {
        const profileStore = useProfileStore.getState();
        
        // Only skip if a request is already in-flight
        if (profileStore.getProfileRequestStatus(characterName) === 'requesting') {
          return;
        }
        
        // Also skip if we have a fresh profile already
        const hasProfile = await profileStore.hasProfile(characterName);
        if (hasProfile && !profileStore.isProfileStale(characterName)) {
          return;
        }

        profileStore.setProfileRequestStatus(characterName, 'requesting');

        try {
          const profileResponse = await api.getProfileWithRetry(useAuthStore.getState().token!, characterName, true);
          
          if (profileResponse.profileData) {
            await get().addProfile(characterName, profileResponse.profileData);
          } else {
            profileStore.setProfileRequestStatus(characterName, 'idle');
          }
        } catch (error) {
          console.error(`Failed to request profile for character: ${characterName}`, error);
          profileStore.setProfileRequestStatus(characterName, 'failed');
        }
      },

      refreshProfile: async (characterName: string) => {
        const profileStore = useProfileStore.getState();
        
        if (profileStore.getProfileRequestStatus(characterName) === 'requesting') {
          console.log(`Profile request already in-flight for ${characterName}`);
          return null;
        }

        profileStore.setProfileRequestStatus(characterName, 'requesting');

        try {
          const profileResponse = await api.getProfileWithRetry(useAuthStore.getState().token!, characterName, false);
          
          if (profileResponse.profileData) {
            await get().addProfile(characterName, profileResponse.profileData);
            return profileResponse.profileData;
          } else {
            profileStore.setProfileRequestStatus(characterName, 'idle');
            return null;
          }
        } catch (error) {
          console.error(`Failed to refresh profile for character: ${characterName}`, error);
          profileStore.setProfileRequestStatus(characterName, 'failed');
          return null;
        }
      },

      getProfileRequestStatus: (characterName: string) => {
        const profileStore = useProfileStore.getState();
        return profileStore.getProfileRequestStatus(characterName);
      },

      isProfileStale: (characterName: string) => {
        const profileStore = useProfileStore.getState();
        return profileStore.isProfileStale(characterName);
      },

      // Character-scoped unknown channels methods
      addUnknownChannelForCharacter: (channel: string, characterName: string) => {
        set((state) => {
          const currentUnknownChannels = state.characterUnknownChannels[characterName] || new Set();
          const newUnknownChannels = new Set(currentUnknownChannels);
          newUnknownChannels.add(channel);

          const currentCounts = state.characterUnknownChannelCounts[characterName] || {};
          const newCounts = { ...currentCounts };
          newCounts[channel] = (newCounts[channel] || 0) + 1;

          return {
            characterUnknownChannels: {
              ...state.characterUnknownChannels,
              [characterName]: newUnknownChannels
            },
            characterUnknownChannelCounts: {
              ...state.characterUnknownChannelCounts,
              [characterName]: newCounts
            }
          };
        });
      },

      clearUnknownChannelForCharacter: (channel: string, characterName: string) => {
        set((state) => {
          const currentUnknownChannels = state.characterUnknownChannels[characterName] || new Set();
          const newUnknownChannels = new Set(currentUnknownChannels);
          newUnknownChannels.delete(channel);

          const currentCounts = state.characterUnknownChannelCounts[characterName] || {};
          const newCounts = { ...currentCounts };
          delete newCounts[channel];

          return {
            characterUnknownChannels: {
              ...state.characterUnknownChannels,
              [characterName]: newUnknownChannels
            },
            characterUnknownChannelCounts: {
              ...state.characterUnknownChannelCounts,
              [characterName]: newCounts
            }
          };
        });
      },

      getUnknownChannelsForCharacter: (characterName: string) => {
        return get().characterUnknownChannels[characterName] || new Set();
      },

      getUnknownChannelCountsForCharacter: (characterName: string) => {
        return get().characterUnknownChannelCounts[characterName] || {};
      },

      hasUnreadActivityOnOtherCharacters: (currentCharacter: string) => {
        const state = get();
        const allCharacters = Object.keys(state.characterUnknownChannels);
        
        for (const characterName of allCharacters) {
          if (characterName !== currentCharacter) {
            const unknownChannels = state.characterUnknownChannels[characterName];
            if (unknownChannels && unknownChannels.size > 0) {
              return true;
            }
          }
        }
        
        return false;
      },

      getTotalUnreadCountOnOtherCharacters: (currentCharacter: string) => {
        const state = get();
        const allCharacters = Object.keys(state.characterUnknownChannelCounts);
        let totalCount = 0;
        
        for (const characterName of allCharacters) {
          if (characterName !== currentCharacter) {
            const counts = state.characterUnknownChannelCounts[characterName] || {};
            totalCount += Object.values(counts).reduce((sum, count) => sum + count, 0);
          }
        }
        
        return totalCount;
      },

      // Unread count management
      incrementUnreadCount: (characterName: string, channelId: string, count: number = 1) => {
        set((state) => {
          const currentCounts = state.characterUnreadCounts[characterName] || {};
          const newCounts = { ...currentCounts };
          newCounts[channelId] = (newCounts[channelId] || 0) + count;

          return {
            characterUnreadCounts: {
              ...state.characterUnreadCounts,
              [characterName]: newCounts
            }
          };
        });
      },

      clearUnreadCount: (characterName: string, channelId: string) => {
        set((state) => {
          const currentCounts = state.characterUnreadCounts[characterName] || {};
          const newCounts = { ...currentCounts };
          delete newCounts[channelId];

          return {
            characterUnreadCounts: {
              ...state.characterUnreadCounts,
              [characterName]: newCounts
            }
          };
        });
      },

      getUnreadCount: (characterName: string, channelId: string) => {
        const state = get();
        return state.characterUnreadCounts[characterName]?.[channelId] || 0;
      },

      getTotalUnreadCountForCharacter: (characterName: string) => {
        const state = get();
        const counts = state.characterUnreadCounts[characterName] || {};
        return Object.values(counts).reduce((sum, count) => sum + count, 0);
      },

      getUnreadCountsForCharacter: (characterName: string) => {
        const state = get();
        return state.characterUnreadCounts[characterName] || {};
      },

      clearUnreadCountForChannel: (characterName: string, channelId: string) => {
        set((state) => {
          const currentCounts = state.characterUnreadCounts[characterName] || {};
          const newCounts = { ...currentCounts };
          const oldCount = newCounts[channelId] || 0;
          delete newCounts[channelId];

          return {
            characterUnreadCounts: {
              ...state.characterUnreadCounts,
              [characterName]: newCounts
            }
          };
        });
      },

      // High-urgency alert management
      isHighUrgencyChannel: (channelId: string) => {
        // PMs are considered high-urgency
        return channelId.startsWith('PRI-');
      },

      getHighUrgencyUnreadCountForCharacter: (characterName: string) => {
        const state = get();
        const counts = state.characterUnreadCounts[characterName] || {};
        let highUrgencyCount = 0;
        
        for (const [channelId, count] of Object.entries(counts)) {
          if (get().isHighUrgencyChannel(channelId)) {
            highUrgencyCount += count;
          }
        }
        
        return highUrgencyCount;
      },

      getRegularUnreadCountForCharacter: (characterName: string) => {
        const state = get();
        const counts = state.characterUnreadCounts[characterName] || {};
        let regularCount = 0;
        
        for (const [channelId, count] of Object.entries(counts)) {
          if (!get().isHighUrgencyChannel(channelId)) {
            regularCount += count;
          }
        }
        
        return regularCount;
      },

      // Typing indicators management
      updateTypingState: (characterName: string, channelId: string, typingState: TypingState | null) => {
        set((state) => {
          const characterTypingStates = { ...state.characterTypingStates };
          
          if (!characterTypingStates[characterName]) {
            characterTypingStates[characterName] = {};
          }
          
          if (typingState === null) {
            delete characterTypingStates[characterName][channelId];
          } else {
            characterTypingStates[characterName][channelId] = typingState;
          }
          
          return { characterTypingStates };
        });
      },

      getTypingState: (characterName: string, channelId: string) => {
        const state = get();
        return state.characterTypingStates[characterName]?.[channelId] || null;
      },

      clearTypingState: (characterName: string, channelId: string) => {
        get().updateTypingState(characterName, channelId, null);
      },

      getTypingDisplayText: (characterName: string, channelId: string) => {
        const typingState = get().getTypingState(characterName, channelId);
        if (!typingState) return '';
        
        switch (typingState.status) {
          case 'typing':
            return 'typing...';
          case 'paused':
            return 'entered text';
          case 'clear':
          default:
            return '';
        }
      },

      // Legacy methods (for backward compatibility)
      addUnknownChannel: (channel: string) => {
        set((state) => {
          const newUnknownChannels = new Set(state.unknownChannels);
          newUnknownChannels.add(channel);
          
          const newCounts = { ...state.unknownChannelCounts };
          newCounts[channel] = (newCounts[channel] || 0) + 1;
          
          return {
            unknownChannels: newUnknownChannels,
            unknownChannelCounts: newCounts
          };
        });
      },

      clearUnknownChannel: (channel: string) => {
        set((state) => {
          const newUnknownChannels = new Set(state.unknownChannels);
          newUnknownChannels.delete(channel);
          
          const newCounts = { ...state.unknownChannelCounts };
          delete newCounts[channel];
          
          return {
            unknownChannels: newUnknownChannels,
            unknownChannelCounts: newCounts
          };
        });
      },

      clearMessages: () => {
        set(() => ({ messages: [] }));
      },

      clearAllHistory: () => {
        set(() => ({
          messages: [],
          characterMessages: {},
          characterLazyLoadingState: {},
          profiles: {},
          profileRequestStatus: {},
          profileLastRequested: {},
          knownCharacters: new Set<string>()
        }));
      },

      // Lazy loading methods
      getMessagesForChannel: (characterName: string, channelId: string) => {
        const state = get();
        const allMessages = state.characterMessages[characterName] || [];
        const channelMessages = allMessages.filter(m => m.channel === channelId);
        
        // Return ALL stored messages (no limit) - used for scrollback logic
        return channelMessages;
      },

      getDisplayMessagesForChannel: (characterName: string, channelId: string, displayLimit?: number) => {
        const state = get();
        const allMessages = state.characterMessages[characterName] || [];
        const channelMessages = allMessages.filter(m => m.channel === channelId);
        
        // Return only the most recent messages for display (configurable limit)
        // If no limit provided, return all messages
        return displayLimit ? channelMessages.slice(-displayLimit) : channelMessages;
      },

      loadMoreMessages: async (characterName: string, channelId: string) => {
        const state = get();
        const lazyState = state.characterLazyLoadingState[characterName]?.[channelId];
        
        if (!lazyState || lazyState.isLoading || !lazyState.hasMore) {
          console.log('loadMoreMessages: Skipping - conditions not met', {
            hasLazyState: !!lazyState,
            isLoading: lazyState?.isLoading,
            hasMore: lazyState?.hasMore
          });
          return;
        }

        console.log('loadMoreMessages: Starting load for', { characterName, channelId, oldestMessageTime: lazyState.oldestMessageTime });

        // Set loading state
        get().setLazyLoadingState(characterName, channelId, { isLoading: true });

        try {
          // Import signalr connection
          const { signalRService } = await import('@/lib/signalr');
          
          if (!signalRService.isConnected) {
            throw new Error('SignalR connection not available');
          }

          // Request more messages from the server
          // Use the oldest message time as the 'since' parameter to get older messages
          const since = lazyState.oldestMessageTime || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to 24 hours ago
          const limit = 20; // Load 20 messages at a time
          
          // Ensure since is a Date object
          const sinceDate = since instanceof Date ? since : new Date(since);
          
          console.log('loadMoreMessages: Requesting history', { channelId, since: sinceDate, limit });
          await signalRService.requestHistory(channelId, sinceDate, limit);
          
        } catch (error) {
          console.error('Failed to load more messages:', error);
          get().setLazyLoadingState(characterName, channelId, { isLoading: false });
        }
      },

      checkAndLoadMissingMessages: async (characterName: string, channelId: string) => {
        const state = get();
        const storedMessages = state.characterMessages[characterName] || [];
        const channelMessages = storedMessages.filter(m => m.channel === channelId);
        
        // If we have very few messages locally, try to load more from backend
        if (channelMessages.length < 50) {
          console.log(`Only ${channelMessages.length} messages stored locally for ${channelId}, attempting to load more from backend`);
          
          try {
            // Import signalr connection
            const { signalRService } = await import('@/lib/signalr');
            
            if (!signalRService.isConnected) {
              console.log('SignalR not connected, skipping backend fetch');
              return;
            }

            // Request recent messages from backend
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
            const limit = 100; // Load up to 100 messages
            
            console.log('Requesting recent messages from backend:', { channelId, since, limit });
            
            // This will trigger the message loading via SignalR
            await signalRService.requestHistory(channelId, since, limit);
            
          } catch (error) {
            console.error('Failed to load missing messages from backend:', error);
          }
        }
      },

      getLazyLoadingState: (characterName: string, channelId: string) => {
        const state = get();
        const existingState = state.characterLazyLoadingState[characterName]?.[channelId];
        
        // If we have an existing state, validate it before returning
        if (existingState) {
          const allMessages = state.characterMessages[characterName] || [];
          const channelMessages = allMessages.filter(m => m.channel === channelId);
          
          // Sanity check: if loadedMessageCount is greater than actual messages, it's corrupted
          if (existingState.loadedMessageCount > channelMessages.length) {
            console.log('Detected corrupted lazy loading state - loadedMessageCount > actual messages. Recalculating...');
            // Recalculate the state instead of returning the corrupted one
            const sortedMessages = [...channelMessages].sort((a, b) => 
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            const initialDisplayCount = Math.min(channelMessages.length, 20);
            const displayedMessages = sortedMessages.slice(-initialDisplayCount);
            const oldestDisplayedMessage = displayedMessages[0];
            
            const correctedState = {
              hasMore: channelMessages.length > 20,
              isLoading: false,
              oldestMessageTime: oldestDisplayedMessage ? new Date(oldestDisplayedMessage.timestamp) : null,
              loadedMessageCount: initialDisplayCount
            };
            
            // Update the state with the corrected values
            get().setLazyLoadingState(characterName, channelId, correctedState);
            return correctedState;
          }
          
          return existingState;
        }
        
        // If no existing state, calculate it based on current messages
        const allMessages = state.characterMessages[characterName] || [];
        const channelMessages = allMessages.filter(m => m.channel === channelId);
        
        if (channelMessages.length === 0) {
          return {
            hasMore: false,
            isLoading: false,
            oldestMessageTime: null,
            loadedMessageCount: 0
          };
        }
        
        const sortedMessages = [...channelMessages].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const initialDisplayCount = Math.min(channelMessages.length, 20);
        const displayedMessages = sortedMessages.slice(-initialDisplayCount); // Get the last N messages (most recent)
        const oldestDisplayedMessage = displayedMessages[0]; // Oldest of the displayed messages
        
        // For initial state, assume there might be more messages on the server
        // This will be updated when we actually try to load more
        const hasMore = true;
        
        console.log('Calculating initial lazy loading state:', {
          totalMessages: channelMessages.length,
          initialDisplayCount,
          hasMore,
          oldestDisplayedMessageTime: oldestDisplayedMessage?.timestamp
        });
        
        return {
          hasMore,
          isLoading: false,
          oldestMessageTime: oldestDisplayedMessage ? new Date(oldestDisplayedMessage.timestamp) : null,
          loadedMessageCount: initialDisplayCount
        };
      },

      setLazyLoadingState: (characterName: string, channelId: string, newState: {
        hasMore?: boolean;
        isLoading?: boolean;
        oldestMessageTime?: Date | null;
        loadedMessageCount?: number;
      }) => {
        console.log('setLazyLoadingState called:', { characterName, channelId, newState });
        
        set((state) => {
          const currentState = state.characterLazyLoadingState[characterName]?.[channelId] || {
            hasMore: true,
            isLoading: false,
            oldestMessageTime: null,
            loadedMessageCount: 0
          };

          const updatedState = {
            ...currentState,
            ...newState
          };

          console.log('setLazyLoadingState: Updating state from', currentState, 'to', updatedState);

          return {
            characterLazyLoadingState: {
              ...state.characterLazyLoadingState,
              [characterName]: {
                ...state.characterLazyLoadingState[characterName],
                [channelId]: updatedState
              }
            }
          };
        });
      },

      initializeLazyLoading: (characterName: string, channelId: string, initialMessages: Message[]) => {
        const state = get();
        const existingState = state.characterLazyLoadingState[characterName]?.[channelId];
        
        // Only initialize if not already initialized
        if (existingState) {
          console.log('Lazy loading already initialized for', { characterName, channelId });
          return;
        }

        const sortedMessages = [...initialMessages].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const oldestMessage = sortedMessages[0];
        const newestMessage = sortedMessages[sortedMessages.length - 1];

        // Always start with hasMore = true to allow lazy loading to work
        // The server will tell us if there are no more messages when we try to load
        const hasMore = true;

        console.log('Initializing lazy loading:', {
          characterName,
          channelId,
          messageCount: initialMessages.length,
          hasMore,
          oldestMessageTime: oldestMessage?.timestamp
        });

        // Calculate how many messages we should initially display (20, not all)
        const initialDisplayCount = Math.min(initialMessages.length, 20);
        
        // If we have more messages than we're displaying, we have more to load
        const actuallyHasMore = initialMessages.length > initialDisplayCount;
        
        console.log('Setting up lazy loading state:', {
          totalMessages: initialMessages.length,
          initialDisplayCount,
          actuallyHasMore
        });

        get().setLazyLoadingState(characterName, channelId, {
          hasMore: actuallyHasMore,
          isLoading: false,
          oldestMessageTime: oldestMessage ? new Date(oldestMessage.timestamp) : null,
          loadedMessageCount: initialDisplayCount
        });
      },

      // Enhanced scrollback methods
      trimChannelMessages: (characterName: string, channelId: string, maxMessages: number = 100) => {
        set((state) => {
          // Skip trimming for PM channels (they start with PRI-)
          if (channelId.startsWith('PRI-')) {
            console.log(`Skipping trim for PM channel: ${channelId}`);
            return state;
          }
          
          const characterMessages = state.characterMessages[characterName] || [];
          const channelMessages = characterMessages.filter(msg => msg.channel === channelId);
          
          if (channelMessages.length <= maxMessages) {
            return state; // No trimming needed
          }

          // Sort messages by timestamp (oldest first)
          const sortedMessages = [...channelMessages].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          // Keep only the most recent messages
          const trimmedMessages = sortedMessages.slice(-maxMessages);
          const trimmedIds = new Set(trimmedMessages.map(msg => msg.id));

          // Update character messages, removing trimmed ones
          const updatedCharacterMessages = characterMessages.filter(msg => 
            msg.channel !== channelId || trimmedIds.has(msg.id)
          );

          // Update lazy loading state to reflect the new message count
          const lazyState = state.characterLazyLoadingState[characterName]?.[channelId];
          if (lazyState) {
            const newLoadedCount = Math.min(lazyState.loadedMessageCount, trimmedMessages.length);
            
            console.log(`Trimmed channel ${channelId} from ${channelMessages.length} to ${trimmedMessages.length} messages, updating loadedMessageCount from ${lazyState.loadedMessageCount} to ${newLoadedCount}`);
            
            // Update the lazy loading state to reflect the trimmed count
            return {
              ...state,
              characterMessages: {
                ...state.characterMessages,
                [characterName]: updatedCharacterMessages
              },
              characterLazyLoadingState: {
                ...state.characterLazyLoadingState,
                [characterName]: {
                  ...state.characterLazyLoadingState[characterName],
                  [channelId]: {
                    ...lazyState,
                    loadedMessageCount: newLoadedCount
                  }
                }
              }
            };
          }

          console.log(`Trimmed channel ${channelId} from ${channelMessages.length} to ${trimmedMessages.length} messages`);

          return {
            ...state,
            characterMessages: {
              ...state.characterMessages,
              [characterName]: updatedCharacterMessages
            }
          };
        });
      },

      getLocalMessagesForChannel: (characterName: string, channelId: string, beforeTime?: Date, limit: number = 20) => {
        const state = get();
        const characterMessages = state.characterMessages[characterName] || [];
        let channelMessages = characterMessages.filter(msg => msg.channel === channelId);

        // Sort by timestamp (oldest first)
        const sortedMessages = [...channelMessages].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Filter by time if provided (get messages older than beforeTime)
        if (beforeTime) {
          const olderMessages = sortedMessages.filter(msg => 
            new Date(msg.timestamp) < beforeTime
          );
          // Return the most recent of the older messages (last N messages before beforeTime)
          return olderMessages.slice(-limit);
        }

        // If no beforeTime, return the oldest messages (first N messages)
        return sortedMessages.slice(0, limit);
      },

      hasMoreLocalMessages: (characterName: string, channelId: string, beforeTime?: Date) => {
        const state = get();
        const characterMessages = state.characterMessages[characterName] || [];
        let channelMessages = characterMessages.filter(msg => msg.channel === channelId);

        // Sort by timestamp (oldest first)
        const sortedMessages = [...channelMessages].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Get the current lazy loading state
        const lazyState = state.characterLazyLoadingState[characterName]?.[channelId];
        
        // If we have more messages stored than we're currently displaying, we have more to show
        if (lazyState && channelMessages.length > lazyState.loadedMessageCount) {
          console.log(`Have ${channelMessages.length} messages stored, but only showing ${lazyState.loadedMessageCount}. Can load more locally.`);
          return true;
        }

        // Check if there are older messages available locally
        if (beforeTime) {
          const olderMessages = sortedMessages.filter(msg => 
            new Date(msg.timestamp) < beforeTime
          );
          console.log(`Checking for older messages: ${olderMessages.length} messages older than ${beforeTime.toISOString()}`);
          return olderMessages.length > 0;
        }

        // If no beforeTime, check if we have messages older than the oldest displayed
        if (lazyState?.oldestMessageTime) {
          const olderMessages = sortedMessages.filter(msg => 
            new Date(msg.timestamp) < lazyState.oldestMessageTime!
          );
          console.log(`Checking for older messages without beforeTime: ${olderMessages.length} messages older than ${lazyState.oldestMessageTime.toISOString()}`);
          return olderMessages.length > 0;
        }

        // If no beforeTime and no lazy state, assume no more local messages
        return false;
      },

      clearLazyLoadingState: (characterName: string, channelId: string) => {
        set((state) => {
          const characterState = state.characterLazyLoadingState[characterName];
          if (characterState && characterState[channelId]) {
            const newCharacterState = { ...characterState };
            delete newCharacterState[channelId];
            
            console.log(`Cleared lazy loading state for ${characterName}:${channelId}`);
            
            return {
              ...state,
              characterLazyLoadingState: {
                ...state.characterLazyLoadingState,
                [characterName]: newCharacterState
              }
            };
          }
          return state;
        });
      },

      // Storage management methods
      cleanupStorage: async () => {
        console.log('Performing storage cleanup...');
        
        // Clean up old messages
        set((state) => {
          const cleanedMessages = cleanupOldMessages(state.characterMessages);
          return {
            ...state,
            characterMessages: cleanedMessages
          };
        });
        
        // Clean up old profiles in IndexedDB
        const profileStore = useProfileStore.getState();
        const deletedCount = await profileStore.cleanupOldProfiles();
        
        console.log(`Storage cleanup completed. Deleted ${deletedCount} old profiles from IndexedDB`);
      },

      getStorageSize: () => {
        try {
          const currentState = get();
          const partializedData = {
            // Note: profiles are now stored in IndexedDB, not included in localStorage size
            knownCharacters: Array.from(currentState.knownCharacters),
            characterMessages: currentState.characterMessages,
            characterSelectedChannels: currentState.characterSelectedChannels,
            characterJoinedChannels: currentState.characterJoinedChannels,
            characterChannelMetadata: currentState.characterChannelMetadata,
            characterUnknownChannels: Object.fromEntries(
              Object.entries(currentState.characterUnknownChannels).map(([key, value]) => [key, Array.from(value)])
            ),
            characterUnknownChannelCounts: currentState.characterUnknownChannelCounts,
            characterUnreadCounts: currentState.characterUnreadCounts,
            characterLazyLoadingState: currentState.characterLazyLoadingState,
            messages: currentState.messages,
            selectedChannels: currentState.selectedChannels,
            channelMetadata: currentState.channelMetadata
          };
          
          return estimateStorageSize(partializedData);
        } catch (error) {
          console.error('Error calculating storage size:', error);
          return 0;
        }
      },

      loadMessagesFromIndexedDB: async (characterName: string, channelId?: string, limit?: number) => {
        try {
          const messages = await messageIndexedDBService.getMessages(characterName, channelId, limit);
          console.log(`Loaded ${messages.length} messages from IndexedDB for ${characterName}${channelId ? ` in ${channelId}` : ''}`);
          return messages;
        } catch (error) {
          console.error(`Failed to load messages from IndexedDB for ${characterName}:`, error);
          return [];
        }
      },

      loadAllMessagesFromIndexedDB: async () => {
        try {
          console.log('Loading all messages from IndexedDB into memory...');
          
          // Get all characters that have messages in IndexedDB
          // For now, we'll try to load for the current active character
          // This could be enhanced to load for all known characters
          const state = get();
          
          // Load messages for characters that have connections
          const characterNames = Object.keys(state.characterSelectedChannels);
          
          for (const characterName of characterNames) {
            try {
              const messages = await messageIndexedDBService.getMessages(characterName);
              if (messages.length > 0) {
                set(currentState => ({
                  characterMessages: {
                    ...currentState.characterMessages,
                    [characterName]: messages
                  }
                }));
                console.log(`Loaded ${messages.length} messages for ${characterName} from IndexedDB`);
              }
            } catch (error) {
              console.error(`Failed to load messages for ${characterName}:`, error);
            }
          }
          
          console.log('Finished loading messages from IndexedDB');
        } catch (error) {
          console.error('Failed to load messages from IndexedDB:', error);
        }
      },

      loadMessagesForCharacter: async (characterName: string) => {
        try {
          const currentState = get();
          const existingMessages = currentState.characterMessages[characterName] || [];
          
          // Only load if we don't already have messages in memory
          if (existingMessages.length === 0) {
            const messages = await messageIndexedDBService.getMessages(characterName);
            if (messages.length > 0) {
              set(state => ({
                characterMessages: {
                  ...state.characterMessages,
                  [characterName]: messages
                }
              }));
              console.log(`Loaded ${messages.length} messages for ${characterName} from IndexedDB`);
            }
          }
        } catch (error) {
          console.error(`Failed to load messages for ${characterName}:`, error);
        }
      }
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            if (typeof window === 'undefined') return null;
            return localStorage.getItem(name);
          } catch (error) {
            console.error('Error reading from localStorage:', error);
            return null;
          }
        },
        setItem: (name: string, value: string) => {
          if (typeof window !== 'undefined') {
            safeSetItem(name, value);
          }
        },
        removeItem: (name: string) => {
          try {
            if (typeof window !== 'undefined') {
              localStorage.removeItem(name);
            }
          } catch (error) {
            console.error('Error removing from localStorage:', error);
          }
        }
      })),
      partialize: (state) => ({
        // Note: profiles and messages are now stored in IndexedDB, not localStorage
        // Only store lightweight data in localStorage to avoid quota issues
        knownCharacters: Array.from(state.knownCharacters),
        characterSelectedChannels: state.characterSelectedChannels,
        characterJoinedChannels: state.characterJoinedChannels,
        characterChannelMetadata: state.characterChannelMetadata,
        characterUnknownChannels: Object.fromEntries(
          Object.entries(state.characterUnknownChannels).map(([key, value]) => [key, Array.from(value)])
        ),
        characterUnknownChannelCounts: state.characterUnknownChannelCounts,
        characterUnreadCounts: state.characterUnreadCounts,
        characterLazyLoadingState: state.characterLazyLoadingState,
        // Legacy fields for backward compatibility (excluding messages)
        selectedChannels: state.selectedChannels,
        channelMetadata: state.channelMetadata
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert arrays back to Sets
          if (state.knownCharacters && Array.isArray(state.knownCharacters)) {
            state.knownCharacters = new Set(state.knownCharacters);
          }
          if (state.characterUnknownChannels) {
            state.characterUnknownChannels = Object.fromEntries(
              Object.entries(state.characterUnknownChannels).map(([key, value]) => [key, new Set(value)])
            );
          }
          
          // Convert Date strings back to Date objects in lazy loading state
          if (state.characterLazyLoadingState) {
            Object.keys(state.characterLazyLoadingState).forEach(characterName => {
              const characterState = state.characterLazyLoadingState[characterName];
              if (characterState) {
                Object.keys(characterState).forEach(channelId => {
                  const channelState = characterState[channelId];
                  if (channelState && channelState.oldestMessageTime && typeof channelState.oldestMessageTime === 'string') {
                    channelState.oldestMessageTime = new Date(channelState.oldestMessageTime);
                  }
                });
              }
            });
          }
          
          // Initialize profile store after rehydration
          const profileStore = useProfileStore.getState();
          profileStore.initialize().catch(error => {
            console.error('Failed to initialize profile store after rehydration:', error);
          });

          // Load messages from IndexedDB after rehydration
          setTimeout(() => {
            const chatStore = useChatStore.getState();
            chatStore.loadAllMessagesFromIndexedDB().catch((error: any) => {
              console.error('Failed to load messages from IndexedDB after rehydration:', error);
            });
          }, 1000); // Small delay to ensure IndexedDB is ready
        }
      }
    }
  )
);

// Set up token refresh callback
setTokenRefreshCallback(() => useAuthStore.getState().refreshAccessToken());
setTokenRefreshCallback(() => useAuthStore.getState().refreshAccessToken());