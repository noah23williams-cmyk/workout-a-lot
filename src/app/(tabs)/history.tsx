import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { estimate1RM, formatDuration, formatNumber, formatWeight, fromKg, workoutVolumeKg } from '../../domain/calc';
import { tracksWeight } from '../../domain/exercises';
import type { Exercise, WeightUnit, Workout, WorkoutSet } from '../../domain/types';
import { useAppState, useStore } from '../../store/AppStore';
import { confirm, Empty, Muted } from '../../ui/components';
import { colors, radius, space } from '../../ui/theme';

const PR_LABEL = { e1rm: 'Est. 1RM', weight: 'Weight', reps: 'Reps', volume: 'Volume' } as const;

export default function History() {
  const workouts = useAppState((s) => s.workouts);
  const sorted = useMemo(() => [...workouts].sort((a, b) => b.startedAt - a.startedAt), [workouts]);
  return (
    <FlatList
      data={sorted}
      keyExtractor={(w) => w.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 48 }}
      ListEmptyComponent={<Empty title="No workouts yet" body="Finished workouts show up here with your records." />}
      renderItem={({ item }) => <WorkoutCard workout={item} />}
    />
  );
}

function bestSet(sets: WorkoutSet[], ex: Exercise, unit: WeightUnit): string {
  if (!sets.length) return '';
  if (!tracksWeight(ex.category)) {
    if (ex.category === 'duration' || ex.category === 'cardio') {
      return formatDuration(Math.max(...sets.map((s) => s.durationSec ?? 0)));
    }
    return `${Math.max(...sets.map((s) => s.reps ?? 0))} reps`;
  }
  const best = [...sets].sort(
    (a, b) => estimate1RM(b.weightKg ?? 0, b.reps ?? 0) - estimate1RM(a.weightKg ?? 0, a.reps ?? 0),
  )[0];
  return `${formatNumber(fromKg(best.weightKg ?? 0, unit))} ${unit} × ${best.reps ?? 0}`;
}

function WorkoutCard({ workout }: { workout: Workout }) {
  const store = useStore();
  const exercises = useAppState((s) => s.exercises);
  const unit = useAppState((s) => s.settings.unit);
  const duration = workout.finishedAt ? (workout.finishedAt - workout.startedAt) / 1000 : 0;
  const prsByExercise = new Map<string, string[]>();
  for (const pr of workout.prs ?? []) {
    prsByExercise.set(pr.exerciseId, [...(prsByExercise.get(pr.exerciseId) ?? []), PR_LABEL[pr.kind]]);
  }

  const onLongPress = async () => {
    if (await confirm(workout.name, 'Save this workout as a template?', 'Save Template')) {
      store.dispatch({ type: 'templateFromWorkout', workoutId: workout.id });
      router.navigate('/');
    }
  };

  const onDelete = async () => {
    if (await confirm('Delete workout?', 'This permanently removes it from your history.', 'Delete')) {
      store.dispatch({ type: 'deleteWorkout', workoutId: workout.id });
    }
  };

  return (
    <Pressable onLongPress={onLongPress} style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>{workout.name}</Text>
        <Pressable hitSlop={10} onPress={onDelete}>
          <Text style={{ color: colors.faint }}>Delete</Text>
        </Pressable>
      </View>
      <Muted>
        {new Date(workout.startedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
      </Muted>
      <View style={s.stats}>
        <Muted>⏱ {formatDuration(duration)}</Muted>
        <Muted>⚖ {formatWeight(workoutVolumeKg(workout), unit)}</Muted>
        {workout.prs?.length ? <Text style={s.prCount}>🏆 {workout.prs.length} PR{workout.prs.length > 1 ? 's' : ''}</Text> : null}
      </View>
      <View style={s.tableHead}>
        <Text style={s.head}>Exercise</Text>
        <Text style={s.head}>Best Set</Text>
      </View>
      {workout.exercises.map((we) => {
        const ex = exercises[we.exerciseId];
        if (!ex) return null;
        const prs = prsByExercise.get(ex.id);
        return (
          <Pressable key={we.id} style={s.line} onPress={() => router.push(`/exercise/${ex.id}`)}>
            <Text style={s.exName} numberOfLines={1}>
              {we.sets.length} × {ex.name}
            </Text>
            <Text style={s.best}>
              {bestSet(we.sets, ex, unit)}
              {prs ? <Text style={s.prBadge}> 🏆</Text> : null}
            </Text>
          </Pressable>
        );
      })}
      <Muted style={{ fontSize: 12, marginTop: space.sm }}>Hold to save as a template</Muted>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  stats: { flexDirection: 'row', gap: space.lg, marginTop: space.sm, marginBottom: space.sm },
  prCount: { fontSize: 14, color: colors.warning, fontWeight: '600' },
  tableHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs, marginBottom: 2 },
  head: { fontSize: 12, fontWeight: '700', color: colors.muted },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: space.md },
  exName: { flex: 1, fontSize: 14, color: colors.text },
  best: { fontSize: 14, color: colors.text },
  prBadge: { fontSize: 12 },
});
