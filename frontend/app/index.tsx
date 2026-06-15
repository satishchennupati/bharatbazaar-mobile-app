/**
 * Boot screen: never rendered (root layout redirects). Acts as fallback.
 */
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme";

export default function Index() {
  useEffect(() => {
    // Redirection handled in _layout.tsx based on app state.
  }, []);
  return (
    <View style={styles.container} testID="boot-screen">
      <Text style={styles.brand}>myBazaarCart</Text>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: -0.5,
  },
});
