import { useHostCapability } from '../lib/claudeHost';
import type { KeyValueStorage } from './store';

// On the web, values go to localStorage. When the page runs as a Claude
// artifact they're also written to the viewer's private storage there, which
// survives the browser clearing its data and follows the account across devices.
// (expo-sqlite on web needs a WASM worker and cross-origin isolation headers.)

function local(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function localGet(key: string): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function localSet(key: string, value: string | null) {
  try {
    if (value === null) local()?.removeItem(key);
    else local()?.setItem(key, value);
  } catch {
    // Storage full or blocked; the account copy still has it.
  }
}

let docPrefix: Promise<string | null> | null = null;

async function accountDoc(key: string) {
  docPrefix ??= (async () => {
    const user = await useHostCapability('user');
    const id = user ? await user.id().catch(() => null) : null;
    return id ? `data/users/${id}/` : null;
  })();
  const [db, prefix] = await Promise.all([useHostCapability('db'), docPrefix]);
  if (!db || !prefix) return null;
  // Path segments allow only letters, digits and _ - . ~ : @ +
  return db.doc(prefix + key.replace(/[^A-Za-z0-9_.~:@+-]/g, '~'));
}

// One write at a time per document; a newer value replaces a queued one.
const writing = new Map<string, Promise<void>>();
const queued = new Map<string, string | null>();

function writeAccount(key: string, value: string | null) {
  const wasQueued = queued.has(key);
  queued.set(key, value);
  if (wasQueued) return;
  const prev = writing.get(key) ?? Promise.resolve();
  const next = prev.then(async () => {
    const v = queued.get(key) ?? null;
    queued.delete(key);
    try {
      const ref = await accountDoc(key);
      if (!ref) return;
      if (v === null) await ref.delete();
      else await ref.set({ value: v, savedAt: Date.now() });
    } catch (e) {
      console.warn('Saving to your account failed', e);
    }
  });
  writing.set(key, next);
}

export const storage: KeyValueStorage & { removeItemAsync(key: string): Promise<unknown> } = {
  async getItemAsync(key) {
    try {
      const ref = await accountDoc(key);
      if (ref) {
        const snap = await ref.get();
        const value = snap.exists ? snap.data()?.value : undefined;
        if (typeof value === 'string') {
          localSet(key, value);
          return value;
        }
      }
    } catch (e) {
      console.warn('Reading from your account failed', e);
    }
    return localGet(key);
  },
  async setItemAsync(key, value) {
    localSet(key, value);
    writeAccount(key, value);
  },
  async removeItemAsync(key) {
    localSet(key, null);
    writeAccount(key, null);
  },
};
