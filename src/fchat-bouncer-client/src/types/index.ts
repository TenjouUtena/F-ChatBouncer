export interface LoginCredentials {
  username: string;
  password: string;
  fchatUsername?: string;
  fchatPassword?: string;
}

export interface TypingState {
  characterName: string;
  status: 'typing' | 'paused' | 'clear';
  timestamp: Date;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  googleId?: string;
  googleEmail?: string;
  googleName?: string;
  googlePicture?: string;
  hasFChatCredentials: boolean;
}

export interface AuthMethod {
  type: 'local' | 'google';
  label: string;
  description: string;
}

export interface FChatCredentialsRequest {
  fchatUsername: string;
  fchatPassword: string;
}

export interface Message {
  id: string;
  channel: string;
  sender: string;
  content: string;
  timestamp: string;
  messageType: 'Chat' | 'Action' | 'System' | 'Private' | 'Announcement' | 'Join' | 'Leave' | 'Error' | 'Roll';
  status?: 'sending' | 'sent' | 'delivered' | 'failed' | 'edited';
  editedAt?: string;
  replyTo?: string;
  mentions?: string[];
  isOwnMessage?: boolean;
  // Optional fields for different message types
  actionText?: string;
  systemData?: Record<string, any>;
  recipient?: string;
  isIncoming?: boolean;
  priority?: 'low' | 'medium' | 'high';
  author?: string;
  // Character context fields (added for multi-character support)
  characterName?: string; // Character that received this message
  isActiveCharacter?: boolean; // Whether this message is for the currently active character
}

export interface Character {
  name: string;
  status: 'online' | 'busy' | 'dnd' | 'idle' | 'away' | 'crown' | 'looking';
  statusMessage?: string;
  gender: string;
}

export interface ConnectionStatus {
  isConnected: boolean;
  status: string;
  lastActivity: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  availableCharacters: Character[];
  areChannelsSelected: boolean;
}

export interface ChatState {
  messages: Message[];
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  selectedChannels: string[];
}

export interface Channel {
  id: string;
  name: string;
  title?: string;
  userCount: number;
  mode: 'Public' | 'Private' | 'Both';
}

export interface KinkInfo {
  kink_id: string;
  kink_name: string;
  kink_pref: string;
  custom: boolean;
  description?: string;
}

export interface ProfileImage {
  image_id: string;
  image_ext: string;
  image_description: string;
}

export interface LightweightCharacterData {
  character: string;
  gender: string;
  species: string;
  lastSeen: number;
  status?: 'online' | 'looking' | 'busy' | 'away' | 'dnd' | 'offline';
  statusMessage?: string;
  isOnline?: boolean;
}

export interface ProfileData {
  character: string;
  description: string;
  gender: string;
  info: Record<string, string>;
  kinks: KinkInfo[];
  images: ProfileImage[];
  timestamp: string;
}

export interface ProfileReceivedEvent {
  characterName: string;
  profileData: ProfileData | string;
  message: string;
  requestingCharacter?: string;
  onlineStatus?: {
    isOnline: boolean;
    status: string;
    gender?: string;
    lastSeen: string;
  };
}

export interface ProfileResponse {
  characterName: string;
  profileData: ProfileData | null;
  isCached: boolean;
  age?: { totalHours: number };
  message?: string;
}

export interface Friend {
  name: string;
  status: 'online' | 'busy' | 'dnd' | 'idle' | 'away' | 'crown' | 'looking' | 'offline';
  statusMessage?: string;
  lastSeen?: string;
  isOnline: boolean;
  gender?: string;
  memo?: string;
}

export interface FriendsState {
  friends: Friend[];
  bookmarks: string[];
  bookmarksWithStatus: Friend[];
  isCollapsed: boolean;
  isLoading: boolean;
}

export interface FriendsStore extends FriendsState {
  setFriends: (friends: Friend[]) => void;
  setBookmarks: (bookmarks: string[]) => void;
  setBookmarksWithStatus: (bookmarksWithStatus: Friend[]) => void;
  updateFriendStatus: (name: string, status: Friend['status'], statusMessage?: string) => void;
  setFriendOnline: (name: string, isOnline: boolean) => void;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setLoading: (loading: boolean) => void;
  deduplicateFriends: (friends: Friend[]) => Friend[];
  isFriendOrBookmark: (name: string) => boolean;
  updateFriendMemo: (name: string, memo?: string) => void;
  addBookmark: (name: string) => void;
  removeBookmark: (name: string) => void;
}

export interface SearchResult {
  characterName: string;
  status: 'online' | 'busy' | 'dnd' | 'idle' | 'away' | 'crown' | 'looking' | 'offline';
  statusMessage?: string;
  gender: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface SearchRequest {
  kinks?: string[];
  genders?: string[];
  orientations?: string[];
  languages?: string[];
  furryprefs?: string[];
  roles?: string[];
}

export interface SearchState {
  results: SearchResult[];
  isLoading: boolean;
  isOpen: boolean;
  searchCriteria: SearchRequest;
}

export interface MemoResponse {
  characterName: string;
  memo?: string;
  hasMemo: boolean;
}