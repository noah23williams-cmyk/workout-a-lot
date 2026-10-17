import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { exerciseTitle, searchExercises } from '../domain/exercises';
import type { BodyPart } from '../domain/types';
import { useAppState } from '../store/AppStore';
import { Button, Chip, Muted } from './components';
import { colors, space } from './theme';

export const BODY_PART_FILTERS: { key: BodyPart; label: string }[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'arms', label: 'Arms' },
  { key: 'legs', label: 'Legs' },
  { key: 'core', label: 'Core' },
  { key: 'full_body', label: 'Full body' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'other', label: 'Other' },
];

/** Multi-select exercise picker, like Strong's "Add Exercises" sheet. */
export function ExercisePicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exerciseIds: string[]) => void;
}) {
  const exercises = useAppState((s) => s.exercises);
  const [query, setQuery] = useState('');
  const [bodyPart, setBodyPart] = useState<BodyPart | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const results = useMemo(() => searchExercises(exercises, query, bodyPart), [exercises, query, bodyPart]);

  const close = () => {
    setSelected([]);
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={s.header}>
          <Button title="Cancel" kind="ghost" small onPress={close} />
          <Text style={s.title}>Add Exercises</Text>
          <Button
            title={selected.length ? `Add (${selected.length})` : 'Add'}
            small
            disabled={!selected.length}
            onPress={() => {
              onPick(selected);
              close();
            }}
          />
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.faint}
          style={s.search}
          autoCorrect={false}
        />
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {BODY_PART_FILTERS.map((b) => (
              <Chip
                key={b.key}
                label={b.label}
                active={bodyPart === b.key}
                onPress={() => setBodyPart(bodyPart === b.key ? null : b.key)}
              />
            ))}
          </ScrollView>
        </View>
        <FlatList
          data={results}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const on = selected.includes(item.id);
            return (
              <Pressable
                onPress={() => setSelected(on ? selected.filter((x) => x !== item.id) : [...selected, item.id])}
                style={[s.row, on && { backgroundColor: colors.accentSoft }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{exerciseTitle(item)}</Text>
                  <Muted>{BODY_PART_FILTERS.find((b) => b.key === item.bodyPart)?.label}</Muted>
                </View>
                {on ? <Text style={s.check}>✓</Text> : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  search: {
    marginHorizontal: space.lg,
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
  check: { fontSize: 18, color: colors.accent, fontWeight: '700' },
});
