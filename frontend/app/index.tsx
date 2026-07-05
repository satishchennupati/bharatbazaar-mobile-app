/**
 * Boot screen: never rendered (root layout redirects). Acts as fallback.
 */
import { useEffect } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme";

export default function Index() {
  useEffect(() => {
    // Redirection handled in _layout.tsx based on app state.
  }, []);
  return (
    <View style={styles.container} testID="boot-screen">
      <Image source={require("@/assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.brand}>Bharat Bazaar</Text>
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
  logo: { width: 92, height: 92, marginBottom: 12 },
  brand: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: -0.5,
  },
});
