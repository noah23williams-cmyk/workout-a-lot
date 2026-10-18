import { useCallback, useEffect, useRef, useState } from 'react';
import { type SampleFn, useHostCapability } from '../lib/claudeHost';
import { useAppState, useStore } from '../store/AppStore';
import { createClient, loadApiKey, loadChat, saveChat } from './client';
import { type CoachMessage, describeCoachError, runCoachTurn, sdkStreamMessage } from './coach';
import { describeSampleError, runSampleCoachTurn } from './sampleCoach';

export interface CoachStatus {
  /** Text Claude is streaming right now. */
  draft: string;
  /** Label of the tool currently running. */
  activity: string | null;
  error: string | null;
  busy: boolean;
}

/**
 * How the coach reaches Claude: the viewer's own Claude account when the app
 * runs as a published Claude artifact, otherwise the user's API key.
 */
export type CoachConnection =
  | { kind: 'loading' }
  | { kind: 'account'; sample: SampleFn }
  | { kind: 'apiKey'; key: string | null };

const IDLE: CoachStatus = { draft: '', activity: null, error: null, busy: false };

export function useCoach() {
  const store = useStore();
  const model = useAppState((s) => s.settings.coachModel);
  const [history, setHistory] = useState<CoachMessage[]>([]);
  const [connection, setConnection] = useState<CoachConnection>({ kind: 'loading' });
  const [status, setStatus] = useState<CoachStatus>(IDLE);
  const historyRef = useRef(history);
  historyRef.current = history;
  const abort = useRef<AbortController | null>(null);
  const chatKey = connection.kind === 'account' ? 'account' : 'api';

  const refreshKey = useCallback(() => {
    setConnection((c) => {
      if (c.kind === 'account') return c;
      loadApiKey().then(
        (key) => setConnection((cur) => (cur.kind === 'account' ? cur : { kind: 'apiKey', key })),
        () => setConnection((cur) => (cur.kind === 'account' ? cur : { kind: 'apiKey', key: null })),
      );
      return c;
    });
  }, []);

  useEffect(() => {
    let live = true;
    useHostCapability('sample').then((sample) => {
      if (!live) return;
      if (sample) setConnection({ kind: 'account', sample });
      else refreshKey();
    });
    return () => {
      live = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (connection.kind === 'loading') return;
    loadChat(chatKey).then(setHistory);
  }, [chatKey, connection.kind]);

  const events = {
    onText: (draft: string) => setStatus((s) => ({ ...s, draft, activity: null })),
    onToolStart: (_name: string, label: string) => setStatus((s) => ({ ...s, activity: label })),
    onToolEnd: () => setStatus((s) => ({ ...s, activity: null })),
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status.busy || connection.kind === 'loading') return;
    if (connection.kind === 'apiKey' && !connection.key) return;
    const before = historyRef.current;
    // Show the user's message immediately.
    setHistory([...before, { role: 'user', content: trimmed }]);
    setStatus({ ...IDLE, busy: true });
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const next =
        connection.kind === 'account'
          ? await runSampleCoachTurn({ sample: connection.sample, history: before, userText: trimmed, store, signal: ctl.signal, events })
          : await runCoachTurn({
              streamMessage: sdkStreamMessage(createClient(connection.key!)),
              model,
              history: before,
              userText: trimmed,
              store,
              events,
            });
      setHistory(next);
      await saveChat(next, chatKey);
      setStatus(IDLE);
    } catch (e) {
      // Roll back to the last complete turn so history stays valid.
      setHistory(before);
      const message = connection.kind === 'account' ? describeSampleError(e) : describeCoachError(e);
      setStatus({ ...IDLE, error: message });
    } finally {
      abort.current = null;
    }
  };

  const stop = useCallback(() => abort.current?.abort(), []);

  const clear = useCallback(async () => {
    setHistory([]);
    setStatus(IDLE);
    await saveChat([], chatKey);
  }, [chatKey]);

  return { history, status, send, stop, clear, connection, refreshKey };
}
