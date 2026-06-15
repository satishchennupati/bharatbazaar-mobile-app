import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AppProvider, useApp } from "@/src/store/app-context";
import { colors } from "@/src/theme";

SplashScreen.preventAutoHideAsync();

function RootGate() {
  const router = useRouter();
  const segments = useSegments();
  const { ready, onboarded, token } = useApp();

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === "(auth)";
    const inTabs = segments[0] === "(tabs)";
    const atOnboarding = segments[0] === "onboarding";
    if (!onboarded && !atOnboarding) {
      router.replace("/onboarding");
      return;
    }
    if (onboarded && !token && !inAuth && !atOnboarding) {
      router.replace("/(auth)/login");
      return;
    }
    if (token && (inAuth || atOnboarding || segments.length === 0)) {
      router.replace("/(tabs)");
    }
  }, [ready, onboarded, token, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    />
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <AppProvider>
            <StatusBar style="dark" backgroundColor={colors.background} />
            <RootGate />
          </AppProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
