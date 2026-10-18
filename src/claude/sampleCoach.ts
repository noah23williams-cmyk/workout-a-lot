import { isSampleError, type SampleFn, type SampleTool } from '../lib/claudeHost';
import type { Store } from '../store/store';
import { type CoachEvents, type CoachMessage, SYSTEM_PROMPT } from './coach';
import { COACH_TOOLS, runTool, TOOL_LABELS } from './tools';

// Coach turn for the published-artifact build: Claude runs on the viewer's
// own account through the page's `sample` capability, calling the same tools
// as page functions. The platform keeps no memory, so the page sends the chat.

const MAX_CHAT_CHARS = 60_000;

/** The coach tools as page functions. A tool error is thrown so Claude sees it. */
export function sampleTools(store: Store, events?: CoachEvents): SampleTool[] {
  return COACH_TOOLS.map((t) => ({
    name: t.name,
    description: t.description ?? t.name,
    inputSchema: t.input_schema as Record<string, unknown>,
    execute(input) {
      events?.onToolStart?.(t.name, TOOL_LABELS[t.name] ?? t.name);
      const outcome = runTool(t.name, input ?? {}, store);
      events?.onToolEnd?.(t.name, !!outcome.isError);
      if (outcome.isError) throw new Error(outcome.content);
      return JSON.parse(outcome.content);
    },
  }));
}

function textOf(m: CoachMessage): string {
  if (typeof m.content === 'string') return m.content;
  return m.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n\n');
}

/** The chat as plain turns, newest kept, behind a standing instructions turn. */
export function toSampleTurns(history: CoachMessage[], userText: string) {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of history) {
    if (m.role === 'system') continue;
    const content = textOf(m).trim();
    if (content) turns.push({ role: m.role, content });
  }
  turns.push({ role: 'user', content: userText });
  let size = turns.reduce((n, t) => n + t.content.length, 0);
  while (turns.length > 1 && size > MAX_CHAT_CHARS) size -= turns.shift()!.content.length;
  while (turns.length > 1 && turns[0].role !== 'user') turns.shift();
  return [
    {
      role: 'user' as const,
      content: `${SYSTEM_PROMPT}\n\nThe conversation with the user follows. Use your tools whenever the answer depends on their data.`,
    },
    ...turns,
  ];
}

export async function runSampleCoachTurn(opts: {
  sample: SampleFn;
  history: CoachMessage[];
  userText: string;
  store: Store;
  signal?: AbortSignal;
  events?: CoachEvents;
}): Promise<CoachMessage[]> {
  const { sample, history, userText, store, signal, events } = opts;
  // Tools that succeeded, for the chat's activity lines.
  const used: string[] = [];
  const tools = sampleTools(store, {
    ...events,
    onToolEnd(name, isError) {
      if (!isError) used.push(name);
      events?.onToolEnd?.(name, isError);
    },
  });
  const { text, truncated } = await sample(toSampleTurns(history, userText), {
    tools,
    cache: false,
    signal,
    modelTier: 'default',
    onText: ({ text: t }) => events?.onText?.(t),
  });
  // Tool calls are kept only for display; they're never sent back to the API.
  const content = [
    ...used.map((name, i) => ({ type: 'tool_use' as const, id: `sample_${Date.now()}_${i}`, name, input: {} })),
    { type: 'text' as const, text: truncated ? `${text}\n\n(Cut short. Ask for less at a time.)` : text },
  ];
  return [...history, { role: 'user', content: userText }, { role: 'assistant', content } as CoachMessage];
}

export function describeSampleError(e: unknown): string | null {
  if (!isSampleError(e)) return null;
  switch (e.code) {
    case 'cancelled':
      return null;
    case 'not_granted':
      return "The coach needs permission to use Claude. Allow it from this page's Permissions menu, then try again.";
    case 'sampling_disabled':
      return "Claude isn't available for this account.";
    case 'rate_limited':
      return "You've hit a usage limit. Wait a bit, then try again.";
    case 'session_expired':
      return 'Sign in to Claude again, then retry.';
    case 'refused':
      return "The coach couldn't help with that request. Try rephrasing it.";
    case 'prompt_too_large':
      return 'The conversation got too long. Start a new one.';
    case 'tools_unavailable':
      return "This view can't let the coach use your data. Try the Claude app or claude.ai in a browser.";
    default:
      return "Couldn't reach Claude. Try again.";
  }
}
