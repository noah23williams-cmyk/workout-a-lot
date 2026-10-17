import Anthropic from '@anthropic-ai/sdk';
import type { Store } from '../store/store';
import { COACH_TOOLS, runTool, TOOL_LABELS } from './tools';

export type CoachMessage = Anthropic.Beta.BetaMessageParam;
type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

export const SYSTEM_PROMPT = `You are the coach built into Workout-a-lot, a strength training log. You have tools that read the user's logged workouts, exercise history, templates and body measurements, and tools that act in the app: create templates, start a workout, add exercises, adjust or log sets, add custom exercises and record measurements.

How to work:
- Ground advice in the user's actual data. Before recommending loads, look up their history for that exercise; don't guess numbers you can check.
- Weights in tool inputs and outputs are in the user's unit, which get_training_overview reports. Use that unit when you talk to them.
- When the user asks you to build a program or routine, save it with create_template so it appears in their Workout tab, then summarise what you created.
- Use progressive overload sensibly: small jumps (2.5-5%) for compound lifts when the last session's reps were hit, hold or deload when they stalled or missed.
- If the user mentions pain or injury, be conservative, suggest regressions, and recommend a professional for anything beyond ordinary soreness.
- The user is often mid-workout on a phone. Keep replies short and scannable: a few sentences or a compact list. No preamble.
- The chat renders plain text. Use simple "-" lists if needed, but no markdown headings, bold or tables.`;

export interface CoachEvents {
  /** Streamed text for the assistant message currently being generated. */
  onText?(text: string): void;
  onToolStart?(name: string, label: string): void;
  onToolEnd?(name: string, isError: boolean): void;
}

/** Abstraction over the SDK stream call so the loop can be tested offline. */
export type StreamMessage = (
  params: Params,
  onText: (delta: string) => void,
) => Promise<Anthropic.Beta.BetaMessage>;

export function sdkStreamMessage(client: Anthropic): StreamMessage {
  return async (params, onText) => {
    const stream = client.beta.messages.stream(params);
    stream.on('text', (delta) => onText(delta));
    return stream.finalMessage();
  };
}

export class CoachRefusalError extends Error {}

const MAX_STEPS = 16;

export function buildParams(model: string, messages: CoachMessage[]): Params {
  return {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: COACH_TOOLS,
    messages,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    // Retry policy declines on Anthropic's recommended fallback model.
    // Haiku has no server-side fallback, so it's left off there.
    ...(model.startsWith('claude-haiku')
      ? {}
      : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
  } as Params;
}

/**
 * Runs one user turn: streams Claude's reply, executes any tool calls against
 * the store, and loops until Claude is done. Returns the full new history.
 * History is append-only, so thinking blocks stay valid across turns.
 */
export async function runCoachTurn(opts: {
  streamMessage: StreamMessage;
  model: string;
  history: CoachMessage[];
  userText: string;
  store: Store;
  events?: CoachEvents;
}): Promise<CoachMessage[]> {
  const { streamMessage, model, store, events } = opts;
  const messages: CoachMessage[] = [...opts.history, { role: 'user', content: opts.userText }];

  for (let step = 0; step < MAX_STEPS; step++) {
    let text = '';
    const response = await streamWithRetry(streamMessage, buildParams(model, messages), (delta) => {
      text += delta;
      events?.onText?.(text);
    });

    if (response.stop_reason === 'refusal') {
      // Never run tools from a refused turn. Drop the turn so the user can rephrase.
      throw new CoachRefusalError(
        "The coach couldn't help with that request. Try rephrasing it.",
      );
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    );
    if (response.stop_reason === 'pause_turn') continue;
    if (!toolUses.length) return messages;

    const truncated = response.stop_reason === 'max_tokens';
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((use) => {
      events?.onToolStart?.(use.name, TOOL_LABELS[use.name] ?? use.name);
      if (truncated) {
        events?.onToolEnd?.(use.name, true);
        return {
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: 'Your output was cut off before this tool call finished. Retry with a shorter input.',
        };
      }
      let outcome;
      try {
        outcome = runTool(use.name, use.input, store);
      } catch (e) {
        outcome = { content: `Tool failed: ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
      events?.onToolEnd?.(use.name, !!outcome.isError);
      return {
        type: 'tool_result',
        tool_use_id: use.id,
        content: outcome.content,
        ...(outcome.isError ? { is_error: true } : {}),
      };
    });
    // All results go back in a single user message.
    messages.push({ role: 'user', content: results });
  }

  messages.push({
    role: 'assistant',
    content: "I've taken a lot of steps on this one. Tell me if you'd like me to keep going.",
  });
  return messages;
}

/**
 * Tool inputs stream eagerly, so the SDK can fail to parse a malformed one.
 * That surfaces as a non-API error; re-issue the request once. API errors
 * (auth, rate limit, network) propagate unchanged.
 */
async function streamWithRetry(
  streamMessage: StreamMessage,
  params: Params,
  onText: (delta: string) => void,
): Promise<Anthropic.Beta.BetaMessage> {
  try {
    return await streamMessage(params, onText);
  } catch (e) {
    if (e instanceof Anthropic.APIError || e instanceof CoachRefusalError) throw e;
    return streamMessage(params, onText);
  }
}

/** Human-readable message for errors surfaced in the chat. */
export function describeCoachError(e: unknown): string {
  if (e instanceof CoachRefusalError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return 'Your Anthropic API key was rejected. Check it in Settings.';
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to the selected model.";
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and try again.';
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API. Check your connection.";
  if (e instanceof Anthropic.APIError) return `Claude API error (${e.status ?? 'unknown'}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export interface ChatItem {
  key: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  isError?: boolean;
}

/** Flattens raw API history into bubbles for the chat UI. */
export function toChatItems(messages: CoachMessage[]): ChatItem[] {
  const items: ChatItem[] = [];
  const failed = new Set<string>();
  for (const m of messages) {
    if (typeof m.content !== 'string') {
      for (const b of m.content) {
        if (b.type === 'tool_result' && b.is_error) failed.add(b.tool_use_id);
      }
    }
  }
  messages.forEach((m, i) => {
    if (m.role === 'system') return;
    const role = m.role;
    if (typeof m.content === 'string') {
      items.push({ key: `${i}`, role, text: m.content });
      return;
    }
    m.content.forEach((b, j) => {
      if (b.type === 'text' && b.text.trim()) {
        items.push({ key: `${i}.${j}`, role, text: b.text });
      } else if (b.type === 'tool_use') {
        items.push({
          key: `${i}.${j}`,
          role: 'tool',
          text: TOOL_LABELS[b.name] ?? b.name,
          isError: failed.has(b.id),
        });
      }
    });
  });
  return items;
}
