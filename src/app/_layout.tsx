import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStoreProvider } from '../store/AppStore';
import { ConfirmHost } from '../ui/components';
import { colors } from '../ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.accent,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="workout" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise' }} />
          <Stack.Screen name="template/[id]" options={{ title: 'Template', presentation: 'modal' }} />
        </Stack>
        <ConfirmHost />
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}
