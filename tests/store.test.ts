import { describe, expect, it } from 'vitest';
import { initialState, reducer, type Action } from '../src/store/reducer';
import { createStore, type KeyValueStorage } from '../src/store/store';

const run = (...actions: Action[]) => actions.reduce(reducer, initialState());

describe('reducer', () => {
  it('starts a workout from a template with fresh, incomplete sets', () => {
    let s = run({
      type: 'saveTemplate',
      template: { name: 'Push', exercises: [{ exerciseId: 'bench-press-barbell', sets: [{ type: 'normal', reps: 5, weightKg: 80 }] }] },
    });
    s = reducer(s, { type: 'startWorkout', templateId: s.templates[0].id });
    expect(s.activeWorkout?.name).toBe('Push');
    expect(s.activeWorkout?.exercises[0].sets[0]).toMatchObject({ reps: 5, weightKg: 80, completed: false });
  });

  it('ignores templates with unknown exercises', () => {
    const s = run({
      type: 'saveTemplate',
      template: { name: 'X', exercises: [{ exerciseId: 'nope', sets: [] }] },
    });
    expect(s.templates[0].exercises).toEqual([]);
  });

  it('copies the previous set when adding a set', () => {
    let s = run({ type: 'startWorkout' }, { type: 'addExercise', exerciseId: 'squat-barbell' });
    const we = s.activeWorkout!.exercises[0];
    s = reducer(s, { type: 'updateSet', workoutExerciseId: we.id, setId: we.sets[0].id, patch: { weightKg: 100, reps: 5, type: 'warmup' } });
    s = reducer(s, { type: 'addSet', workoutExerciseId: we.id });
    expect(s.activeWorkout!.exercises[0].sets[1]).toMatchObject({ weightKg: 100, reps: 5, type: 'normal', completed: false });
  });

  it('drops incomplete sets and empty exercises on finish', () => {
    let s = run(
      { type: 'startWorkout', now: 1000 },
      { type: 'addExercise', exerciseId: 'squat-barbell', sets: [{ type: 'normal', weightKg: 100, reps: 5, completed: true }, { type: 'normal', completed: false }] },
      { type: 'addExercise', exerciseId: 'deadlift-barbell' },
    );
    s = reducer(s, { type: 'finishWorkout', now: 5000 });
    expect(s.activeWorkout).toBeNull();
    expect(s.workouts).toHaveLength(1);
    expect(s.workouts[0].exercises).toHaveLength(1);
    expect(s.workouts[0].exercises[0].sets).toHaveLength(1);
    expect(s.workouts[0].finishedAt).toBe(5000);
  });

  it('records PRs when a workout beats history', () => {
    const lift = (weightKg: number): Action[] => [
      { type: 'startWorkout' },
      { type: 'addExercise', exerciseId: 'squat-barbell', sets: [{ type: 'normal', weightKg, reps: 5, completed: true }] },
      { type: 'finishWorkout' },
    ];
    const s = run(...lift(100), ...lift(110));
    expect(s.workouts[0].prs?.map((p) => p.kind)).toContain('weight');
    expect(s.workouts[1].prs).toEqual([]);
  });

  it("won't start a second workout", () => {
    const s = run({ type: 'startWorkout', name: 'A' }, { type: 'startWorkout', name: 'B' });
    expect(s.activeWorkout?.name).toBe('A');
  });

  it('builds a template from a finished workout', () => {
    const s = run(
      { type: 'startWorkout', name: 'Legs' },
      { type: 'addExercise', exerciseId: 'squat-barbell', sets: [{ type: 'normal', weightKg: 100, reps: 5, completed: true }] },
      { type: 'finishWorkout' },
    );
    const t = reducer(s, { type: 'templateFromWorkout', workoutId: s.workouts[0].id }).templates[0];
    expect(t).toMatchObject({ name: 'Legs', exercises: [{ exerciseId: 'squat-barbell', sets: [{ weightKg: 100, reps: 5 }] }] });
  });
});

describe('store persistence', () => {
  it('saves user data, keeps the built-in library out of storage, and restores it', async () => {
    const data = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItemAsync: async (k) => data.get(k) ?? null,
      setItemAsync: async (k, v) => void data.set(k, v),
    };
    const a = createStore(storage);
    await a.hydrated;
    a.dispatch({ type: 'addCustomExercise', exercise: { name: 'Sled Push', bodyPart: 'legs', category: 'machine' } });
    a.dispatch({ type: 'updateSettings', patch: { unit: 'lb' } });
    await new Promise((r) => setTimeout(r, 300));

    const saved = JSON.parse([...data.values()][0]);
    expect(Object.keys(saved.exercises)).toEqual(['custom-sled-push-machine']);

    const b = createStore(storage);
    await b.hydrated;
    expect(b.getState().settings.unit).toBe('lb');
    expect(b.getState().exercises['custom-sled-push-machine']).toBeTruthy();
    expect(b.getState().exercises['squat-barbell']).toBeTruthy();
  });
});
