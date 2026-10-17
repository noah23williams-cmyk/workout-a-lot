import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState, useStore } from '../store/AppStore';
import { createClient, loadApiKey, loadChat, saveChat } from './client';
import { type CoachMessage, describeCoachError, runCoachTurn, sdkStreamMessage } from './coach';

export interface CoachStatus {
  /** Text Claude is streaming right now. */
  draft: string;
  /** Label of the tool currently running. */
  activity: string | null;
  error: string | null;
  busy: boolean;
}

export function useCoach() {
  const store = useStore();
  const model = useAppState((s) => s.settings.coachModel);
  const [history, setHistory] = useState<CoachMessage[]>([]);
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<CoachStatus>({ draft: '', activity: null, error: null, busy: false });
  const historyRef = useRef(history);
  historyRef.current = history;

  const refreshKey = useCallback(() => {
    loadApiKey().then(setApiKey, () => setApiKey(null));
  }, []);

  useEffect(() => {
    refreshKey();
    loadChat().then(setHistory);
  }, [refreshKey]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !apiKey || status.busy) return;
      const before = historyRef.current;
      // Show the user's message immediately.
      setHistory([...before, { role: 'user', content: trimmed }]);
      setStatus({ draft: '', activity: null, error: null, busy: true });
      try {
        const next = await runCoachTurn({
          streamMessage: sdkStreamMessage(createClient(apiKey)),
          model,
          history: before,
          userText: trimmed,
          store,
          events: {
            onText: (draft) => setStatus((s) => ({ ...s, draft, activity: null })),
            onToolStart: (_name, label) => setStatus((s) => ({ ...s, draft: '', activity: label })),
            onToolEnd: () => setStatus((s) => ({ ...s, activity: null })),
          },
        });
        setHistory(next);
        await saveChat(next);
        setStatus({ draft: '', activity: null, error: null, busy: false });
      } catch (e) {
        // Roll back to the last complete turn so history stays valid.
        setHistory(before);
        setStatus({ draft: '', activity: null, error: describeCoachError(e), busy: false });
      }
    },
    [apiKey, model, status.busy, store],
  );

  const clear = useCallback(async () => {
    setHistory([]);
    setStatus({ draft: '', activity: null, error: null, busy: false });
    await saveChat([]);
  }, []);

  return { history, status, send, clear, apiKey, refreshKey };
}
