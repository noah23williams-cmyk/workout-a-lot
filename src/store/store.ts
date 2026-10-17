import { BUILT_IN_EXERCISES } from '../domain/exercises';
import type { AppState } from '../domain/types';
import { type Action, initialState, reducer } from './reducer';

export interface KeyValueStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface Store {
  getState(): AppState;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
  hydrated: Promise<void>;
}

const STATE_KEY = 'workout-a-lot/state/v1';

/** Only custom exercises are persisted; the built-in library ships with the app. */
function serialize(state: AppState): string {
  const custom = Object.fromEntries(Object.entries(state.exercises).filter(([, e]) => e.custom));
  return JSON.stringify({ ...state, exercises: custom });
}

function deserialize(raw: string): AppState {
  const parsed = JSON.parse(raw) as Partial<AppState>;
  const base = initialState();
  return {
    ...base,
    ...parsed,
    exercises: { ...BUILT_IN_EXERCISES, ...(parsed.exercises ?? {}) },
    settings: { ...base.settings, ...(parsed.settings ?? {}) },
  };
}

export function createStore(storage: KeyValueStorage | null): Store {
  let state = initialState();
  const listeners = new Set<() => void>();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let hydrating = true;
  const pending: Action[] = [];

  const save = () => {
    if (!storage) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      storage.setItemAsync(STATE_KEY, serialize(state)).catch((e) => {
        console.warn('Failed to save state', e);
      });
    }, 250);
  };

  const apply = (action: Action) => {
    const next = reducer(state, action);
    if (next === state) return;
    state = next;
    listeners.forEach((l) => l());
  };

  const hydrated = (async () => {
    try {
      const raw = storage ? await storage.getItemAsync(STATE_KEY) : null;
      if (raw) apply({ type: 'hydrate', state: deserialize(raw) });
    } catch (e) {
      console.warn('Failed to load saved state', e);
    } finally {
      hydrating = false;
      // Replay anything dispatched before storage finished loading.
      const queued = pending.splice(0);
      queued.forEach(apply);
      if (queued.length) save();
    }
  })();

  return {
    getState: () => state,
    dispatch(action) {
      if (hydrating) {
        pending.push(action);
        return;
      }
      apply(action);
      save();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrated,
  };
}
