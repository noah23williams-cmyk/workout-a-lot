import { describe, expect, it } from 'vitest';
import {
  detectPRs,
  estimate1RM,
  fromKg,
  platesPerSide,
  toKg,
  weeklyWorkoutCounts,
  weightForReps,
  workoutVolumeKg,
} from '../src/domain/calc';
import { BUILT_IN_EXERCISES, searchExercises } from '../src/domain/exercises';
import type { Workout } from '../src/domain/types';

const set = (weightKg: number, reps: number, extra: Partial<Workout['exercises'][0]['sets'][0]> = {}) => ({
  id: Math.random().toString(),
  type: 'normal' as const,
  weightKg,
  reps,
  completed: true,
  ...extra,
});

const workout = (id: string, startedAt: number, sets: ReturnType<typeof set>[], exerciseId = 'bench-press-barbell'): Workout => ({
  id,
  name: id,
  startedAt,
  finishedAt: startedAt + 3600_000,
  exercises: [{ id: `${id}-e`, exerciseId, sets }],
});

describe('estimate1RM', () => {
  it('treats a single as the max', () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });
  it('uses Brzycki up to 10 reps and round-trips with weightForReps', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(112.5, 1);
    expect(weightForReps(estimate1RM(80, 8), 8)).toBeCloseTo(80, 6);
  });
  it('uses Epley above 10 reps', () => {
    expect(estimate1RM(60, 15)).toBeCloseTo(90, 6);
  });
  it('is zero for empty sets', () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
  });
});

describe('units', () => {
  it('round-trips pounds', () => {
    expect(fromKg(toKg(225, 'lb'), 'lb')).toBeCloseTo(225, 9);
    expect(toKg(100, 'kg')).toBe(100);
  });
});

describe('platesPerSide', () => {
  it('loads 100 kg on a 20 kg bar', () => {
    expect(platesPerSide(100, 20, 'kg')).toEqual({ plates: [25, 15], remainder: 0 });
  });
  it('uses pound plates for lb lifters', () => {
    expect(platesPerSide(toKg(225, 'lb'), toKg(45, 'lb'), 'lb').plates).toEqual([45, 45]);
  });
  it('reports what cannot be loaded', () => {
    expect(platesPerSide(21, 20, 'kg')).toEqual({ plates: [], remainder: 0.5 });
  });
});

describe('volume and PRs', () => {
  it('excludes warmups and incomplete sets from volume', () => {
    const w = workout('a', 0, [set(100, 5), set(40, 10, { type: 'warmup' }), set(100, 5, { completed: false })]);
    expect(workoutVolumeKg(w)).toBe(500);
  });

  it('does not count a first session as a PR', () => {
    const w = workout('a', 0, [set(100, 5)]);
    expect(detectPRs(w, [], () => 'barbell')).toEqual([]);
  });

  it('detects weight, e1RM and volume records against history', () => {
    const prior = workout('a', 0, [set(100, 5)]);
    const now = workout('b', 1, [set(105, 5)]);
    const kinds = detectPRs(now, [prior], () => 'barbell').map((p) => p.kind).sort();
    expect(kinds).toEqual(['e1rm', 'volume', 'weight']);
  });

  it('only tracks reps for bodyweight exercises', () => {
    const prior = workout('a', 0, [set(0, 10)], 'push-up-reps-only');
    const now = workout('b', 1, [set(0, 12)], 'push-up-reps-only');
    expect(detectPRs(now, [prior], () => 'reps_only')).toEqual([
      { exerciseId: 'push-up-reps-only', kind: 'reps', value: 12 },
    ]);
  });
});

describe('weeklyWorkoutCounts', () => {
  it('buckets by week, oldest first', () => {
    const now = Date.UTC(2026, 0, 31);
    const day = 86_400_000;
    const ws = [workout('a', now - day, []), workout('b', now - 2 * day, []), workout('c', now - 8 * day, [])];
    expect(weeklyWorkoutCounts(ws, 3, now)).toEqual([0, 1, 2]);
  });
});

describe('searchExercises', () => {
  it('matches every term against name and category', () => {
    const r = searchExercises(BUILT_IN_EXERCISES, 'bench dumbbell');
    expect(r.map((e) => e.id)).toContain('bench-press-dumbbell');
    expect(r.every((e) => e.category === 'dumbbell')).toBe(true);
  });
  it('filters by body part', () => {
    expect(searchExercises(BUILT_IN_EXERCISES, '', 'cardio').every((e) => e.bodyPart === 'cardio')).toBe(true);
  });
});
