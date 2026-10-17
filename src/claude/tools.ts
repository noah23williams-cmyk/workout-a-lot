import type Anthropic from '@anthropic-ai/sdk';
import {
  completedSetCount,
  estimate1RM,
  exerciseBests,
  formatNumber,
  fromKg,
  toKg,
  weeklyWorkoutCounts,
  workoutVolumeKg,
} from '../domain/calc';
import { exerciseTitle, searchExercises, tracksWeight } from '../domain/exercises';
import type {
  AppState,
  BodyPart,
  ExerciseCategory,
  MeasurementType,
  SetType,
  TemplateSet,
  WeightUnit,
  Workout,
  WorkoutSet,
} from '../domain/types';
import { customExerciseId } from '../store/reducer';
import type { Store } from '../store/store';

type Tool = Anthropic.Beta.BetaTool;

const BODY_PARTS: BodyPart[] = [
  'chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full_body', 'cardio', 'other',
];
const CATEGORIES: ExerciseCategory[] = [
  'barbell', 'dumbbell', 'machine', 'cable', 'weighted_bodyweight',
  'assisted_bodyweight', 'reps_only', 'duration', 'cardio',
];
const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const MEASUREMENTS: MeasurementType[] = ['body_weight', 'body_fat', 'waist', 'chest', 'arm', 'thigh'];

const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: 'null' }],
});

const SET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'weight', 'reps', 'duration_sec', 'distance_m'],
  properties: {
    type: { type: 'string', enum: SET_TYPES },
    weight: { ...nullable({ type: 'number' }), description: "Load in the user's unit. Null for bodyweight, duration or cardio." },
    reps: nullable({ type: 'integer' }),
    duration_sec: nullable({ type: 'integer' }),
    distance_m: nullable({ type: 'number' }),
  },
};

function tool(name: string, description: string, properties: Record<string, unknown>): Tool {
  return {
    name,
    description,
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    },
  } as Tool;
}

export const COACH_TOOLS: Tool[] = [
  tool(
    'get_training_overview',
    "Snapshot of the user's training: today's date, their weight unit, workout frequency over the last 8 weeks, recent workouts, saved templates, estimated 1RMs for their main lifts, latest body weight and any workout in progress. Call this first whenever you need context about the user.",
    {},
  ),
  tool(
    'search_exercises',
    'Find exercises in the library (built-in and custom) by name. Returns exercise ids, which every other tool needs. An empty query lists everything, optionally filtered by body part.',
    {
      query: { type: 'string' },
      body_part: nullable({ type: 'string', enum: BODY_PARTS }),
    },
  ),
  tool(
    'get_exercise_history',
    'Every logged session of one exercise, newest first, with each set and the all-time bests (estimated 1RM, heaviest weight, most reps, best set volume). Use this to judge progress and pick next targets.',
    {
      exercise_id: { type: 'string' },
      limit: { ...nullable({ type: 'integer' }), description: 'Max sessions to return; default 10.' },
    },
  ),
  tool(
    'list_workouts',
    'Finished workouts, newest first, with every exercise and set.',
    {
      limit: { ...nullable({ type: 'integer' }), description: 'Default 10.' },
      days: { ...nullable({ type: 'integer' }), description: 'Only workouts from the last N days.' },
    },
  ),
  tool(
    'create_template',
    "Save a reusable workout template (a routine) the user can start from the Workout tab. Weights are in the user's unit. Look up exercise ids with search_exercises first.",
    {
      name: { type: 'string' },
      notes: nullable({ type: 'string' }),
      exercises: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['exercise_id', 'rest_seconds', 'notes', 'sets'],
          properties: {
            exercise_id: { type: 'string' },
            rest_seconds: nullable({ type: 'integer' }),
            notes: nullable({ type: 'string' }),
            sets: { type: 'array', items: SET_SCHEMA },
          },
        },
      },
    },
  ),
  tool(
    'start_workout',
    'Start a workout now, either empty or from a template. Fails if one is already in progress.',
    {
      template_id: nullable({ type: 'string' }),
      name: nullable({ type: 'string' }),
    },
  ),
  tool(
    'get_active_workout',
    'The workout in progress, with ids for each exercise entry and every set (planned and completed).',
    {},
  ),
  tool(
    'add_exercise_to_workout',
    "Add an exercise with planned sets to the workout in progress. Weights are in the user's unit.",
    {
      exercise_id: { type: 'string' },
      rest_seconds: nullable({ type: 'integer' }),
      sets: { type: 'array', items: SET_SCHEMA },
    },
  ),
  tool(
    'update_active_set',
    "Change one set in the workout in progress: adjust its target, or log it as done. Null fields are left unchanged. set_number is 1-based.",
    {
      workout_exercise_id: { type: 'string' },
      set_number: { type: 'integer' },
      weight: nullable({ type: 'number' }),
      reps: nullable({ type: 'integer' }),
      rpe: nullable({ type: 'number' }),
      completed: nullable({ type: 'boolean' }),
    },
  ),
  tool(
    'create_custom_exercise',
    "Add an exercise that isn't in the library. Search first so you don't create duplicates.",
    {
      name: { type: 'string' },
      body_part: { type: 'string', enum: BODY_PARTS },
      category: { type: 'string', enum: CATEGORIES },
    },
  ),
  tool(
    'log_measurement',
    "Record a body measurement for today. body_weight is in the user's weight unit, body_fat in percent, circumferences in centimetres.",
    {
      type: { type: 'string', enum: MEASUREMENTS },
      value: { type: 'number' },
    },
  ),
];

/** Short labels shown in the chat while a tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  get_training_overview: 'Reviewed your training',
  search_exercises: 'Searched exercises',
  get_exercise_history: 'Checked exercise history',
  list_workouts: 'Read your workouts',
  create_template: 'Created a template',
  start_workout: 'Started a workout',
  get_active_workout: 'Checked your current workout',
  add_exercise_to_workout: 'Added an exercise',
  update_active_set: 'Updated a set',
  create_custom_exercise: 'Created an exercise',
  log_measurement: 'Logged a measurement',
};

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

class ToolInputError extends Error {}

// Tool inputs are streamed eagerly, so the API doesn't validate them for us;
// every field is checked here before anything touches the store.
type Input = Record<string, unknown>;

function str(input: Input, key: string): string {
  const v = input[key];
  if (typeof v !== 'string' || !v.trim()) throw new ToolInputError(`"${key}" must be a non-empty string`);
  return v.trim();
}
function optStr(input: Input, key: string): string | undefined {
  const v = input[key];
  if (v == null) return undefined;
  if (typeof v !== 'string') throw new ToolInputError(`"${key}" must be a string or null`);
  return v.trim() || undefined;
}
function optNum(input: Input, key: string, { min = 0, int = false } = {}): number | undefined {
  const v = input[key];
  if (v == null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || (int && !Number.isInteger(v))) {
    throw new ToolInputError(`"${key}" must be ${int ? 'an integer' : 'a number'} >= ${min} or null`);
  }
  return v;
}
function optBool(input: Input, key: string): boolean | undefined {
  const v = input[key];
  if (v == null) return undefined;
  if (typeof v !== 'boolean') throw new ToolInputError(`"${key}" must be a boolean or null`);
  return v;
}
function oneOf<T extends string>(input: Input, key: string, allowed: readonly T[]): T {
  const v = input[key];
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new ToolInputError(`"${key}" must be one of: ${allowed.join(', ')}`);
  }
  return v as T;
}
function arr(input: Input, key: string): Input[] {
  const v = input[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'object' || x === null)) {
    throw new ToolInputError(`"${key}" must be an array of objects`);
  }
  return v as Input[];
}

function parseSets(raw: Input[], unit: WeightUnit): TemplateSet[] {
  return raw.map((s) => {
    const weight = optNum(s, 'weight');
    return {
      type: oneOf(s, 'type', SET_TYPES),
      weightKg: weight === undefined ? undefined : toKg(weight, unit),
      reps: optNum(s, 'reps', { int: true }),
      durationSec: optNum(s, 'duration_sec', { int: true }),
      distanceM: optNum(s, 'distance_m'),
    };
  });
}

function requireExercise(state: AppState, id: string) {
  const e = state.exercises[id];
  if (!e) throw new ToolInputError(`Unknown exercise_id "${id}". Use search_exercises to find valid ids.`);
  return e;
}

function describeSet(s: WorkoutSet | TemplateSet, unit: WeightUnit) {
  const out: Record<string, unknown> = { type: s.type };
  if (s.weightKg !== undefined) out.weight = Number(formatNumber(fromKg(s.weightKg, unit)));
  if (s.reps !== undefined) out.reps = s.reps;
  if (s.durationSec !== undefined) out.duration_sec = s.durationSec;
  if (s.distanceM !== undefined) out.distance_m = s.distanceM;
  if ('rpe' in s && s.rpe !== undefined) out.rpe = s.rpe;
  if ('completed' in s) out.completed = s.completed;
  return out;
}

function describeWorkout(state: AppState, w: Workout, withIds = false) {
  const unit = state.settings.unit;
  return {
    ...(withIds ? { id: w.id } : {}),
    name: w.name,
    date: new Date(w.startedAt).toISOString().slice(0, 10),
    duration_min: w.finishedAt ? Math.round((w.finishedAt - w.startedAt) / 60000) : undefined,
    volume: Math.round(fromKg(workoutVolumeKg(w), unit)),
    personal_records: w.prs?.length
      ? w.prs.map((p) => `${state.exercises[p.exerciseId]?.name ?? p.exerciseId} ${p.kind}`)
      : undefined,
    exercises: w.exercises.map((e) => ({
      ...(withIds ? { workout_exercise_id: e.id } : {}),
      exercise_id: e.exerciseId,
      exercise: state.exercises[e.exerciseId] ? exerciseTitle(state.exercises[e.exerciseId]) : e.exerciseId,
      notes: e.notes,
      sets: e.sets.map((s) => describeSet(s, unit)),
    })),
  };
}

function overview(state: AppState) {
  const unit = state.settings.unit;
  const sorted = [...state.workouts].sort((a, b) => b.startedAt - a.startedAt);
  const lifted = new Map<string, number>();
  for (const w of sorted) for (const e of w.exercises) lifted.set(e.exerciseId, (lifted.get(e.exerciseId) ?? 0) + 1);
  const topLifts = [...lifted.entries()]
    .filter(([id]) => state.exercises[id] && tracksWeight(state.exercises[id].category))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, sessions]) => ({
      exercise_id: id,
      exercise: exerciseTitle(state.exercises[id]),
      sessions,
      estimated_1rm: Number(formatNumber(fromKg(exerciseBests(state.workouts, id).e1rm, unit))),
    }));
  const bw = state.measurements.find((m) => m.type === 'body_weight');
  return {
    today: new Date().toISOString().slice(0, 10),
    unit,
    total_workouts: state.workouts.length,
    workouts_per_week_last_8_weeks: weeklyWorkoutCounts(state.workouts, 8),
    recent_workouts: sorted.slice(0, 5).map((w) => ({
      name: w.name,
      date: new Date(w.startedAt).toISOString().slice(0, 10),
      sets: completedSetCount(w),
      exercises: w.exercises.map((e) => state.exercises[e.exerciseId]?.name ?? e.exerciseId),
    })),
    templates: state.templates.map((t) => ({ id: t.id, name: t.name, exercises: t.exercises.length })),
    top_lifts: topLifts,
    latest_body_weight: bw ? Number(formatNumber(fromKg(bw.value, unit))) : null,
    workout_in_progress: state.activeWorkout
      ? { name: state.activeWorkout.name, exercises: state.activeWorkout.exercises.length }
      : null,
  };
}

export function runTool(name: string, rawInput: unknown, store: Store): ToolOutcome {
  try {
    if (typeof rawInput !== 'object' || rawInput === null) {
      throw new ToolInputError('Tool input must be a JSON object');
    }
    const input = rawInput as Input;
    const state = store.getState();
    const unit = state.settings.unit;
    const json = (v: unknown): ToolOutcome => ({ content: JSON.stringify(v) });

    switch (name) {
      case 'get_training_overview':
        return json(overview(state));

      case 'search_exercises': {
        const query = typeof input.query === 'string' ? input.query : '';
        const bodyPart = input.body_part == null ? null : oneOf(input, 'body_part', BODY_PARTS);
        const results = searchExercises(state.exercises, query, bodyPart).slice(0, 40);
        return json(results.map((e) => ({ id: e.id, name: exerciseTitle(e), body_part: e.bodyPart, category: e.category })));
      }

      case 'get_exercise_history': {
        const ex = requireExercise(state, str(input, 'exercise_id'));
        const limit = optNum(input, 'limit', { min: 1, int: true }) ?? 10;
        const sessions = [...state.workouts]
          .sort((a, b) => b.startedAt - a.startedAt)
          .filter((w) => w.exercises.some((e) => e.exerciseId === ex.id))
          .slice(0, limit)
          .map((w) => {
            const sets = w.exercises.filter((e) => e.exerciseId === ex.id).flatMap((e) => e.sets);
            const best = Math.max(0, ...sets.map((s) => estimate1RM(s.weightKg ?? 0, s.reps ?? 0)));
            return {
              date: new Date(w.startedAt).toISOString().slice(0, 10),
              sets: sets.map((s) => describeSet(s, unit)),
              estimated_1rm: tracksWeight(ex.category) ? Number(formatNumber(fromKg(best, unit))) : undefined,
            };
          });
        const b = exerciseBests(state.workouts, ex.id);
        return json({
          exercise: exerciseTitle(ex),
          unit,
          all_time_bests: {
            estimated_1rm: Number(formatNumber(fromKg(b.e1rm, unit))),
            heaviest_weight: Number(formatNumber(fromKg(b.weight, unit))),
            most_reps: b.reps,
            best_set_volume: Math.round(fromKg(b.volume, unit)),
          },
          sessions,
        });
      }

      case 'list_workouts': {
        const limit = optNum(input, 'limit', { min: 1, int: true }) ?? 10;
        const days = optNum(input, 'days', { min: 1, int: true });
        const since = days ? Date.now() - days * 86_400_000 : 0;
        const workouts = [...state.workouts]
          .filter((w) => w.startedAt >= since)
          .sort((a, b) => b.startedAt - a.startedAt)
          .slice(0, limit);
        return json({ unit, workouts: workouts.map((w) => describeWorkout(state, w)) });
      }

      case 'create_template': {
        const exercises = arr(input, 'exercises').map((e) => {
          requireExercise(state, str(e, 'exercise_id'));
          return {
            exerciseId: str(e, 'exercise_id'),
            restSeconds: optNum(e, 'rest_seconds', { int: true }),
            notes: optStr(e, 'notes'),
            sets: parseSets(arr(e, 'sets'), unit),
          };
        });
        if (!exercises.length) throw new ToolInputError('A template needs at least one exercise');
        const before = new Set(state.templates.map((t) => t.id));
        store.dispatch({
          type: 'saveTemplate',
          template: { name: str(input, 'name'), notes: optStr(input, 'notes'), exercises, createdBy: 'coach' },
        });
        const created = store.getState().templates.find((t) => !before.has(t.id));
        return json({ template_id: created?.id, name: created?.name, exercises: exercises.length });
      }

      case 'start_workout': {
        if (state.activeWorkout) {
          return { content: `A workout ("${state.activeWorkout.name}") is already in progress.`, isError: true };
        }
        const templateId = optStr(input, 'template_id');
        if (templateId && !state.templates.some((t) => t.id === templateId)) {
          throw new ToolInputError(`Unknown template_id "${templateId}"`);
        }
        store.dispatch({ type: 'startWorkout', templateId, name: optStr(input, 'name') });
        const active = store.getState().activeWorkout;
        return json(active ? describeWorkout(store.getState(), active, true) : null);
      }

      case 'get_active_workout': {
        const active = state.activeWorkout;
        return json(active ? { unit, ...describeWorkout(state, active, true) } : { workout_in_progress: false });
      }

      case 'add_exercise_to_workout': {
        if (!state.activeWorkout) return { content: 'No workout in progress. Start one first.', isError: true };
        const ex = requireExercise(state, str(input, 'exercise_id'));
        const sets = parseSets(arr(input, 'sets'), unit).map((s) => ({ ...s, completed: false }));
        store.dispatch({
          type: 'addExercise',
          exerciseId: ex.id,
          sets,
          restSeconds: optNum(input, 'rest_seconds', { int: true }),
        });
        const added = store.getState().activeWorkout?.exercises.at(-1);
        return json({ workout_exercise_id: added?.id, exercise: exerciseTitle(ex), sets: added?.sets.length });
      }

      case 'update_active_set': {
        const active = state.activeWorkout;
        if (!active) return { content: 'No workout in progress.', isError: true };
        const weId = str(input, 'workout_exercise_id');
        const entry = active.exercises.find((e) => e.id === weId);
        if (!entry) throw new ToolInputError(`Unknown workout_exercise_id "${weId}". Call get_active_workout.`);
        const n = optNum(input, 'set_number', { min: 1, int: true });
        const set = n ? entry.sets[n - 1] : undefined;
        if (!set) throw new ToolInputError(`set_number must be between 1 and ${entry.sets.length}`);
        const weight = optNum(input, 'weight');
        const patch: Partial<WorkoutSet> = {};
        if (weight !== undefined) patch.weightKg = toKg(weight, unit);
        const reps = optNum(input, 'reps', { int: true });
        if (reps !== undefined) patch.reps = reps;
        const rpe = optNum(input, 'rpe', { min: 1 });
        if (rpe !== undefined) patch.rpe = rpe;
        const completed = optBool(input, 'completed');
        if (completed !== undefined) patch.completed = completed;
        store.dispatch({ type: 'updateSet', workoutExerciseId: weId, setId: set.id, patch });
        return json({ updated: true, set: describeSet({ ...set, ...patch }, unit) });
      }

      case 'create_custom_exercise': {
        const exName = str(input, 'name');
        const category = oneOf(input, 'category', CATEGORIES);
        const id = customExerciseId(exName, category);
        if (state.exercises[id]) return json({ exercise_id: id, already_existed: true });
        store.dispatch({
          type: 'addCustomExercise',
          exercise: { name: exName, category, bodyPart: oneOf(input, 'body_part', BODY_PARTS) },
        });
        return json({ exercise_id: id });
      }

      case 'log_measurement': {
        const type = oneOf(input, 'type', MEASUREMENTS);
        const value = optNum(input, 'value');
        if (value === undefined) throw new ToolInputError('"value" is required');
        store.dispatch({
          type: 'logMeasurement',
          measurement: { type, value: type === 'body_weight' ? toKg(value, unit) : value },
        });
        return json({ logged: true });
      }

      default:
        return { content: `Unknown tool "${name}"`, isError: true };
    }
  } catch (e) {
    if (e instanceof ToolInputError) return { content: `Invalid input: ${e.message}`, isError: true };
    throw e;
  }
}
