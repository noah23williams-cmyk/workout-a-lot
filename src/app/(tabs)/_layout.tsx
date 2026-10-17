import { Tabs } from 'expo-router/tabs';
import { type ColorValue, Text } from 'react-native';
import { colors } from '../../ui/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18, fontWeight: '700' }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('◉') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('↺') }} />
      <Tabs.Screen name="index" options={{ title: 'Workout', tabBarIcon: icon('+') }} />
      <Tabs.Screen name="exercises" options={{ title: 'Exercises', tabBarIcon: icon('≡') }} />
      <Tabs.Screen
        name="coach"
        options={{ title: 'Coach', tabBarIcon: icon('✦'), tabBarActiveTintColor: colors.coach }}
      />
    </Tabs>
  );
}
