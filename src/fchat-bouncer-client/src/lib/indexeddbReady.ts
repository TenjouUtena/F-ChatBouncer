type ReadyState = 'pending' | 'ready' | 'failed';

let readyState: ReadyState = 'pending';
let readyError: unknown;
let resolveReady: (() => void) | null = null;
let rejectReady: ((reason?: any) => void) | null = null;

const readinessPromise = new Promise<void>((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});

const readyListeners = new Set<() => void>();
const failListeners = new Set<(error: unknown) => void>();

export function isIndexedDBReady(): boolean {
  return readyState === 'ready';
}

export function hasIndexedDBFailed(): boolean {
  return readyState === 'failed';
}

export function waitForIndexedDBReady(): Promise<void> {
  if (readyState === 'ready') {
    return Promise.resolve();
  }

  if (readyState === 'failed') {
    return Promise.reject(readyError);
  }

  return readinessPromise;
}

export function onIndexedDBReady(callback: () => void): void {
  if (readyState === 'ready') {
    callback();
    return;
  }

  readyListeners.add(callback);
}

export function onIndexedDBFailed(callback: (error: unknown) => void): void {
  if (readyState === 'failed') {
    callback(readyError);
    return;
  }

  failListeners.add(callback);
}

export function markIndexedDBReady(): void {
  if (readyState !== 'pending') return;

  readyState = 'ready';
  resolveReady?.();
  readyListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('IndexedDB ready listener failed:', error);
    }
  });
  readyListeners.clear();
  failListeners.clear();
}

export function markIndexedDBFailed(error: unknown): void {
  if (readyState !== 'pending') return;

  readyState = 'failed';
  readyError = error;
  rejectReady?.(error);

  failListeners.forEach((listener) => {
    try {
      listener(error);
    } catch (listenerError) {
      console.error('IndexedDB failure listener threw an error:', listenerError);
    }
  });

  readyListeners.clear();
  failListeners.clear();
}

// Testing helper
export function __resetIndexedDBReadyForTests(): void {
  readyState = 'pending';
  readyError = undefined;
  readyListeners.clear();
  failListeners.clear();
}

