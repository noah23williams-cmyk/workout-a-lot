import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  buildParams,
  CoachRefusalError,
  runCoachTurn,
  type StreamMessage,
  toChatItems,
} from '../src/claude/coach';
import { COACH_TOOLS, runTool } from '../src/claude/tools';
import { createStore } from '../src/store/store';

async function freshStore() {
  const store = createStore(null);
  await store.hydrated;
  return store;
}

type Block = Anthropic.Beta.BetaContentBlock;

function message(content: Block[], stop_reason: Anthropic.Beta.BetaMessage['stop_reason']): Anthropic.Beta.BetaMessage {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Beta.BetaMessage;
}

const text = (t: string) => ({ type: 'text', text: t, citations: null }) as unknown as Block;
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as unknown as Block;

/** Replays scripted responses and records the requests it received. */
function scripted(responses: Anthropic.Beta.BetaMessage[]) {
  const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const fn: StreamMessage = async (params, onText) => {
    requests.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error('no more scripted responses');
    for (const b of next.content) if (b.type === 'text') onText(b.text);
    return next;
  };
  return { fn, requests };
}

describe('tool schemas', () => {
  it('are strict with every property required', () => {
    for (const t of COACH_TOOLS) {
      expect(t.strict).toBe(true);
      const schema = t.input_schema as { properties?: object; required?: string[]; additionalProperties?: boolean };
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required?.sort()).toEqual(Object.keys(schema.properties ?? {}).sort());
    }
  });
});

describe('runTool', () => {
  it('creates a template with weights converted from the user unit', async () => {
    const store = await freshStore();
    store.dispatch({ type: 'updateSettings', patch: { unit: 'lb' } });
    const out = runTool(
      'create_template',
      {
        name: 'Upper A',
        notes: null,
        exercises: [
          {
            exercise_id: 'bench-press-barbell',
            rest_seconds: 180,
            notes: null,
            sets: [{ type: 'normal', weight: 225, reps: 5, duration_sec: null, distance_m: null }],
          },
        ],
      },
      store,
    );
    expect(out.isError).toBeFalsy();
    const t = store.getState().templates[0];
    expect(t).toMatchObject({ name: 'Upper A', createdBy: 'coach' });
    expect(t.exercises[0].sets[0].weightKg).toBeCloseTo(102.06, 2);
    expect(JSON.parse(out.content).template_id).toBe(t.id);
  });

  it('rejects unknown exercise ids without touching state', async () => {
    const store = await freshStore();
    const out = runTool('create_template', { name: 'X', notes: null, exercises: [{ exercise_id: 'made-up', rest_seconds: null, notes: null, sets: [] }] }, store);
    expect(out.isError).toBe(true);
    expect(out.content).toMatch(/search_exercises/);
    expect(store.getState().templates).toEqual([]);
  });

  it('rejects malformed input that a truncated stream could produce', async () => {
    const store = await freshStore();
    const out = runTool('log_measurement', { type: 'body_weight' }, store);
    expect(out.isError).toBe(true);
    expect(store.getState().measurements).toEqual([]);
  });

  it('drives a workout: start, add an exercise, log a set', async () => {
    const store = await freshStore();
    runTool('start_workout', { template_id: null, name: 'Coach session' }, store);
    const added = JSON.parse(
      runTool('add_exercise_to_workout', {
        exercise_id: 'squat-barbell',
        rest_seconds: 150,
        sets: [{ type: 'normal', weight: 100, reps: 5, duration_sec: null, distance_m: null }],
      }, store).content,
    );
    const out = runTool('update_active_set', {
      workout_exercise_id: added.workout_exercise_id, set_number: 1, weight: null, reps: 6, rpe: 8, completed: true,
    }, store);
    expect(out.isError).toBeFalsy();
    expect(store.getState().activeWorkout?.exercises[0].sets[0]).toMatchObject({ weightKg: 100, reps: 6, rpe: 8, completed: true });
    expect(runTool('start_workout', { template_id: null, name: null }, store).isError).toBe(true);
  });

  it('reports history and bests in the user unit', async () => {
    const store = await freshStore();
    store.dispatch({ type: 'startWorkout' });
    store.dispatch({ type: 'addExercise', exerciseId: 'squat-barbell', sets: [{ type: 'normal', weightKg: 100, reps: 1, completed: true }] });
    store.dispatch({ type: 'finishWorkout' });
    const out = JSON.parse(runTool('get_exercise_history', { exercise_id: 'squat-barbell', limit: null }, store).content);
    expect(out.all_time_bests.estimated_1rm).toBe(100);
    expect(out.sessions).toHaveLength(1);
    const overview = JSON.parse(runTool('get_training_overview', {}, store).content);
    expect(overview.total_workouts).toBe(1);
    expect(overview.top_lifts[0].exercise_id).toBe('squat-barbell');
  });
});

describe('buildParams', () => {
  it('uses adaptive thinking, explicit effort, caching and server-side fallback', () => {
    const p = buildParams('claude-opus-5-5', [{ role: 'user', content: 'hi' }]) as unknown as Record<string, unknown>;
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.output_config).toEqual({ effort: 'medium' });
    expect(p.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.fallbacks).toBe('default');
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(p.tool_choice).toBeUndefined();
  });
  it('leaves fallbacks off for Haiku, which has none', () => {
    const p = buildParams('claude-haiku-5-5', []) as unknown as Record<string, unknown>;
    expect(p.fallbacks).toBeUndefined();
    expect(p.betas).toBeUndefined();
  });
});

describe('runCoachTurn', () => {
  it('executes tools, returns all results in one user message, and loops to the answer', async () => {
    const store = await freshStore();
    const { fn, requests } = scripted([
      message([
        text('Let me check.'),
        toolUse('t1', 'get_training_overview', {}),
        toolUse('t2', 'log_measurement', { type: 'body_weight', value: 80 }),
      ], 'tool_use'),
      message([text('Logged 80 kg. You have no workouts yet.')], 'end_turn'),
    ]);
    const drafts: string[] = [];
    const history = await runCoachTurn({
      streamMessage: fn, model: 'claude-opus-5-5', history: [], userText: 'I weigh 80', store,
      events: { onText: (t) => drafts.push(t) },
    });

    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    const results = history[2].content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(['t1', 't2']);
    expect(store.getState().measurements[0]).toMatchObject({ type: 'body_weight', value: 80 });
    // Second request carries the full, unedited first turn.
    expect(requests[1].messages).toHaveLength(3);
    expect(drafts.at(-1)).toBe('Logged 80 kg. You have no workouts yet.');
    expect(toChatItems(history).map((i) => i.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'assistant']);
  });

  it('never runs tools from a refused turn', async () => {
    const store = await freshStore();
    const { fn } = scripted([message([toolUse('t1', 'log_measurement', { type: 'body_weight', value: 80 })], 'refusal')]);
    await expect(
      runCoachTurn({ streamMessage: fn, model: 'claude-opus-5-5', history: [], userText: 'x', store }),
    ).rejects.toBeInstanceOf(CoachRefusalError);
    expect(store.getState().measurements).toEqual([]);
  });

  it('returns errors instead of running tools when output hit max_tokens', async () => {
    const store = await freshStore();
    const { fn } = scripted([
      message([toolUse('t1', 'log_measurement', { type: 'body_weight' })], 'max_tokens'),
      message([text('Sorry, retrying later.')], 'end_turn'),
    ]);
    const history = await runCoachTurn({ streamMessage: fn, model: 'claude-opus-5-5', history: [], userText: 'x', store });
    const result = (history[2].content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(result.is_error).toBe(true);
    expect(store.getState().measurements).toEqual([]);
  });

  it('re-issues a request once when the stream fails to parse', async () => {
    const store = await freshStore();
    let calls = 0;
    const fn: StreamMessage = async () => {
      calls += 1;
      if (calls === 1) throw new SyntaxError('Unexpected end of JSON input');
      return message([text('ok')], 'end_turn');
    };
    await runCoachTurn({ streamMessage: fn, model: 'claude-opus-5-5', history: [], userText: 'x', store });
    expect(calls).toBe(2);
  });
});
