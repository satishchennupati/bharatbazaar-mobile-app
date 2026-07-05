/**
 * Login: username + password for existing users.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Login() {
  const router = useRouter();
  const { setSession, t } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!username.trim() || !password) {
      setError(t("error_generic"));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>("/auth/login", {
        username: username.trim(),
        password,
      });
      await setSession(res.token, res.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || t("error_generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <Image source={require("@/assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>Bharat Bazaar</Text>
        </View>
        <Text style={styles.title}>{t("login")}</Text>
        <Text style={styles.sub}>{t("tagline")}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t("username")}</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="demo"
            placeholderTextColor={colors.textDisabled}
            style={styles.input}
            testID="login-username-input"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("password")}</Text>
          <View style={styles.pwRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              placeholder="••••••••"
              placeholderTextColor={colors.textDisabled}
              style={[styles.input, { flex: 1 }]}
              testID="login-password-input"
            />
            <Pressable onPress={() => setShowPw((v) => !v)} style={styles.eye} testID="login-show-pw">
              <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {error && (
          <Text style={styles.error} testID="login-error-text">
            {error}
          </Text>
        )}

        <Pressable
          onPress={onSubmit}
          disabled={loading}
          style={[styles.cta, loading && { opacity: 0.6 }]}
          testID="login-submit-button"
        >
          <Text style={styles.ctaText}>{loading ? t("loading") : t("login")}</Text>
        </Pressable>

        <View style={styles.demoBox} testID="login-demo-hint">
          <Text style={styles.demoTitle}>Demo account</Text>
          <Text style={styles.demoText}>demo / demo1234</Text>
        </View>

        <View style={styles.linkRow}>
          <Text style={styles.linkLabel}>{t("no_account")}</Text>
          <Pressable onPress={() => router.push("/(auth)/signup")} testID="login-goto-signup">
            <Text style={styles.link}>{t("signup")}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 60 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.md },
  logo: { width: 40, height: 40 },
  brand: { fontSize: 18, fontWeight: "700", color: colors.textMain },
  title: { fontSize: 32, fontWeight: "700", color: colors.textMain, marginTop: spacing.xl, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: spacing.xl },
  field: { marginBottom: spacing.base },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textMain,
  },
  pwRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eye: {
    width: 44,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: { color: colors.error, fontSize: 13, marginBottom: 12 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  demoBox: {
    marginTop: spacing.base,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  demoTitle: { fontSize: 12, fontWeight: "700", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5 },
  demoText: { fontSize: 14, color: colors.textMain, marginTop: 2, fontWeight: "600" },
  linkRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.xl },
  linkLabel: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
