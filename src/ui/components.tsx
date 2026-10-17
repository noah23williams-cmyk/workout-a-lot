import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space } from './theme';

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: '#fff' },
    secondary: { bg: colors.accentSoft, fg: colors.accent },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    success: { bg: colors.success, fg: '#fff' },
    ghost: { bg: 'transparent', fg: colors.accent },
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: palette.fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: colors.accent, borderColor: colors.accent }, style]}
    >
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Muted style={{ textAlign: 'center' }}>{body}</Muted> : null}
    </View>
  );
}

/**
 * Numeric input that keeps the raw text while typing ("2." is a valid
 * intermediate state) and reports a parsed number or undefined.
 */
export function NumberInput({
  value,
  onChange,
  placeholder,
  style,
  integer,
  editable = true,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  integer?: boolean;
  editable?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    const parsed = text === '' ? undefined : Number(text.replace(',', '.'));
    if (parsed !== value) setText(value === undefined ? '' : String(value));
    // Only resync when the value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextInput
      value={text}
      editable={editable}
      onChangeText={(t) => {
        const cleaned = integer ? t.replace(/[^0-9]/g, '') : t.replace(/[^0-9.,]/g, '');
        setText(cleaned);
        if (cleaned === '') return onChange(undefined);
        const n = Number(cleaned.replace(',', '.'));
        if (Number.isFinite(n)) onChange(n);
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      selectTextOnFocus
      style={[styles.numberInput, style]}
    />
  );
}

/** Cross-platform confirm; Alert buttons are a no-op on web. */
export function confirm(title: string, message: string, confirmLabel = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { paddingVertical: 6, paddingHorizontal: space.md, borderRadius: radius.sm },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonTextSmall: { fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: space.sm,
  },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  muted: { color: colors.muted, fontSize: 14 },
  empty: { alignItems: 'center', padding: space.xl, gap: space.sm },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  numberInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    minWidth: 56,
    width: 72,
  },
});
