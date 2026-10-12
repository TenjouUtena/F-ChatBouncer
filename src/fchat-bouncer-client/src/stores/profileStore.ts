import { create } from 'zustand';
import { ProfileData } from '@/types';
import { db } from '@/lib/db';

type ProfileRequestStatus = 'idle' | 'requesting' | 'failed' | 'success';

const DEFAULT_PROFILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface ProfileStore {
  // In-memory cache in front of the "profiles" object store
  profiles: Record<string, ProfileData>;
  // Staleness as reported by the server; the client keeps no clock of its own
  staleProfiles: Record<string, boolean>;
  profileRequestStatus: Record<string, ProfileRequestStatus>;

  addProfile: (characterName: string, profileData: ProfileData, fetchedAt?: string | null, isStale?: boolean) => Promise<void>;
  getProfile: (characterName: string) => Promise<ProfileData | null>;
  hasProfile: (characterName: string) => Promise<boolean>;
  isProfileStale: (characterName: string) => boolean;
  getProfileRequestStatus: (characterName: string) => ProfileRequestStatus;
  setProfileRequestStatus: (characterName: string, status: ProfileRequestStatus) => void;
  cleanupOldProfiles: (maxAge?: number) => Promise<number>;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profiles: {},
  staleProfiles: {},
  profileRequestStatus: {},

  addProfile: async (characterName, profileData, fetchedAt = null, isStale = false) => {
    set((state) => ({
      profiles: { ...state.profiles, [characterName]: profileData },
      staleProfiles: { ...state.staleProfiles, [characterName]: isStale },
      profileRequestStatus: { ...state.profileRequestStatus, [characterName]: 'success' }
    }));

    try {
      await db.put('profiles', { name: characterName, profile: profileData, fetchedAt });
    } catch (error) {
      console.debug(`Failed to persist profile for ${characterName}:`, error);
    }
  },

  getProfile: async (characterName) => {
    const cached = get().profiles[characterName];
    if (cached) return cached;

    try {
      const record = await db.get('profiles', characterName);
      if (!record) return null;

      set((state) => ({ profiles: { ...state.profiles, [characterName]: record.profile } }));
      return record.profile;
    } catch (error) {
      console.debug(`Failed to read profile for ${characterName}:`, error);
      return null;
    }
  },

  hasProfile: async (characterName) => {
    return (await get().getProfile(characterName)) !== null;
  },

  isProfileStale: (characterName) => get().staleProfiles[characterName] ?? false,

  getProfileRequestStatus: (characterName) => get().profileRequestStatus[characterName] || 'idle',

  setProfileRequestStatus: (characterName, status) => {
    set((state) => ({
      profileRequestStatus: { ...state.profileRequestStatus, [characterName]: status }
    }));
  },

  cleanupOldProfiles: async (maxAge = DEFAULT_PROFILE_MAX_AGE_MS) => {
    try {
      const cutoff = Date.now() - maxAge;
      const expired = (await db.getAll('profiles'))
        .filter(r => !r.fetchedAt || Date.parse(r.fetchedAt) < cutoff)
        .map(r => r.name);

      await db.deleteMany('profiles', expired);
      set((state) => {
        const profiles = { ...state.profiles };
        expired.forEach(name => delete profiles[name]);
        return { profiles };
      });
      return expired.length;
    } catch (error) {
      console.debug('Failed to clean up old profiles:', error);
      return 0;
    }
  }
}));
