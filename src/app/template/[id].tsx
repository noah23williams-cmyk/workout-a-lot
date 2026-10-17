import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatNumber, fromKg, toKg } from '../../domain/calc';
import { exerciseTitle, tracksReps, tracksWeight } from '../../domain/exercises';
import type { TemplateExercise } from '../../domain/types';
import { useAppState, useStore } from '../../store/AppStore';
import { Button, confirm, Muted, NumberInput } from '../../ui/components';
import { ExercisePicker } from '../../ui/ExercisePicker';
import { colors, radius, space } from '../../ui/theme';

export default function TemplateEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const existing = useAppState((s) => s.templates.find((t) => t.id === id));
  const exercises = useAppState((s) => s.exercises);
  const unit = useAppState((s) => s.settings.unit);
  const active = useAppState((s) => s.activeWorkout);
  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [items, setItems] = useState<TemplateExercise[]>(existing?.exercises ?? []);
  const [picking, setPicking] = useState(false);

  const updateItem = (i: number, patch: Partial<TemplateExercise>) =>
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const save = () => {
    store.dispatch({
      type: 'saveTemplate',
      template: {
        id: existing?.id,
        name: name.trim() || 'New Template',
        notes: notes.trim() || undefined,
        exercises: items,
        createdBy: existing?.createdBy ?? 'user',
      },
    });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: existing ? 'Edit Template' : 'New Template',
          headerRight: () => <Button title="Save" small onPress={save} disabled={!items.length} />,
        }}
      />
      <TextInput value={name} onChangeText={setName} placeholder="Template name" placeholderTextColor={colors.faint} style={s.name} />
      <TextInput value={notes} onChangeText={setNotes} placeholder="Notes" placeholderTextColor={colors.faint} style={s.notes} multiline />

      {items.map((item, i) => {
        const ex = exercises[item.exerciseId];
        if (!ex) return null;
        const first = item.sets[0];
        return (
          <View key={`${item.exerciseId}-${i}`} style={s.block}>
            <View style={s.blockHeader}>
              <Text style={s.blockTitle}>{exerciseTitle(ex)}</Text>
              <Pressable hitSlop={10} onPress={() => setItems(items.filter((_, j) => j !== i))}>
                <Text style={{ color: colors.danger, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            </View>
            <View style={s.fields}>
              <Field label="Sets">
                <NumberInput
                  integer
                  value={item.sets.length}
                  onChange={(n) => {
                    const count = Math.max(1, Math.min(20, n ?? 1));
                    const template = item.sets[item.sets.length - 1] ?? { type: 'normal' as const };
                    const sets = item.sets.slice(0, count);
                    while (sets.length < count) sets.push({ ...template });
                    updateItem(i, { sets });
                  }}
                />
              </Field>
              {tracksReps(ex.category) ? (
                <Field label="Reps">
                  <NumberInput
                    integer
                    value={first?.reps}
                    onChange={(reps) => updateItem(i, { sets: item.sets.map((x) => ({ ...x, reps })) })}
                  />
                </Field>
              ) : null}
              {tracksWeight(ex.category) ? (
                <Field label={unit}>
                  <NumberInput
                    value={first?.weightKg === undefined ? undefined : Number(formatNumber(fromKg(first.weightKg, unit)))}
                    onChange={(w) =>
                      updateItem(i, { sets: item.sets.map((x) => ({ ...x, weightKg: w === undefined ? undefined : toKg(w, unit) })) })
                    }
                  />
                </Field>
              ) : null}
              <Field label="Rest s">
                <NumberInput integer value={item.restSeconds} onChange={(restSeconds) => updateItem(i, { restSeconds })} />
              </Field>
            </View>
            {item.notes ? <Muted style={{ marginTop: 6 }}>{item.notes}</Muted> : null}
          </View>
        );
      })}

      <Button title="Add Exercises" kind="secondary" onPress={() => setPicking(true)} style={{ marginTop: space.lg }} />
      {existing ? (
        <>
          <Button
            title={active ? 'A workout is in progress' : 'Start Workout'}
            kind="success"
            disabled={!!active}
            style={{ marginTop: space.sm }}
            onPress={() => {
              store.dispatch({ type: 'startWorkout', templateId: existing.id });
              router.back();
              router.push('/workout');
            }}
          />
          <Button
            title="Delete Template"
            kind="danger"
            style={{ marginTop: space.sm }}
            onPress={async () => {
              if (await confirm('Delete template?', existing.name, 'Delete')) {
                store.dispatch({ type: 'deleteTemplate', templateId: existing.id });
                router.back();
              }
            }}
          />
        </>
      ) : null}

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(ids) =>
          setItems([
            ...items,
            ...ids.map((exerciseId) => ({ exerciseId, sets: [1, 2, 3].map(() => ({ type: 'normal' as const })) })),
          ])
        }
      />
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'stretch', gap: 4, width: 64 }}>
      <Text style={s.fieldLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 48 },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, paddingVertical: 4 },
  notes: { fontSize: 15, color: colors.text, paddingVertical: 4, marginBottom: space.sm },
  block: {
    marginTop: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  blockTitle: { fontSize: 16, fontWeight: '700', color: colors.accent, flex: 1 },
  fields: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textAlign: 'center' },
});
