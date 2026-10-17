import type { KeyValueStorage } from './store';

// expo-sqlite on web needs a WASM worker and cross-origin isolation headers;
// localStorage is plenty for the web preview.
function local(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const storage: KeyValueStorage & { removeItemAsync(key: string): Promise<unknown> } = {
  async getItemAsync(key) {
    return local()?.getItem(key) ?? null;
  },
  async setItemAsync(key, value) {
    local()?.setItem(key, value);
  },
  async removeItemAsync(key) {
    local()?.removeItem(key);
  },
};
