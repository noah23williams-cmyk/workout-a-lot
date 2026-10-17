import { detectPRs } from '../domain/calc';
import { BUILT_IN_EXERCISES, slug } from '../domain/exercises';
import type {
  AppState,
  Exercise,
  Measurement,
  Settings,
  Template,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../domain/types';
import { uid } from '../lib/id';

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  defaultRestSeconds: 120,
  barWeightKg: 20,
  coachModel: 'claude-opus-5-5',
};

export function initialState(): AppState {
  return {
    exercises: { ...BUILT_IN_EXERCISES },
    workouts: [],
    templates: [],
    measurements: [],
    activeWorkout: null,
    settings: DEFAULT_SETTINGS,
  };
}

type SetPatch = Partial<Omit<WorkoutSet, 'id'>>;

export type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'startWorkout'; name?: string; templateId?: string; now?: number }
  | { type: 'renameWorkout'; name: string }
  | { type: 'addExercise'; exerciseId: string; sets?: Omit<WorkoutSet, 'id'>[]; restSeconds?: number }
  | { type: 'removeExercise'; workoutExerciseId: string }
  | { type: 'setExerciseNotes'; workoutExerciseId: string; notes: string }
  | { type: 'addSet'; workoutExerciseId: string }
  | { type: 'updateSet'; workoutExerciseId: string; setId: string; patch: SetPatch }
  | { type: 'removeSet'; workoutExerciseId: string; setId: string }
  | { type: 'finishWorkout'; now?: number }
  | { type: 'discardWorkout' }
  | { type: 'deleteWorkout'; workoutId: string }
  | { type: 'saveTemplate'; template: Omit<Template, 'id' | 'createdAt'> & { id?: string } }
  | { type: 'templateFromWorkout'; workoutId: string; name?: string }
  | { type: 'deleteTemplate'; templateId: string }
  | { type: 'addCustomExercise'; exercise: Omit<Exercise, 'id' | 'custom'> }
  | { type: 'logMeasurement'; measurement: Omit<Measurement, 'id' | 'at'> & { at?: number } }
  | { type: 'updateSettings'; patch: Partial<Settings> };

function newSet(from?: Partial<WorkoutSet>): WorkoutSet {
  return { type: 'normal', completed: false, ...from, id: uid() };
}

function templateToWorkoutExercises(t: Template): WorkoutExercise[] {
  return t.exercises.map((te) => ({
    id: uid(),
    exerciseId: te.exerciseId,
    restSeconds: te.restSeconds,
    notes: te.notes,
    supersetId: te.supersetId,
    sets: te.sets.map((s) => newSet({ ...s, completed: false })),
  }));
}

function mapActive(state: AppState, fn: (w: Workout) => Workout): AppState {
  return state.activeWorkout ? { ...state, activeWorkout: fn(state.activeWorkout) } : state;
}

function mapExercise(
  w: Workout,
  workoutExerciseId: string,
  fn: (e: WorkoutExercise) => WorkoutExercise,
): Workout {
  return {
    ...w,
    exercises: w.exercises.map((e) => (e.id === workoutExerciseId ? fn(e) : e)),
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state;

    case 'startWorkout': {
      if (state.activeWorkout) return state;
      const template = action.templateId
        ? state.templates.find((t) => t.id === action.templateId)
        : undefined;
      const workout: Workout = {
        id: uid(),
        name: action.name ?? template?.name ?? defaultWorkoutName(action.now ?? Date.now()),
        startedAt: action.now ?? Date.now(),
        exercises: template ? templateToWorkoutExercises(template) : [],
        templateId: template?.id,
      };
      return { ...state, activeWorkout: workout };
    }

    case 'renameWorkout':
      return mapActive(state, (w) => ({ ...w, name: action.name }));

    case 'addExercise': {
      if (!state.exercises[action.exerciseId]) return state;
      return mapActive(state, (w) => ({
        ...w,
        exercises: [
          ...w.exercises,
          {
            id: uid(),
            exerciseId: action.exerciseId,
            restSeconds: action.restSeconds,
            sets: action.sets?.length ? action.sets.map((s) => newSet(s)) : [newSet()],
          },
        ],
      }));
    }

    case 'removeExercise':
      return mapActive(state, (w) => ({
        ...w,
        exercises: w.exercises.filter((e) => e.id !== action.workoutExerciseId),
      }));

    case 'setExerciseNotes':
      return mapActive(state, (w) =>
        mapExercise(w, action.workoutExerciseId, (e) => ({ ...e, notes: action.notes })),
      );

    case 'addSet':
      return mapActive(state, (w) =>
        mapExercise(w, action.workoutExerciseId, (e) => {
          // New sets copy the previous set's targets, like Strong.
          const last = e.sets[e.sets.length - 1];
          const copy = last
            ? {
                weightKg: last.weightKg,
                reps: last.reps,
                durationSec: last.durationSec,
                distanceM: last.distanceM,
                type: last.type === 'warmup' ? 'normal' : last.type,
              }
            : undefined;
          return { ...e, sets: [...e.sets, newSet(copy)] };
        }),
      );

    case 'updateSet':
      return mapActive(state, (w) =>
        mapExercise(w, action.workoutExerciseId, (e) => ({
          ...e,
          sets: e.sets.map((s) => (s.id === action.setId ? { ...s, ...action.patch } : s)),
        })),
      );

    case 'removeSet':
      return mapActive(state, (w) =>
        mapExercise(w, action.workoutExerciseId, (e) => ({
          ...e,
          sets: e.sets.filter((s) => s.id !== action.setId),
        })),
      );

    case 'finishWorkout': {
      const active = state.activeWorkout;
      if (!active) return state;
      // Drop incomplete sets and exercises with nothing logged.
      const exercises = active.exercises
        .map((e) => ({ ...e, sets: e.sets.filter((s) => s.completed) }))
        .filter((e) => e.sets.length > 0);
      const finished: Workout = { ...active, exercises, finishedAt: action.now ?? Date.now() };
      finished.prs = detectPRs(finished, state.workouts, (id) => state.exercises[id]?.category);
      return {
        ...state,
        activeWorkout: null,
        workouts: exercises.length ? [finished, ...state.workouts] : state.workouts,
      };
    }

    case 'discardWorkout':
      return { ...state, activeWorkout: null };

    case 'deleteWorkout':
      return { ...state, workouts: state.workouts.filter((w) => w.id !== action.workoutId) };

    case 'saveTemplate': {
      const { id, ...rest } = action.template;
      const existing = id ? state.templates.find((t) => t.id === id) : undefined;
      const exercises = rest.exercises.filter((e) => state.exercises[e.exerciseId]);
      if (existing) {
        return {
          ...state,
          templates: state.templates.map((t) => (t.id === id ? { ...t, ...rest, exercises } : t)),
        };
      }
      const template: Template = { ...rest, exercises, id: id ?? uid(), createdAt: Date.now() };
      return { ...state, templates: [...state.templates, template] };
    }

    case 'templateFromWorkout': {
      const w = state.workouts.find((x) => x.id === action.workoutId);
      if (!w) return state;
      const exercises: TemplateExercise[] = w.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        restSeconds: e.restSeconds,
        supersetId: e.supersetId,
        sets: e.sets.map(({ type, weightKg, reps, durationSec, distanceM }) => ({
          type,
          weightKg,
          reps,
          durationSec,
          distanceM,
        })),
      }));
      const template: Template = {
        id: uid(),
        name: action.name ?? w.name,
        exercises,
        createdAt: Date.now(),
        createdBy: 'user',
      };
      return { ...state, templates: [...state.templates, template] };
    }

    case 'deleteTemplate':
      return { ...state, templates: state.templates.filter((t) => t.id !== action.templateId) };

    case 'addCustomExercise': {
      const id = `custom-${slug(action.exercise.name, action.exercise.category)}`;
      if (state.exercises[id]) return state;
      return {
        ...state,
        exercises: { ...state.exercises, [id]: { ...action.exercise, id, custom: true } },
      };
    }

    case 'logMeasurement': {
      const m: Measurement = {
        ...action.measurement,
        id: uid(),
        at: action.measurement.at ?? Date.now(),
      };
      return { ...state, measurements: [m, ...state.measurements] };
    }

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
  }
}

export function defaultWorkoutName(now: number): string {
  const h = new Date(now).getHours();
  if (h < 5) return 'Night Workout';
  if (h < 12) return 'Morning Workout';
  if (h < 17) return 'Afternoon Workout';
  if (h < 21) return 'Evening Workout';
  return 'Night Workout';
}

/** Id a custom exercise will get; lets callers find it after dispatching. */
export function customExerciseId(name: string, category: Exercise['category']): string {
  return `custom-${slug(name, category)}`;
}
