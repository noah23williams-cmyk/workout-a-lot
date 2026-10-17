import Anthropic from '@anthropic-ai/sdk';
import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { storage as Storage } from '../store/storage';
import type { CoachMessage } from './coach';

const KEY_NAME = 'anthropic_api_key';
const CHAT_KEY = 'workout-a-lot/coach/v1';

// The key lives in the iOS Keychain / Android Keystore. Web has no secure
// store, so it falls back to the local database there.
export async function loadApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') return Storage.getItemAsync(KEY_NAME);
  return SecureStore.getItemAsync(KEY_NAME);
}

export async function saveApiKey(key: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (key) await Storage.setItemAsync(KEY_NAME, key);
    else await Storage.removeItemAsync(KEY_NAME);
    return;
  }
  if (key) await SecureStore.setItemAsync(KEY_NAME, key);
  else await SecureStore.deleteItemAsync(KEY_NAME);
}

export function createClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    // The app calls the API directly with the user's own key, stored on
    // their device; there is no server in between to protect it.
    dangerouslyAllowBrowser: true,
    // React Native's built-in fetch can't stream response bodies; expo/fetch can.
    ...(Platform.OS === 'web' ? {} : { fetch: expoFetch as unknown as typeof globalThis.fetch }),
  });
}

export async function loadChat(): Promise<CoachMessage[]> {
  try {
    const raw = await Storage.getItemAsync(CHAT_KEY);
    return raw ? (JSON.parse(raw) as CoachMessage[]) : [];
  } catch {
    return [];
  }
}

export async function saveChat(messages: CoachMessage[]): Promise<void> {
  await Storage.setItemAsync(CHAT_KEY, JSON.stringify(messages));
}
