import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FriendsStore, Friend } from '@/types';

export const useFriendsStore = create<FriendsStore>()(
  persist(
    (set, get) => ({
      // Initial state
      friends: [],
      bookmarks: [],
      bookmarksWithStatus: [],
      isCollapsed: false,
      isLoading: false,

      // Helper function to deduplicate friends
      deduplicateFriends: (friends: Friend[]): Friend[] => {
        const seen = new Set<string>();
        return friends.filter(friend => {
          if (seen.has(friend.name)) {
            return false;
          }
          seen.add(friend.name);
          return true;
        });
      },

      // Actions
      setFriends: (friends: Friend[]) => {
        const deduplicatedFriends = get().deduplicateFriends(friends);
        set({ friends: deduplicatedFriends });
      },

      setBookmarks: (bookmarks: string[]) => {
        set({ bookmarks });
      },

      setBookmarksWithStatus: (bookmarksWithStatus: Friend[]) => {
        set({ bookmarksWithStatus });
      },

      updateFriendStatus: (name: string, status: Friend['status'], statusMessage?: string) => {
        set((state) => ({
          friends: state.friends.map((friend) =>
            friend.name === name
              ? {
                  ...friend,
                  status,
                  statusMessage,
                  isOnline: status !== 'offline',
                  lastSeen: status === 'offline' ? new Date().toISOString() : friend.lastSeen,
                }
              : friend
          ),
          bookmarksWithStatus: state.bookmarksWithStatus.map((bookmark) =>
            bookmark.name === name
              ? {
                  ...bookmark,
                  status,
                  statusMessage,
                  isOnline: status !== 'offline',
                  lastSeen: status === 'offline' ? new Date().toISOString() : bookmark.lastSeen,
                }
              : bookmark
          ),
        }));
      },

      setFriendOnline: (name: string, isOnline: boolean) => {
        set((state) => ({
          friends: state.friends.map((friend) =>
            friend.name === name
              ? {
                  ...friend,
                  isOnline,
                  status: isOnline ? friend.status : 'offline',
                  lastSeen: !isOnline ? new Date().toISOString() : friend.lastSeen,
                }
              : friend
          ),
          bookmarksWithStatus: state.bookmarksWithStatus.map((bookmark) =>
            bookmark.name === name
              ? {
                  ...bookmark,
                  isOnline,
                  status: isOnline ? bookmark.status : 'offline',
                  lastSeen: !isOnline ? new Date().toISOString() : bookmark.lastSeen,
                }
              : bookmark
          ),
        }));
      },

      toggleCollapsed: () => {
        set((state) => ({ isCollapsed: !state.isCollapsed }));
      },

      setCollapsed: (collapsed: boolean) => {
        set({ isCollapsed: collapsed });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      // Helper function to check if a character is a friend or bookmark
      isFriendOrBookmark: (name: string): boolean => {
        const state = get();
        return state.friends.some(f => f.name === name) || 
               state.bookmarksWithStatus.some(b => b.name === name);
      },

      // Update friend memo
      updateFriendMemo: (name: string, memo?: string) => {
        set((state) => ({
          friends: state.friends.map((friend) =>
            friend.name === name
              ? { ...friend, memo }
              : friend
          ),
          bookmarksWithStatus: state.bookmarksWithStatus.map((bookmark) =>
            bookmark.name === name
              ? { ...bookmark, memo }
              : bookmark
          ),
        }));
      },

      // Bookmark management
      addBookmark: (name: string) => {
        set((state) => {
          if (!state.bookmarks.includes(name)) {
            // Add to bookmarks
            const newBookmarks = [...state.bookmarks, name];
            
            // Add to friends list as well (bookmarks are automatically friends)
            const isAlreadyFriend = state.friends.some(f => f.name === name);
            const newFriends = isAlreadyFriend ? state.friends : [
              ...state.friends,
              {
                name,
                status: 'offline' as const,
                isOnline: false,
                lastSeen: new Date().toISOString(),
                gender: undefined
              }
            ];
            
            return { 
              bookmarks: newBookmarks,
              friends: newFriends
            };
          }
          return state;
        });
      },

      removeBookmark: (name: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter(bookmark => bookmark !== name),
          bookmarksWithStatus: state.bookmarksWithStatus.filter(bookmark => bookmark.name !== name),
          // Remove from friends list as well (bookmarks are automatically friends)
          friends: state.friends.filter(friend => friend.name !== name)
        }));
      },
    }),
    {
      name: 'friends-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        friends: state.friends,
        bookmarks: state.bookmarks,
        bookmarksWithStatus: state.bookmarksWithStatus,
        isCollapsed: state.isCollapsed,
      }),
    }
  )
);
