import { create } from 'zustand';
import { CharacterInfo } from '@/types';
import { db, CharacterRecord, CharacterStatus } from '@/lib/db';

// Characters not seen for this long are dropped on load
const CHARACTER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface CharacterStore {
  characters: Record<string, CharacterRecord>;

  load: () => Promise<void>;
  upsertMany: (infos: CharacterInfo[]) => Promise<void>;
  get: (name: string) => CharacterRecord | null;
  has: (name: string) => boolean;
}

/**
 * Gender and presence for every character the user has seen, fed by the server's
 * CharacterInfo pushes and GetCharacterInfo lookups. Used to colour names.
 */
export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: {},

  load: async () => {
    const records = await db.getAll('characters');
    const cutoff = Date.now() - CHARACTER_RETENTION_MS;

    const keep: Record<string, CharacterRecord> = {};
    const expired: string[] = [];
    for (const record of records) {
      if (record.lastSeen < cutoff) {
        expired.push(record.name);
      } else {
        keep[record.name] = record;
      }
    }

    set((state) => ({ characters: { ...keep, ...state.characters } }));
    await db.deleteMany('characters', expired);
  },

  upsertMany: async (infos: CharacterInfo[]) => {
    if (infos.length === 0) return;

    const existing = get().characters;
    const now = Date.now();
    const updated: CharacterRecord[] = infos.map(info => {
      const previous = existing[info.name];
      return {
        name: info.name,
        // A "None" gender from STA/FLN means "not known here", not "changed to None"
        gender: info.gender && info.gender !== 'None' ? info.gender : previous?.gender ?? 'None',
        status: info.status as CharacterStatus,
        statusMessage: info.statusMessage ?? undefined,
        isOnline: info.isOnline,
        lastSeen: now
      };
    });

    set((state) => ({
      characters: { ...state.characters, ...Object.fromEntries(updated.map(r => [r.name, r])) }
    }));

    try {
      await db.putMany('characters', updated);
    } catch (error) {
      console.error('Failed to persist character info:', error);
    }
  },

  get: (name: string) => get().characters[name] || null,

  has: (name: string) => name in get().characters,
}));
