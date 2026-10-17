import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration, formatNumber, fromKg, previousSets, toKg } from '../domain/calc';
import { exerciseTitle, tracksReps, tracksWeight } from '../domain/exercises';
import type { Exercise, SetType, WeightUnit, WorkoutExercise, WorkoutSet } from '../domain/types';
import { useAppState, useStore } from '../store/AppStore';
import { Button, confirm, Muted, NumberInput } from '../ui/components';
import { ExercisePicker } from '../ui/ExercisePicker';
import { colors, radius, space } from '../ui/theme';
import { useNow } from '../ui/useNow';

const NEXT_TYPE: Record<SetType, SetType> = { normal: 'warmup', warmup: 'drop', drop: 'failure', failure: 'normal' };
const TYPE_LABEL: Record<SetType, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };
const TYPE_COLOR: Record<SetType, string> = {
  normal: colors.text,
  warmup: colors.warning,
  drop: colors.accent,
  failure: colors.danger,
};

function haptic() {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export default function ActiveWorkout() {
  const store = useStore();
  const workout = useAppState((s) => s.activeWorkout);
  const exercises = useAppState((s) => s.exercises);
  const settings = useAppState((s) => s.settings);
  const [picking, setPicking] = useState(false);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const now = useNow(1000);
  const restLeft = rest ? Math.max(0, Math.round((rest.endsAt - now) / 1000)) : 0;
  const notified = useRef(false);

  useEffect(() => {
    if (rest && restLeft === 0 && !notified.current) {
      notified.current = true;
      haptic();
      setRest(null);
    }
  }, [rest, restLeft]);

  if (!workout) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={{ padding: space.xl, gap: space.md }}>
          <Text style={s.title}>No workout in progress</Text>
          <Button title="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const startRest = (seconds: number) => {
    notified.current = false;
    setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
  };

  const finish = async () => {
    const incomplete = workout.exercises.some((e) => e.sets.some((x) => !x.completed));
    const done = workout.exercises.some((e) => e.sets.some((x) => x.completed));
    if (!done) {
      if (await confirm('Nothing logged', 'No sets are completed. Discard this workout?', 'Discard')) {
        store.dispatch({ type: 'discardWorkout' });
        router.back();
      }
      return;
    }
    if (incomplete && !(await confirm('Finish workout?', 'Incomplete sets will be discarded.', 'Finish'))) return;
    store.dispatch({ type: 'finishWorkout' });
    router.back();
    router.navigate('/history');
  };

  const cancel = async () => {
    if (await confirm('Cancel workout?', 'Everything logged in this workout will be lost.', 'Cancel Workout')) {
      store.dispatch({ type: 'discardWorkout' });
      router.back();
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.topBar}>
        <Button title="Minimize" kind="ghost" small onPress={() => router.back()} />
        <Text style={s.clock}>{formatDuration((now - workout.startedAt) / 1000)}</Text>
        <Button title="Finish" kind="success" small onPress={finish} />
      </View>

      {rest ? (
        <View style={s.restBar}>
          <View style={[s.restFill, { width: `${(restLeft / rest.total) * 100}%` }]} />
          <Text style={s.restText}>Rest {formatDuration(restLeft)}</Text>
          <View style={s.restButtons}>
            <Button title="−15" kind="secondary" small onPress={() => setRest({ ...rest, endsAt: rest.endsAt - 15000 })} />
            <Button title="+15" kind="secondary" small onPress={() => setRest({ ...rest, endsAt: rest.endsAt + 15000, total: rest.total + 15 })} />
            <Button title="Skip" kind="secondary" small onPress={() => setRest(null)} />
          </View>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={workout.name}
          onChangeText={(name) => store.dispatch({ type: 'renameWorkout', name })}
          style={s.title}
        />
        <Muted>{new Date(workout.startedAt).toLocaleString()}</Muted>

        {workout.exercises.map((we) => {
          const ex = exercises[we.exerciseId];
          return ex ? (
            <ExerciseBlock
              key={we.id}
              entry={we}
              exercise={ex}
              unit={settings.unit}
              onCompleted={() => startRest(we.restSeconds ?? settings.defaultRestSeconds)}
            />
          ) : null;
        })}

        <Button title="Add Exercises" kind="secondary" onPress={() => setPicking(true)} style={{ marginTop: space.xl }} />
        <Button
          title="✦ Ask Coach"
          kind="ghost"
          onPress={() => {
            router.back();
            router.navigate('/coach');
          }}
          style={{ marginTop: space.sm }}
        />
        <Button title="Cancel Workout" kind="danger" onPress={cancel} style={{ marginTop: space.sm }} />
      </ScrollView>

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(ids) => ids.forEach((exerciseId) => store.dispatch({ type: 'addExercise', exerciseId }))}
      />
    </SafeAreaView>
  );
}

function ExerciseBlock({
  entry,
  exercise,
  unit,
  onCompleted,
}: {
  entry: WorkoutExercise;
  exercise: Exercise;
  unit: WeightUnit;
  onCompleted: () => void;
}) {
  const store = useStore();
  const workouts = useAppState((s) => s.workouts);
  const previous = useMemo(() => previousSets({ workouts }, exercise.id), [workouts, exercise.id]);
  const weight = tracksWeight(exercise.category);
  const reps = tracksReps(exercise.category);
  const cardio = exercise.category === 'cardio';
  const duration = exercise.category === 'duration' || cardio;
  const weightLabel =
    exercise.category === 'weighted_bodyweight' ? `+${unit}` : exercise.category === 'assisted_bodyweight' ? `−${unit}` : unit;

  const update = (set: WorkoutSet, patch: Partial<WorkoutSet>) =>
    store.dispatch({ type: 'updateSet', workoutExerciseId: entry.id, setId: set.id, patch });

  const toggle = (set: WorkoutSet, index: number) => {
    if (set.completed) return update(set, { completed: false });
    // Like Strong: completing an empty set copies the previous performance.
    const prev = previous[index];
    const patch: Partial<WorkoutSet> = { completed: true };
    if (prev) {
      if (set.weightKg === undefined && prev.weightKg !== undefined) patch.weightKg = prev.weightKg;
      if (set.reps === undefined && prev.reps !== undefined) patch.reps = prev.reps;
      if (set.durationSec === undefined && prev.durationSec !== undefined) patch.durationSec = prev.durationSec;
      if (set.distanceM === undefined && prev.distanceM !== undefined) patch.distanceM = prev.distanceM;
    }
    update(set, patch);
    haptic();
    onCompleted();
  };

  let workingIndex = 0;

  return (
    <View style={s.block}>
      <View style={s.blockHeader}>
        <Pressable onPress={() => router.push(`/exercise/${exercise.id}`)} style={{ flex: 1 }}>
          <Text style={s.blockTitle}>{exerciseTitle(exercise)}</Text>
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={async () => {
            if (await confirm('Remove exercise?', exerciseTitle(exercise), 'Remove')) {
              store.dispatch({ type: 'removeExercise', workoutExerciseId: entry.id });
            }
          }}
        >
          <Text style={{ color: colors.danger, fontWeight: '600' }}>Remove</Text>
        </Pressable>
      </View>
      <TextInput
        value={entry.notes ?? ''}
        onChangeText={(notes) => store.dispatch({ type: 'setExerciseNotes', workoutExerciseId: entry.id, notes })}
        placeholder="Add notes"
        placeholderTextColor={colors.faint}
        style={s.notes}
      />

      <View style={s.headRow}>
        <Text style={[s.head, s.colSet]}>SET</Text>
        <Text style={[s.head, s.colPrev]}>PREVIOUS</Text>
        {weight ? <Text style={[s.head, s.colInput]}>{weightLabel.toUpperCase()}</Text> : null}
        {reps ? <Text style={[s.head, s.colInput]}>REPS</Text> : null}
        {cardio ? <Text style={[s.head, s.colInput]}>KM</Text> : null}
        {duration ? <Text style={[s.head, s.colInput]}>{cardio ? 'MIN' : 'SEC'}</Text> : null}
        <Text style={[s.head, s.colCheck]}>✓</Text>
      </View>

      {entry.sets.map((set, i) => {
        const label = set.type === 'normal' ? String(++workingIndex) : TYPE_LABEL[set.type];
        const prev = previous[i];
        return (
          <View key={set.id} style={[s.row, set.completed && s.rowDone]}>
            <Pressable
              style={s.colSet}
              onPress={() => update(set, { type: NEXT_TYPE[set.type] })}
              onLongPress={() => store.dispatch({ type: 'removeSet', workoutExerciseId: entry.id, setId: set.id })}
              hitSlop={6}
            >
              <Text style={[s.setLabel, { color: TYPE_COLOR[set.type] }]}>{label}</Text>
            </Pressable>
            <Text style={[s.colPrev, s.prev]} numberOfLines={1}>
              {prev ? describePrev(prev, unit, exercise) : '—'}
            </Text>
            {weight ? (
              <View style={s.colInput}>
                <NumberInput
                  value={set.weightKg === undefined ? undefined : Number(formatNumber(fromKg(set.weightKg, unit)))}
                  placeholder={prev?.weightKg !== undefined ? formatNumber(fromKg(prev.weightKg, unit)) : ''}
                  onChange={(v) => update(set, { weightKg: v === undefined ? undefined : toKg(v, unit) })}
                  style={[s.cellInput, set.completed && s.inputDone]}
                />
              </View>
            ) : null}
            {reps ? (
              <View style={s.colInput}>
                <NumberInput
                  integer
                  value={set.reps}
                  placeholder={prev?.reps !== undefined ? String(prev.reps) : ''}
                  onChange={(v) => update(set, { reps: v })}
                  style={[s.cellInput, set.completed && s.inputDone]}
                />
              </View>
            ) : null}
            {cardio ? (
              <View style={s.colInput}>
                <NumberInput
                  value={set.distanceM === undefined ? undefined : Number(formatNumber(set.distanceM / 1000))}
                  onChange={(v) => update(set, { distanceM: v === undefined ? undefined : v * 1000 })}
                  style={[s.cellInput, set.completed && s.inputDone]}
                />
              </View>
            ) : null}
            {duration ? (
              <View style={s.colInput}>
                <NumberInput
                  integer={!cardio}
                  value={set.durationSec === undefined ? undefined : cardio ? Number(formatNumber(set.durationSec / 60)) : set.durationSec}
                  onChange={(v) => update(set, { durationSec: v === undefined ? undefined : Math.round(cardio ? v * 60 : v) })}
                  style={[s.cellInput, set.completed && s.inputDone]}
                />
              </View>
            ) : null}
            <Pressable style={s.colCheck} onPress={() => toggle(set, i)} hitSlop={6}>
              <View style={[s.check, set.completed && s.checkDone]}>
                <Text style={[s.checkMark, set.completed && { color: '#fff' }]}>✓</Text>
              </View>
            </Pressable>
          </View>
        );
      })}

      <Button title="+ Add Set" kind="secondary" small onPress={() => store.dispatch({ type: 'addSet', workoutExerciseId: entry.id })} style={{ marginTop: space.sm }} />
      <Muted style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>Tap a set number to change its type · hold to delete</Muted>
    </View>
  );
}

function describePrev(prev: WorkoutSet, unit: WeightUnit, exercise: Exercise): string {
  if (exercise.category === 'cardio') {
    return `${formatNumber((prev.distanceM ?? 0) / 1000)} km · ${formatDuration(prev.durationSec ?? 0)}`;
  }
  if (exercise.category === 'duration') return formatDuration(prev.durationSec ?? 0);
  if (!tracksWeight(exercise.category)) return `${prev.reps ?? 0} reps`;
  return `${formatNumber(fromKg(prev.weightKg ?? 0, unit))} × ${prev.reps ?? 0}`;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  clock: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  restBar: {
    margin: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  restFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#D3E0FF' },
  restText: { fontSize: 16, fontWeight: '700', color: colors.accent, fontVariant: ['tabular-nums'] },
  restButtons: { flexDirection: 'row', gap: space.sm },
  content: { padding: space.lg, paddingBottom: 64 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, paddingVertical: 2 },
  block: {
    marginTop: space.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  blockTitle: { fontSize: 16, fontWeight: '700', color: colors.accent },
  notes: { fontSize: 14, color: colors.text, paddingVertical: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  head: { fontSize: 11, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderRadius: radius.sm },
  rowDone: { backgroundColor: colors.successSoft },
  colSet: { width: 36, alignItems: 'center' },
  colPrev: { flex: 1, textAlign: 'center' },
  colInput: { width: 68, alignItems: 'center', paddingHorizontal: 3 },
  colCheck: { width: 44, alignItems: 'center' },
  setLabel: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  prev: { fontSize: 13, color: colors.faint },
  cellInput: { width: '100%', minWidth: 0 },
  inputDone: { backgroundColor: 'transparent' },
  check: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: colors.success },
  checkMark: { fontSize: 16, fontWeight: '800', color: colors.faint },
});
