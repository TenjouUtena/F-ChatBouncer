import { Friend, ProfileData } from '@/types';

/**
 * The app's single IndexedDB database (messages live separately in messageIndexedDB.ts).
 * Every object store is keyed by character name.
 */
const DB_NAME = 'fchat-bouncer';
const DB_VERSION = 1;

export type CharacterStatus = Friend['status'];

export interface CharacterRecord {
  name: string;
  gender: string;
  status: CharacterStatus;
  statusMessage?: string;
  isOnline: boolean;
  lastSeen: number;
}

export interface ProfileRecord {
  name: string;
  profile: ProfileData;
  fetchedAt: string | null;
}

export interface ConnectionRecord {
  name: string;
  isActive: boolean;
  isConnected: boolean;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: string;
  connectedAt: string;
  fchatUsername?: string;
}

interface StoreTypes {
  characters: CharacterRecord;
  profiles: ProfileRecord;
  connections: ConnectionRecord;
}

export type StoreName = keyof StoreTypes;

const STORE_NAMES: StoreName[] = ['characters', 'profiles', 'connections'];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'name' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

async function read<T>(store: StoreName, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const request = fn(db.transaction(store, 'readonly').objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(store: StoreName, fn: (s: IDBObjectStore) => void): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    fn(tx.objectStore(store));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  get<S extends StoreName>(store: S, name: string): Promise<StoreTypes[S] | undefined> {
    return read<StoreTypes[S] | undefined>(store, s => s.get(name));
  },

  getAll<S extends StoreName>(store: S): Promise<StoreTypes[S][]> {
    return read<StoreTypes[S][]>(store, s => s.getAll());
  },

  put<S extends StoreName>(store: S, value: StoreTypes[S]): Promise<void> {
    return write(store, s => { s.put(value); });
  },

  putMany<S extends StoreName>(store: S, values: StoreTypes[S][]): Promise<void> {
    if (values.length === 0) return Promise.resolve();
    return write(store, s => { values.forEach(v => s.put(v)); });
  },

  delete(store: StoreName, name: string): Promise<void> {
    return write(store, s => { s.delete(name); });
  },

  deleteMany(store: StoreName, names: string[]): Promise<void> {
    if (names.length === 0) return Promise.resolve();
    return write(store, s => { names.forEach(n => s.delete(n)); });
  },

  clear(store: StoreName): Promise<void> {
    return write(store, s => { s.clear(); });
  },
};
