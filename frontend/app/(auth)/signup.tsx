/**
 * Legacy signup route — the unified phone-first flow now lives in login.tsx.
 * We simply redirect to /(auth)/login on mount.
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/src/theme";

export default function Signup() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(auth)/login");
  }, [router]);
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
