/**
 * Sign-up: collect username/password/phone -> send OTP -> verify -> create account.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Signup() {
  const router = useRouter();
  const { setSession, lang, currency, t } = useApp();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("+355");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  const sendOtp = async () => {
    setError(null);
    if (!phone.startsWith("+") || phone.length < 8) {
      setError(t("phone_hint"));
      return;
    }
    if (username.trim().length < 3 || password.length < 6) {
      setError("Username (3+ chars) and password (6+ chars) required");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ ok: boolean; debug_code?: string }>("/auth/register/send-otp", { phone });
      if (res.debug_code) setDebugCode(res.debug_code);
      setStep(2);
    } catch (e: any) {
      setError(e?.message || t("error_generic"));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (code.length < 4) {
      setError(t("enter_otp"));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>("/auth/register/verify-otp", {
        phone,
        code,
        username: username.trim(),
        password,
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        language: lang,
        currency,
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
        <Pressable onPress={() => (step === 2 ? setStep(1) : router.back())} style={styles.back} testID="signup-back">
          <Ionicons name="chevron-back" size={24} color={colors.textMain} />
        </Pressable>

        <Text style={styles.title}>{t("signup")}</Text>
        <Text style={styles.sub}>{step === 1 ? t("phone_hint") : t("enter_otp")}</Text>

        {step === 1 ? (
          <>
            <Field label={t("full_name")}>
              <TextInput value={fullName} onChangeText={setFullName} style={styles.input} testID="signup-name" />
            </Field>
            <Field label={t("username")}>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                style={styles.input}
                testID="signup-username"
              />
            </Field>
            <Field label={t("password")}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
                testID="signup-password"
              />
            </Field>
            <Field label={t("email_optional")}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                testID="signup-email"
              />
            </Field>
            <Field label={t("phone_number")}>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                style={styles.input}
                testID="signup-phone"
              />
            </Field>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={sendOtp}
              disabled={loading}
              style={[styles.cta, loading && { opacity: 0.6 }]}
              testID="signup-send-otp-btn"
            >
              <Text style={styles.ctaText}>{loading ? t("loading") : t("send_otp")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.phoneShow} testID="signup-phone-show">
              {phone}
            </Text>
            <Field label={t("enter_otp")}>
              <TextInput
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={8}
                style={[styles.input, styles.otpInput]}
                placeholder="123456"
                placeholderTextColor={colors.textDisabled}
                testID="signup-otp-input"
              />
            </Field>
            {debugCode && (
              <View style={styles.demoBox} testID="signup-debug-code">
                <Text style={styles.demoTitle}>Dev OTP (mock)</Text>
                <Text style={styles.demoText}>{debugCode}</Text>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={verify}
              disabled={loading}
              style={[styles.cta, loading && { opacity: 0.6 }]}
              testID="signup-verify-btn"
            >
              <Text style={styles.ctaText}>{loading ? t("loading") : t("verify")}</Text>
            </Pressable>
            <Pressable onPress={sendOtp} disabled={loading} style={styles.resend} testID="signup-resend-btn">
              <Text style={styles.resendText}>{t("resend_otp")}</Text>
            </Pressable>
          </>
        )}

        <View style={styles.linkRow}>
          <Text style={styles.linkLabel}>{t("have_account")}</Text>
          <Pressable onPress={() => router.replace("/(auth)/login")} testID="signup-goto-login">
            <Text style={styles.link}>{t("login")}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 60 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  title: { fontSize: 30, fontWeight: "700", color: colors.textMain, letterSpacing: -0.5, marginTop: spacing.md },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
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
  otpInput: { fontSize: 22, letterSpacing: 8, textAlign: "center", fontWeight: "700" },
  phoneShow: { fontSize: 16, color: colors.textMain, fontWeight: "600", textAlign: "center", marginBottom: spacing.md },
  error: { color: colors.error, fontSize: 13, marginBottom: 8 },
  cta: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  resend: { padding: spacing.md, alignItems: "center" },
  resendText: { color: colors.primary, fontWeight: "600" },
  demoBox: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  demoTitle: { fontSize: 12, fontWeight: "700", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5 },
  demoText: { fontSize: 18, color: colors.textMain, fontWeight: "700", marginTop: 2 },
  linkRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.xl },
  linkLabel: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
