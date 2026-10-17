import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  bestsForSets,
  estimate1RM,
  exerciseBests,
  formatDuration,
  formatNumber,
  fromKg,
  platesPerSide,
  toKg,
  weightForReps,
} from '../../domain/calc';
import { exerciseTitle, tracksWeight } from '../../domain/exercises';
import { useAppState } from '../../store/AppStore';
import { Card, Empty, Muted, NumberInput, SectionTitle } from '../../ui/components';
import { colors, radius, space } from '../../ui/theme';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = useAppState((s) => s.exercises[id]);
  const workouts = useAppState((s) => s.workouts);
  const settings = useAppState((s) => s.settings);
  const unit = settings.unit;

  const sessions = useMemo(
    () =>
      [...workouts]
        .filter((w) => w.exercises.some((e) => e.exerciseId === id))
        .sort((a, b) => b.startedAt - a.startedAt)
        .map((w) => ({
          workout: w,
          sets: w.exercises.filter((e) => e.exerciseId === id).flatMap((e) => e.sets),
        })),
    [workouts, id],
  );
  const bests = useMemo(() => exerciseBests(workouts, id), [workouts, id]);
  const [plateTarget, setPlateTarget] = useState<number | undefined>(undefined);

  if (!exercise) return <Empty title="Exercise not found" />;
  const weighted = tracksWeight(exercise.category);
  const trend = sessions
    .slice(0, 12)
    .reverse()
    .map((x) => bestsForSets(x.sets).e1rm);
  const maxTrend = Math.max(1, ...trend);
  const plates = plateTarget ? platesPerSide(toKg(plateTarget, unit), settings.barWeightKg, unit) : null;

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Stack.Screen options={{ title: exercise.name }} />
      <Text style={s.title}>{exerciseTitle(exercise)}</Text>

      {weighted ? (
        <>
          <SectionTitle>Personal Records</SectionTitle>
          <View style={s.recordGrid}>
            <Record label="Est. 1RM" value={bests.e1rm ? `${formatNumber(fromKg(bests.e1rm, unit))} ${unit}` : '—'} />
            <Record label="Heaviest" value={bests.weight ? `${formatNumber(fromKg(bests.weight, unit))} ${unit}` : '—'} />
            <Record label="Best Set Vol." value={bests.volume ? `${Math.round(fromKg(bests.volume, unit))} ${unit}` : '—'} />
            <Record label="Most Reps" value={bests.reps ? String(bests.reps) : '—'} />
          </View>

          {trend.length > 1 ? (
            <>
              <SectionTitle>Est. 1RM Trend</SectionTitle>
              <Card>
                <View style={s.chart}>
                  {trend.map((v, i) => (
                    <View key={i} style={s.barSlot}>
                      <View style={[s.bar, { height: `${Math.max(4, (v / maxTrend) * 100)}%` }]} />
                    </View>
                  ))}
                </View>
                <Muted style={{ fontSize: 12, marginTop: 6 }}>Last {trend.length} sessions</Muted>
              </Card>
            </>
          ) : null}

          {bests.e1rm ? (
            <>
              <SectionTitle>Predicted Rep Maxes</SectionTitle>
              <Card style={{ paddingVertical: space.sm }}>
                {[1, 3, 5, 8, 10, 12, 15].map((r) => (
                  <View key={r} style={s.tableRow}>
                    <Text style={s.cell}>{r} RM</Text>
                    <Text style={s.cellStrong}>
                      {formatNumber(fromKg(weightForReps(bests.e1rm, r), unit))} {unit}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {exercise.category === 'barbell' ? (
            <>
              <SectionTitle>Plate Calculator</SectionTitle>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <NumberInput value={plateTarget} onChange={setPlateTarget} placeholder={`Target ${unit}`} style={{ minWidth: 110 }} />
                  <Muted>Bar {formatNumber(fromKg(settings.barWeightKg, unit))} {unit}</Muted>
                </View>
                {plates ? (
                  <Text style={[s.cellStrong, { marginTop: space.md }]}>
                    {plates.plates.length ? `Per side: ${plates.plates.join(' + ')}` : 'Just the bar'}
                    {plates.remainder ? `  (${plates.remainder} ${unit} short)` : ''}
                  </Text>
                ) : null}
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      <SectionTitle>History</SectionTitle>
      {sessions.length === 0 ? (
        <Card>
          <Muted>You haven't logged this exercise yet.</Muted>
        </Card>
      ) : (
        sessions.map(({ workout, sets }) => (
          <Card key={workout.id} style={{ marginBottom: space.sm }}>
            <Text style={s.sessionTitle}>{workout.name}</Text>
            <Muted style={{ marginBottom: 4 }}>{new Date(workout.startedAt).toLocaleDateString()}</Muted>
            {sets.map((set, i) => (
              <View key={set.id} style={s.tableRow}>
                <Text style={s.cell}>
                  {set.type === 'normal' ? i + 1 : set.type[0].toUpperCase()}
                </Text>
                <Text style={s.cellStrong}>
                  {weighted
                    ? `${formatNumber(fromKg(set.weightKg ?? 0, unit))} ${unit} × ${set.reps ?? 0}${set.rpe ? ` @${set.rpe}` : ''}`
                    : set.durationSec
                      ? formatDuration(set.durationSec) + (set.distanceM ? ` · ${formatNumber(set.distanceM / 1000)} km` : '')
                      : `${set.reps ?? 0} reps`}
                </Text>
                {weighted ? (
                  <Muted>{formatNumber(fromKg(estimate1RM(set.weightKg ?? 0, set.reps ?? 0), unit))}</Muted>
                ) : null}
              </View>
            ))}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function Record({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.record}>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
      <Text style={s.recordValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  record: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  recordValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: colors.accent, borderRadius: 3 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: space.md },
  cell: { fontSize: 14, color: colors.muted, width: 48 },
  cellStrong: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
  sessionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
});
