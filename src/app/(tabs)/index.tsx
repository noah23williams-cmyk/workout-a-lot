import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDuration } from '../../domain/calc';
import type { Template } from '../../domain/types';
import { useAppState, useStore } from '../../store/AppStore';
import { Button, Card, confirm, Muted, SectionTitle } from '../../ui/components';
import { colors, space } from '../../ui/theme';
import { useNow } from '../../ui/useNow';

export default function WorkoutTab() {
  const store = useStore();
  const active = useAppState((s) => s.activeWorkout);
  const templates = useAppState((s) => s.templates);
  const exercises = useAppState((s) => s.exercises);
  const now = useNow(active ? 1000 : null);

  const start = (template?: Template) => {
    store.dispatch({ type: 'startWorkout', templateId: template?.id });
    router.push('/workout');
  };

  const onTemplate = async (t: Template) => {
    if (active) {
      router.push('/workout');
      return;
    }
    if (await confirm(t.name, `Start a workout from this template?`, 'Start')) start(t);
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      {active ? (
        <Card style={s.activeCard}>
          <Text style={s.activeTitle}>{active.name}</Text>
          <Muted>In progress · {formatDuration((now - active.startedAt) / 1000)}</Muted>
          <Button title="Resume Workout" kind="success" onPress={() => router.push('/workout')} style={{ marginTop: space.md }} />
        </Card>
      ) : (
        <>
          <SectionTitle>Quick Start</SectionTitle>
          <Button title="Start an Empty Workout" onPress={() => start()} />
        </>
      )}

      <SectionTitle
        right={<Button title="+ Template" kind="ghost" small onPress={() => router.push('/template/new')} />}
      >
        My Templates ({templates.length})
      </SectionTitle>

      {templates.length === 0 ? (
        <Card>
          <Text style={s.cardTitle}>No templates yet</Text>
          <Muted style={{ marginTop: 4 }}>
            Build one yourself, save a past workout as a template, or ask the coach to design a program for you.
          </Muted>
          <Button
            title="Ask Coach for a Program"
            kind="secondary"
            style={{ marginTop: space.md }}
            onPress={() => router.push({ pathname: '/coach', params: { prompt: 'Design a 3-day full body program for me and save the workouts as templates.' } })}
          />
        </Card>
      ) : (
        <View style={s.grid}>
          {templates.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onTemplate(t)}
              onLongPress={() => router.push(`/template/${t.id}`)}
              style={({ pressed }) => [s.templateCard, pressed && { opacity: 0.7 }]}
            >
              <View style={s.templateHeader}>
                <Text style={s.cardTitle} numberOfLines={1}>{t.name}</Text>
                <Pressable hitSlop={10} onPress={() => router.push(`/template/${t.id}`)}>
                  <Text style={s.edit}>Edit</Text>
                </Pressable>
              </View>
              {t.createdBy === 'coach' ? <Text style={s.coachTag}>✦ by Coach</Text> : null}
              {t.exercises.slice(0, 5).map((e, i) => (
                <Muted key={i} style={{ fontSize: 13 }}>
                  {e.sets.length} × {exercises[e.exerciseId]?.name ?? 'Unknown'}
                </Muted>
              ))}
              {t.exercises.length > 5 ? <Muted style={{ fontSize: 13 }}>+{t.exercises.length - 5} more</Muted> : null}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 48 },
  activeCard: { borderColor: colors.success, borderWidth: 1.5 },
  activeTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  grid: { gap: space.md },
  templateCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 2,
  },
  templateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  edit: { color: colors.accent, fontWeight: '600' },
  coachTag: { color: colors.coach, fontSize: 12, fontWeight: '600', marginBottom: 2 },
});
