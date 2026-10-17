import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type ChatItem, toChatItems } from '../../claude/coach';
import { useCoach } from '../../claude/useCoach';
import { Button, Card, confirm, Muted } from '../../ui/components';
import { colors, radius, space } from '../../ui/theme';

const SUGGESTIONS = [
  'What should I train today?',
  'Build me a 4-day upper/lower split and save it as templates.',
  'How is my bench press progressing?',
  'Set up my next session with progressive overload.',
];

export default function Coach() {
  const { history, status, send, clear, apiKey, refreshKey } = useCoach();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const [input, setInput] = useState('');
  const list = useRef<FlatList<ChatItem>>(null);

  // Re-check the key when returning from Settings.
  useFocusEffect(useCallback(() => refreshKey(), [refreshKey]));

  useEffect(() => {
    if (params.prompt) setInput(params.prompt);
  }, [params.prompt]);

  const items = useMemo(() => {
    const base = toChatItems(history);
    if (status.busy) {
      if (status.draft) base.push({ key: 'draft', role: 'assistant', text: status.draft });
      base.push({ key: 'activity', role: 'tool', text: status.activity ?? 'Thinking…' });
    }
    return base;
  }, [history, status]);

  const submit = (text = input) => {
    if (!text.trim()) return;
    setInput('');
    send(text);
  };

  if (apiKey === undefined) return null;

  if (!apiKey) {
    return (
      <View style={{ padding: space.lg }}>
        <Card>
          <Text style={s.setupTitle}>✦ Meet your coach</Text>
          <Muted style={{ marginTop: space.sm }}>
            The coach is Claude, built into the app. It reads your workout history and can build templates, plan your next
            session and log sets for you. Add your Anthropic API key in Profile to turn it on. The key stays on this device.
          </Muted>
          <Button title="Add API Key" style={{ marginTop: space.lg }} onPress={() => router.navigate('/profile')} />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={s.list}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={{ gap: space.sm }}>
            <Text style={s.hello}>Ask about your training, or have the coach set things up for you.</Text>
            {SUGGESTIONS.map((q) => (
              <Pressable key={q} style={s.suggestion} onPress={() => submit(q)}>
                <Text style={s.suggestionText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item }) => <Bubble item={item} />}
        ListFooterComponent={status.error ? <Text style={s.error}>{status.error}</Text> : undefined}
      />
      <View style={s.composer}>
        {history.length ? (
          <Pressable
            hitSlop={8}
            onPress={async () => {
              if (await confirm('New conversation?', 'This clears the chat. Your workouts are not affected.', 'Clear')) clear();
            }}
          >
            <Text style={s.clear}>New</Text>
          </Pressable>
        ) : null}
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Message your coach"
          placeholderTextColor={colors.faint}
          style={s.input}
          multiline
          editable={!status.busy}
          onSubmitEditing={() => submit()}
          blurOnSubmit={Platform.OS === 'web'}
        />
        {status.busy ? (
          <ActivityIndicator color={colors.coach} style={{ width: 56 }} />
        ) : (
          <Button title="Send" small onPress={() => submit()} disabled={!input.trim()} style={{ backgroundColor: colors.coach }} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ item }: { item: ChatItem }) {
  if (item.role === 'tool') {
    return (
      <View style={s.toolRow}>
        <Text style={[s.tool, item.isError && { color: colors.danger }]}>
          {item.isError ? '✕' : '✦'} {item.text}
        </Text>
      </View>
    );
  }
  const mine = item.role === 'user';
  return (
    <View style={[s.bubble, mine ? s.mine : s.theirs]}>
      <Text style={[s.bubbleText, mine && { color: '#fff' }]} selectable>
        {item.text}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  setupTitle: { fontSize: 18, fontWeight: '700', color: colors.coach },
  hello: { fontSize: 16, color: colors.muted, marginBottom: space.sm },
  suggestion: {
    backgroundColor: colors.coachSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  suggestionText: { color: colors.coach, fontSize: 15, fontWeight: '500' },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.text },
  toolRow: { alignSelf: 'flex-start', paddingHorizontal: 4 },
  tool: { fontSize: 13, color: colors.coach, fontWeight: '600' },
  error: { color: colors.danger, marginTop: space.md },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clear: { color: colors.accent, fontWeight: '600', paddingBottom: 10 },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
});
