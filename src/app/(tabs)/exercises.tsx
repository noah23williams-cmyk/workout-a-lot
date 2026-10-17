import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { categoryLabel, exerciseTitle, searchExercises } from '../../domain/exercises';
import type { BodyPart, ExerciseCategory } from '../../domain/types';
import { useAppState, useStore } from '../../store/AppStore';
import { Button, Chip, Muted, SectionTitle } from '../../ui/components';
import { BODY_PART_FILTERS } from '../../ui/ExercisePicker';
import { colors, space } from '../../ui/theme';

const CATEGORIES: ExerciseCategory[] = [
  'barbell', 'dumbbell', 'machine', 'cable', 'weighted_bodyweight',
  'assisted_bodyweight', 'reps_only', 'duration', 'cardio',
];

export default function Exercises() {
  const exercises = useAppState((s) => s.exercises);
  const workouts = useAppState((s) => s.workouts);
  const [query, setQuery] = useState('');
  const [bodyPart, setBodyPart] = useState<BodyPart | null>(null);
  const [creating, setCreating] = useState(false);
  const results = useMemo(() => searchExercises(exercises, query, bodyPart), [exercises, query, bodyPart]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workouts) for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + 1);
    return m;
  }, [workouts]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          placeholderTextColor={colors.faint}
          style={s.search}
          autoCorrect={false}
        />
        <Button title="+ New" small onPress={() => setCreating(true)} />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {BODY_PART_FILTERS.map((b) => (
            <Chip key={b.key} label={b.label} active={bodyPart === b.key} onPress={() => setBodyPart(bodyPart === b.key ? null : b.key)} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={results}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => router.push(`/exercise/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{exerciseTitle(item)}</Text>
              <Muted>
                {BODY_PART_FILTERS.find((b) => b.key === item.bodyPart)?.label}
                {item.custom ? ' · Custom' : ''}
              </Muted>
            </View>
            {counts.get(item.id) ? <Muted>{counts.get(item.id)}×</Muted> : null}
          </Pressable>
        )}
      />
      <NewExercise visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

function NewExercise({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const store = useStore();
  const [name, setName] = useState('');
  const [bodyPart, setBodyPart] = useState<BodyPart>('other');
  const [category, setCategory] = useState<ExerciseCategory>('barbell');
  const save = () => {
    store.dispatch({ type: 'addCustomExercise', exercise: { name: name.trim(), bodyPart, category } });
    setName('');
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}>
        <View style={s.modalHeader}>
          <Button title="Cancel" kind="ghost" small onPress={onClose} />
          <Text style={s.modalTitle}>New Exercise</Text>
          <Button title="Save" small disabled={!name.trim()} onPress={save} />
        </View>
        <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.faint} style={s.search} autoFocus />
        <SectionTitle>Body part</SectionTitle>
        <View style={s.wrap}>
          {BODY_PART_FILTERS.map((b) => (
            <Chip key={b.key} label={b.label} active={bodyPart === b.key} onPress={() => setBodyPart(b.key)} style={s.wrapChip} />
          ))}
        </View>
        <SectionTitle>Category</SectionTitle>
        <View style={s.wrap}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={categoryLabel(c)} active={category === c} onPress={() => setCategory(c)} style={s.wrapChip} />
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md },
  search: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
  },
  chips: { paddingHorizontal: space.lg, paddingVertical: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  rowTitle: { fontSize: 16, fontWeight: '500', color: colors.text },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  wrapChip: { marginBottom: space.sm },
});
