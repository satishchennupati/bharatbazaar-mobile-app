/**
 * Admin login — dedicated screen at /admin/login.
 * Uses POST /api/admin/auth/login (only accepts users with is_admin=true).
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function AdminLogin() {
  const router = useRouter();
  const { setSession } = useApp();
  const { width } = useWindowDimensions();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phone.trim().length >= 6 && password.trim().length >= 4;

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const full = phone.startsWith("+") ? phone.trim() : `+355${phone.trim().replace(/^0/, "")}`;
      const res = await api.post<{ token: string; user: any }>(
        "/admin/auth/login",
        { phone: full, password },
      );
      await setSession(res.token, res.user);
      router.replace("/admin");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[styles.card, width >= 500 && styles.cardWide]}>
        <View style={styles.brandRow}>
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={26} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.title}>Admin panel</Text>
            <Text style={styles.subtitle}>Bharat Bazaar management console</Text>
          </View>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <Text style={styles.label}>Phone</Text>
          <View style={styles.inputRow}>
            <Text style={styles.dial}>+355</Text>
            <TextInput
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/[^\d]/g, ""))}
              placeholder="6XXXXXXXX"
              placeholderTextColor={colors.textDisabled}
              keyboardType="phone-pad"
              style={styles.input}
              testID="admin-phone"
            />
          </View>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry={!showPw}
              style={styles.input}
              testID="admin-password"
            />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8}>
              <Ionicons name={showPw ? "eye-off" : "eye"} size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          {error && (
            <View style={styles.errBox}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errText}>{error}</Text>
            </View>
          )}
          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit || loading}
            style={[styles.cta, (!canSubmit || loading) && { opacity: 0.5 }]}
            testID="admin-login-btn"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Sign in to admin</Text>
            )}
          </Pressable>
          <Pressable onPress={() => router.replace("/")} hitSlop={8} style={styles.customerLink}>
            <Ionicons name="arrow-back" size={14} color={colors.textMuted} />
            <Text style={styles.customerLinkText}>Back to customer app</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardWide: { padding: 32 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.textMain, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginBottom: 6, marginTop: 14 },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12,
  },
  dial: { fontSize: 14, color: colors.textMain, fontWeight: "700" },
  input: { flex: 1, paddingVertical: 14, fontSize: 14, color: colors.textMain },
  cta: {
    marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: "center",
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  errBox: {
    flexDirection: "row", gap: 8, alignItems: "center",
    backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md, marginTop: 12,
  },
  errText: { flex: 1, color: colors.error, fontSize: 12, fontWeight: "600" },
  customerLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "center", marginTop: 16, padding: 8 },
  customerLinkText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
});
