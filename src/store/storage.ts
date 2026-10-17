import Storage from 'expo-sqlite/kv-store';
import type { KeyValueStorage } from './store';

/** On-device key-value store backed by SQLite. */
export const storage: KeyValueStorage & { removeItemAsync(key: string): Promise<unknown> } = Storage;
