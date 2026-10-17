import { tracksWeight } from './exercises';
import type {
  AppState,
  ExerciseCategory,
  PersonalRecord,
  WeightUnit,
  Workout,
  WorkoutSet,
} from './types';

export const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

/** Rounds to one decimal and drops a trailing ".0". */
export function formatNumber(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${formatNumber(fromKg(kg, unit))} ${unit}`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

/**
 * Estimated one-rep max. Epley for higher reps, Brzycki for low reps where it
 * tracks closer to tested maxes. A single is its own max.
 */
export function estimate1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  if (reps <= 10) return weightKg * (36 / (37 - reps));
  return weightKg * (1 + reps / 30);
}

/** Working weight that should allow `reps` reps given a 1RM. */
export function weightForReps(oneRmKg: number, reps: number): number {
  if (reps <= 1) return oneRmKg;
  if (reps <= 10) return (oneRmKg * (37 - reps)) / 36;
  return oneRmKg / (1 + reps / 30);
}

export function isWorkingSet(s: WorkoutSet): boolean {
  return s.completed && s.type !== 'warmup';
}

export function setVolumeKg(s: WorkoutSet): number {
  return (s.weightKg ?? 0) * (s.reps ?? 0);
}

export function workoutVolumeKg(w: Workout): number {
  return w.exercises.reduce(
    (sum, ex) =>
      sum + ex.sets.filter(isWorkingSet).reduce((a, s) => a + setVolumeKg(s), 0),
    0,
  );
}

export function completedSetCount(w: Workout): number {
  return w.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.completed).length, 0);
}

export interface ExerciseBests {
  e1rm: number;
  weight: number;
  reps: number;
  volume: number;
}

const EMPTY_BESTS: ExerciseBests = { e1rm: 0, weight: 0, reps: 0, volume: 0 };

export function bestsForSets(sets: WorkoutSet[]): ExerciseBests {
  const b = { ...EMPTY_BESTS };
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    b.e1rm = Math.max(b.e1rm, estimate1RM(w, r));
    b.weight = Math.max(b.weight, w);
    b.reps = Math.max(b.reps, r);
    b.volume = Math.max(b.volume, w * r);
  }
  return b;
}

/** All-time bests for an exercise across finished workouts, optionally excluding one. */
export function exerciseBests(
  workouts: Workout[],
  exerciseId: string,
  excludeWorkoutId?: string,
): ExerciseBests {
  const b = { ...EMPTY_BESTS };
  for (const w of workouts) {
    if (w.id === excludeWorkoutId) continue;
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const x = bestsForSets(ex.sets);
      b.e1rm = Math.max(b.e1rm, x.e1rm);
      b.weight = Math.max(b.weight, x.weight);
      b.reps = Math.max(b.reps, x.reps);
      b.volume = Math.max(b.volume, x.volume);
    }
  }
  return b;
}

/** Records the given workout beats compared with all prior history. */
export function detectPRs(
  workout: Workout,
  history: Workout[],
  categoryOf: (exerciseId: string) => ExerciseCategory | undefined,
): PersonalRecord[] {
  const prs: PersonalRecord[] = [];
  const seen = new Set<string>();
  for (const ex of workout.exercises) {
    if (seen.has(ex.exerciseId)) continue;
    seen.add(ex.exerciseId);
    const category = categoryOf(ex.exerciseId);
    if (!category) continue;
    const sets = workout.exercises
      .filter((e) => e.exerciseId === ex.exerciseId)
      .flatMap((e) => e.sets);
    const now = bestsForSets(sets);
    const prior = exerciseBests(history, ex.exerciseId, workout.id);
    const hasHistory = history.some(
      (w) => w.id !== workout.id && w.exercises.some((e) => e.exerciseId === ex.exerciseId),
    );
    // A first-ever session isn't a "record", it's a baseline.
    if (!hasHistory) continue;
    const kinds: PersonalRecord['kind'][] = tracksWeight(category)
      ? ['e1rm', 'weight', 'volume']
      : ['reps'];
    for (const kind of kinds) {
      if (now[kind] > prior[kind] + 1e-9) {
        prs.push({ exerciseId: ex.exerciseId, kind, value: now[kind] });
      }
    }
  }
  return prs;
}

/** The most recent finished performance of an exercise, used for the "Previous" column. */
export function previousSets(state: Pick<AppState, 'workouts'>, exerciseId: string): WorkoutSet[] {
  const sorted = [...state.workouts].sort((a, b) => b.startedAt - a.startedAt);
  for (const w of sorted) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (ex) return ex.sets.filter((s) => s.completed);
  }
  return [];
}

export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const STANDARD_PLATES_LB = [45, 35, 25, 10, 5, 2.5];

/**
 * Plates per side to load `targetKg` on a bar. Works in the display unit so lb
 * lifters get lb plates. Returns the remainder that couldn't be loaded.
 */
export function platesPerSide(
  targetKg: number,
  barKg: number,
  unit: WeightUnit,
): { plates: number[]; remainder: number } {
  const plateSet = unit === 'kg' ? STANDARD_PLATES_KG : STANDARD_PLATES_LB;
  let perSide = (fromKg(targetKg, unit) - fromKg(barKg, unit)) / 2;
  const plates: number[] = [];
  if (perSide <= 0) return { plates, remainder: 0 };
  for (const p of plateSet) {
    while (perSide + 1e-6 >= p) {
      plates.push(p);
      perSide -= p;
    }
  }
  return { plates, remainder: Math.round(perSide * 100) / 100 };
}

const DAY = 24 * 60 * 60 * 1000;

/** Workouts per week for the last `weeks` weeks, oldest first. */
export function weeklyWorkoutCounts(workouts: Workout[], weeks: number, now = Date.now()): number[] {
  const counts = new Array<number>(weeks).fill(0);
  for (const w of workouts) {
    const ago = Math.floor((now - w.startedAt) / (7 * DAY));
    if (ago >= 0 && ago < weeks) counts[weeks - 1 - ago] += 1;
  }
  return counts;
}
