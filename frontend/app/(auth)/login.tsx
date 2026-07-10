/**
 * Phone-first authentication screen.
 *
 * Flow:
 *  1. User enters phone (country dropdown +355 Albania only for now).
 *  2. On "Continue" we call /auth/check-phone.
 *     - If exists  → show password field → /auth/login → JWT
 *     - If new     → /auth/register/send-otp → OTP step → verify → create password → JWT
 */
import { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

type Country = { code: string; dial: string; name: string; flag: string };
const COUNTRIES: Country[] = [
  { code: "AL", dial: "+355", name: "Albania", flag: "🇦🇱" },
];

type Step = "phone" | "password" | "get-otp" | "otp" | "create-password";

export default function Login() {
  const router = useRouter();
  const { setSession, lang, currency, t } = useApp();

  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [showCountry, setShowCountry] = useState(false);
  const [localPhone, setLocalPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullPhone = useMemo(() => {
    const digits = localPhone.replace(/\D/g, "");
    return `${country.dial}${digits}`;
  }, [country.dial, localPhone]);

  const canSubmitPhone = localPhone.replace(/\D/g, "").length >= 6;

  // ------------- Step 1: phone → check-phone -------------
  const onContinue = async () => {
    setError(null);
    if (!canSubmitPhone) {
      setError(t("phone_hint"));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ exists: boolean }>("/auth/check-phone", { phone: fullPhone });
      if (res.exists) {
        setStep("password");
      } else {
        // New user — show a review step with an explicit "Get OTP" button
        setStep("get-otp");
      }
    } catch (e: any) {
      setError(e?.message || t("error_generic"));
    } finally {
      setLoading(false);
    }
  };

  // ------------- Existing user login -------------
  const onLogin = async () => {
    setError(null);
    if (password.length < 4) {
      setError("Enter your password");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>("/auth/login", {
        phone: fullPhone,
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

  // ------------- Verify OTP → signup token -------------
  const onVerifyOtp = async () => {
    setError(null);
    if (code.trim().length < 4) {
      setError(t("enter_otp"));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ signup_token: string }>(
        "/auth/register/verify-otp",
        { phone: fullPhone, code: code.trim() },
      );
      setSignupToken(res.signup_token);
      setStep("create-password");
    } catch (e: any) {
      setError(e?.message || t("error_generic"));
    } finally {
      setLoading(false);
    }
  };

  const onResendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const otp = await api.post<{ ok: boolean; debug_code?: string }>(
        "/auth/register/send-otp",
        { phone: fullPhone },
      );
      setDebugCode(otp.debug_code || null);
    } catch (e: any) {
      setError(e?.message || t("error_generic"));
    } finally {
      setLoading(false);
    }
  };

  // ------------- Create password (new user) -------------
  const onCreatePassword = async () => {
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!signupToken) {
      setError("Session expired, please verify OTP again");
      setStep("otp");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>(
        "/auth/register/set-password",
        {
          signup_token: signupToken,
          password,
          full_name: fullName.trim(),
          language: lang,
          currency,
        },
      );
      await setSession(res.token, res.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || t("error_generic"));
    } finally {
      setLoading(false);
    }
  };

  const onBack = () => {
    setError(null);
    if (step === "phone") return;
    if (step === "password") setStep("phone");
    else if (step === "get-otp") setStep("phone");
    else if (step === "otp") setStep("get-otp");
    else if (step === "create-password") setStep("otp");
  };

  // ------------- UI -------------
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          {step !== "phone" ? (
            <Pressable onPress={onBack} style={styles.back} testID="auth-back-btn">
              <Ionicons name="chevron-back" size={24} color={colors.textMain} />
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}
          <View style={styles.brandRow}>
            <Image
              source={require("@/assets/images/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brand}>Bharat Bazaar</Text>
          </View>
          <View style={styles.back} />
        </View>

        {step === "phone" && (
          <>
            <Text style={styles.title}>{t("login")} / {t("signup")}</Text>
            <Text style={styles.sub}>{t("tagline")}</Text>
            <Text style={styles.label}>{t("phone_number")}</Text>
            <View style={styles.phoneRow}>
              <Pressable
                onPress={() => setShowCountry(true)}
                style={styles.countryBtn}
                testID="auth-country-btn"
              >
                <Text style={styles.flag}>{country.flag}</Text>
                <Text style={styles.dial}>{country.dial}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </Pressable>
              <TextInput
                value={localPhone}
                onChangeText={setLocalPhone}
                keyboardType="phone-pad"
                placeholder="69 000 0000"
                placeholderTextColor={colors.textDisabled}
                style={styles.phoneInput}
                testID="auth-phone-input"
              />
            </View>
            <Text style={styles.hint}>{t("phone_hint")}</Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={onContinue}
              disabled={loading || !canSubmitPhone}
              style={[styles.cta, (loading || !canSubmitPhone) && { opacity: 0.5 }]}
              testID="auth-continue-btn"
            >
              <Text style={styles.ctaText}>{loading ? t("loading") : t("continue")}</Text>
              {!loading && <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </Pressable>
          </>
        )}

        {step === "password" && (
          <>
            <Text style={styles.title}>{t("login")}</Text>
            <Text style={styles.sub} testID="auth-phone-show-existing">{fullPhone}</Text>
            <Text style={styles.label}>{t("password")}</Text>
            <View style={styles.pwRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                placeholder="••••••••"
                placeholderTextColor={colors.textDisabled}
                style={[styles.input, { flex: 1 }]}
                autoFocus
                testID="auth-password-input"
              />
              <Pressable onPress={() => setShowPw((v) => !v)} style={styles.eye} testID="auth-show-pw">
                <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={onLogin}
              disabled={loading}
              style={[styles.cta, loading && { opacity: 0.6 }]}
              testID="auth-login-btn"
            >
              <Text style={styles.ctaText}>{loading ? t("loading") : t("login")}</Text>
            </Pressable>
          </>
        )}

        {step === "get-otp" && (
          <>
            <Text style={styles.title}>{t("signup")}</Text>
            <Text style={styles.sub}>
              We&apos;ll send a verification code to{" "}
              <Text style={{ color: colors.textMain, fontWeight: "600" }}>{fullPhone}</Text>
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={async () => {
                setError(null);
                setLoading(true);
                try {
                  const otp = await api.post<{ ok: boolean; debug_code?: string }>(
                    "/auth/register/send-otp",
                    { phone: fullPhone },
                  );
                  if (otp.debug_code) setDebugCode(otp.debug_code);
                  setStep("otp");
                } catch (e: any) {
                  setError(e?.message || t("error_generic"));
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              style={[styles.cta, loading && { opacity: 0.6 }]}
              testID="auth-get-otp-btn"
            >
              <Text style={styles.ctaText}>{loading ? t("loading") : "Get OTP"}</Text>
              {!loading && <Ionicons name="paper-plane" size={18} color="#fff" />}
            </Pressable>
            <Pressable onPress={() => setStep("phone")} style={styles.resend} testID="auth-change-phone">
              <Text style={styles.resendText}>Change number</Text>
            </Pressable>
          </>
        )}

        {step === "otp" && (
          <>
            <Text style={styles.title}>{t("verify")}</Text>
            <Text style={styles.sub}>
              {t("enter_otp")} — <Text style={{ color: colors.textMain, fontWeight: "600" }}>{fullPhone}</Text>
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
              style={[styles.input, styles.otpInput]}
              placeholder="123456"
              placeholderTextColor={colors.textDisabled}
              testID="auth-otp-input"
            />
            {debugCode && (
              <View style={styles.demoBox} testID="auth-debug-code">
                <Text style={styles.demoTitle}>Dev OTP (mock)</Text>
                <Text style={styles.demoText}>{debugCode}</Text>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={onVerifyOtp}
              disabled={loading}
              style={[styles.cta, loading && { opacity: 0.6 }]}
              testID="auth-verify-otp-btn"
            >
              <Text style={styles.ctaText}>{loading ? t("loading") : t("verify")}</Text>
            </Pressable>
            <Pressable onPress={onResendOtp} disabled={loading} style={styles.resend} testID="auth-resend-btn">
              <Text style={styles.resendText}>{t("resend_otp")}</Text>
            </Pressable>
          </>
        )}

        {step === "create-password" && (
          <>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.sub}>Almost done — pick a password to secure your account.</Text>
            <Text style={styles.label}>{t("full_name")}</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              placeholderTextColor={colors.textDisabled}
              style={styles.input}
              testID="auth-newuser-name"
            />
            <Text style={styles.label}>Create password</Text>
            <View style={styles.pwRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textDisabled}
                style={[styles.input, { flex: 1 }]}
                testID="auth-newuser-password"
              />
              <Pressable onPress={() => setShowPw((v) => !v)} style={styles.eye} testID="auth-newuser-show-pw">
                <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={onCreatePassword}
              disabled={loading}
              style={[styles.cta, loading && { opacity: 0.6 }]}
              testID="auth-create-password-btn"
            >
              <Text style={styles.ctaText}>{loading ? t("loading") : "Create account"}</Text>
            </Pressable>
          </>
        )}
      </KeyboardAwareScrollView>

      {/* Country picker modal */}
      <Modal visible={showCountry} transparent animationType="slide" onRequestClose={() => setShowCountry(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowCountry(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Country</Text>
          {COUNTRIES.map((c) => {
            const active = c.code === country.code;
            return (
              <Pressable
                key={c.code}
                onPress={() => {
                  setCountry(c);
                  setShowCountry(false);
                }}
                style={[styles.countryRow, active && { backgroundColor: colors.primaryLight }]}
                testID={`auth-country-opt-${c.code}`}
              >
                <Text style={styles.flag}>{c.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.countryName, active && { color: colors.primary }]}>{c.name}</Text>
                  <Text style={styles.countrySub}>{c.dial}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </Pressable>
            );
          })}
          <Text style={styles.moreSoon}>More countries coming soon</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 60 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 36, height: 36 },
  brand: { fontSize: 17, fontWeight: "700", color: colors.textMain },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.textMain,
    letterSpacing: -0.5,
    marginTop: spacing.md,
  },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: spacing.xl },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6, marginTop: spacing.sm },
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
  phoneRow: { flexDirection: "row", gap: 8 },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  flag: { fontSize: 20 },
  dial: { fontSize: 15, fontWeight: "700", color: colors.textMain },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textMain,
  },
  hint: { fontSize: 11, color: colors.textDisabled, marginTop: 6 },
  otpInput: {
    fontSize: 24,
    letterSpacing: 12,
    textAlign: "center",
    fontWeight: "700",
    marginTop: 4,
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
  error: { color: colors.error, fontSize: 13, marginTop: 10 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: spacing.lg,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  resend: { padding: spacing.md, alignItems: "center" },
  resendText: { color: colors.primary, fontWeight: "600" },
  demoBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  demoTitle: { fontSize: 12, fontWeight: "700", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5 },
  demoText: { fontSize: 18, color: colors.textMain, fontWeight: "700", marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.textMain, marginBottom: spacing.md },
  countryRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.base, borderRadius: radius.md },
  countryName: { fontSize: 15, fontWeight: "600", color: colors.textMain },
  countrySub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  moreSoon: { fontSize: 12, color: colors.textDisabled, textAlign: "center", marginTop: spacing.md, fontStyle: "italic" },
});
