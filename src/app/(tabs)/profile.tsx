import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { loadApiKey, saveApiKey } from '../../claude/client';
import { formatNumber, fromKg, toKg, weeklyWorkoutCounts } from '../../domain/calc';
import { useAppState, useStore } from '../../store/AppStore';
import { Button, Card, Chip, confirm, Muted, NumberInput, SectionTitle } from '../../ui/components';
import { colors, radius, space } from '../../ui/theme';

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', hint: 'Best coaching' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', hint: 'Faster' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', hint: 'Cheapest' },
];

export default function Profile() {
  const store = useStore();
  const workouts = useAppState((s) => s.workouts);
  const measurements = useAppState((s) => s.measurements);
  const settings = useAppState((s) => s.settings);
  const unit = settings.unit;
  const weekly = useMemo(() => weeklyWorkoutCounts(workouts, 8), [workouts]);
  const maxWeek = Math.max(1, ...weekly);
  const weights = useMemo(() => measurements.filter((m) => m.type === 'body_weight').slice(0, 6), [measurements]);
  const [bodyWeight, setBodyWeight] = useState<number | undefined>();

  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => {
    loadApiKey().then((k) => setHasKey(!!k));
  }, []);

  const update = (patch: Partial<typeof settings>) => store.dispatch({ type: 'updateSettings', patch });

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={s.big}>{workouts.length}</Text>
        <Muted>workouts logged</Muted>
        <Text style={[s.label, { marginTop: space.lg }]}>Workouts per week</Text>
        <View style={s.chart}>
          {weekly.map((n, i) => (
            <View key={i} style={s.barSlot}>
              <Text style={s.barValue}>{n || ''}</Text>
              <View style={[s.bar, { height: `${Math.max(3, (n / maxWeek) * 80)}%` }]} />
            </View>
          ))}
        </View>
        <Muted style={{ fontSize: 12 }}>Last 8 weeks</Muted>
      </Card>

      <SectionTitle>Body Weight</SectionTitle>
      <Card>
        <View style={s.inline}>
          <NumberInput value={bodyWeight} onChange={setBodyWeight} placeholder={unit} style={{ minWidth: 100 }} />
          <Button
            title="Log"
            small
            disabled={!bodyWeight}
            onPress={() => {
              if (!bodyWeight) return;
              store.dispatch({ type: 'logMeasurement', measurement: { type: 'body_weight', value: toKg(bodyWeight, unit) } });
              setBodyWeight(undefined);
            }}
          />
        </View>
        {weights.map((m) => (
          <View key={m.id} style={s.row}>
            <Muted>{new Date(m.at).toLocaleDateString()}</Muted>
            <Text style={s.value}>
              {formatNumber(fromKg(m.value, unit))} {unit}
            </Text>
          </View>
        ))}
      </Card>

      <SectionTitle>Coach</SectionTitle>
      <Card>
        <Text style={s.label}>Anthropic API key</Text>
        <Muted style={{ marginBottom: space.sm }}>
          {hasKey
            ? 'A key is saved on this device.'
            : 'Create one at console.anthropic.com. It is stored in the device keychain and only sent to the Claude API.'}
        </Muted>
        <View style={s.inline}>
          <TextInput
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder={hasKey ? '••••••••' : 'sk-ant-…'}
            placeholderTextColor={colors.faint}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={s.keyInput}
          />
          <Button
            title="Save"
            small
            disabled={!keyInput.trim()}
            onPress={async () => {
              await saveApiKey(keyInput.trim());
              setKeyInput('');
              setHasKey(true);
            }}
          />
        </View>
        {hasKey ? (
          <Button
            title="Remove key"
            kind="ghost"
            small
            style={{ alignSelf: 'flex-start', marginTop: space.sm, paddingHorizontal: 0 }}
            onPress={async () => {
              if (await confirm('Remove API key?', 'The coach will stop working until you add a key again.', 'Remove')) {
                await saveApiKey(null);
                setHasKey(false);
              }
            }}
          />
        ) : null}
        <Text style={[s.label, { marginTop: space.lg }]}>Model</Text>
        <View style={s.wrap}>
          {MODELS.map((m) => (
            <Chip
              key={m.id}
              label={`${m.label} · ${m.hint}`}
              active={settings.coachModel === m.id}
              onPress={() => update({ coachModel: m.id })}
              style={{ marginBottom: space.sm }}
            />
          ))}
        </View>
      </Card>

      <SectionTitle>Settings</SectionTitle>
      <Card style={{ gap: space.md }}>
        <View style={s.settingRow}>
          <Text style={s.value}>Weight unit</Text>
          <View style={{ flexDirection: 'row' }}>
            <Chip label="kg" active={unit === 'kg'} onPress={() => update({ unit: 'kg' })} />
            <Chip label="lb" active={unit === 'lb'} onPress={() => update({ unit: 'lb', barWeightKg: unit === 'kg' && settings.barWeightKg === 20 ? toKg(45, 'lb') : settings.barWeightKg })} style={{ marginRight: 0 }} />
          </View>
        </View>
        <View style={s.settingRow}>
          <Text style={s.value}>Default rest (seconds)</Text>
          <NumberInput integer value={settings.defaultRestSeconds} onChange={(v) => v && update({ defaultRestSeconds: v })} />
        </View>
        <View style={s.settingRow}>
          <Text style={s.value}>Bar weight ({unit})</Text>
          <NumberInput
            value={Number(formatNumber(fromKg(settings.barWeightKg, unit)))}
            onChange={(v) => v !== undefined && update({ barWeightKg: toKg(v, unit) })}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 48 },
  big: { fontSize: 34, fontWeight: '800', color: colors.text },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  chart: { height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginVertical: space.sm },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'stretch' },
  barValue: { fontSize: 11, color: colors.muted, textAlign: 'center' },
  bar: { backgroundColor: colors.accent, borderRadius: 3 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.sm },
  value: { fontSize: 15, color: colors.text, fontWeight: '500' },
  keyInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.text,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
