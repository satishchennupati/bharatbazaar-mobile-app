/**
 * Complete your profile — shown right after new users set their password.
 * Fields: avatar (optional), full name (required), email (optional),
 * language + currency (pre-filled from onboarding).
 * A Skip button lets the user finish later from Profile screen.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api, resolveImageUrl } from "@/src/lib/api";
import type { Currency, Lang } from "@/src/i18n";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

const LANG_OPTIONS: { key: Lang; label: string; sub: string }[] = [
  { key: "en", label: "English", sub: "EN" },
  { key: "sq", label: "Shqip", sub: "SQ" },
  { key: "hi", label: "हिन्दी", sub: "HI" },
  { key: "it", label: "Italiano", sub: "IT" },
  { key: "el", label: "Ελληνικά", sub: "EL" },
  { key: "fr", label: "Français", sub: "FR" },
];

const CURRENCY_OPTIONS: { key: Currency; label: string; sub: string }[] = [
  { key: "LEK", label: "Lek (L)", sub: "Albanian Lek" },
  { key: "EUR", label: "Euro (€)", sub: "Euro" },
];

export default function CompleteProfile() {
  const router = useRouter();
  const { user, refreshUser, lang, setLang, currency, setCurrency, t } = useApp();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [pickedLang, setPickedLang] = useState<Lang>((user?.language as Lang) || lang);
  const [pickedCurrency, setPickedCurrency] = useState<Currency>(
    user?.currency || currency,
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarPreview = avatarDataUrl || (user?.avatar_url ? resolveImageUrl(user.avatar_url) : null);
  const initial = (fullName.trim() || user?.phone || "?").charAt(0).toUpperCase();

  const onPickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Please grant photo library access to set an avatar");
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.6,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!r.canceled && r.assets[0]?.base64) {
        const a = r.assets[0];
        const mime = a.mimeType || "image/jpeg";
        setAvatarDataUrl(`data:${mime};base64,${a.base64}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to pick image");
    }
  };

  const finish = async ({ skip }: { skip: boolean }) => {
    setError(null);
    if (!skip && !fullName.trim()) {
      setError("Please enter your full name");
      return;
    }
    // Persist language/currency preferences in the app context regardless.
    if (pickedLang !== lang) await setLang(pickedLang);
    if (pickedCurrency !== currency) await setCurrency(pickedCurrency);

    if (skip && !avatarDataUrl && !fullName.trim() && !email.trim()) {
      router.replace("/(tabs)");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        language: pickedLang,
        currency: pickedCurrency,
      };
      if (fullName.trim()) payload.full_name = fullName.trim();
      if (email.trim()) payload.email = email.trim();
      if (avatarDataUrl) payload.avatar_data_url = avatarDataUrl;
      const updated = await api.post<any>("/me/profile", payload, true);
      if (updated) await refreshUser(updated);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || t("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={20}>
        <Text style={styles.title} testID="complete-profile-title">Complete your profile</Text>
        <Text style={styles.sub}>Personalise your Bharat Bazaar experience — this only takes a minute.</Text>

        {/* Avatar picker */}
        <View style={styles.avatarBlock}>
          <Pressable onPress={onPickAvatar} style={styles.avatarWrap} testID="complete-profile-avatar-btn">
            {avatarPreview ? (
              <Image source={{ uri: avatarPreview }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>{avatarPreview ? "Tap to change" : "Add a profile photo"}</Text>
        </View>

        <Text style={styles.label}>Full name *</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Enter your name"
          placeholderTextColor={colors.textDisabled}
          style={styles.input}
          testID="complete-profile-name"
        />

        <Text style={styles.label}>Email (optional)</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textDisabled}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
          testID="complete-profile-email"
        />

        <Text style={styles.label}>Language</Text>
        <View style={styles.chipsRow}>
          {LANG_OPTIONS.map((opt) => {
            const active = pickedLang === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setPickedLang(opt.key)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`complete-profile-lang-${opt.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Preferred currency</Text>
        <View style={styles.chipsRow}>
          {CURRENCY_OPTIONS.map((opt) => {
            const active = pickedCurrency === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setPickedCurrency(opt.key)}
                style={[styles.currChip, active && styles.chipActive]}
                testID={`complete-profile-curr-${opt.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                <Text style={[styles.currSub, active && { color: "#fff", opacity: 0.85 }]}>{opt.sub}</Text>
              </Pressable>
            );
          })}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          onPress={() => finish({ skip: false })}
          disabled={saving}
          style={[styles.cta, saving && { opacity: 0.6 }]}
          testID="complete-profile-save"
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Text style={styles.ctaText}>Finish</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </Pressable>
        <Pressable onPress={() => finish({ skip: true })} disabled={saving} style={styles.skipBtn} testID="complete-profile-skip">
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.5, marginTop: 12 },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
  avatarBlock: { alignItems: "center", marginVertical: spacing.md },
  avatarWrap: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.primary,
  },
  avatarImg: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { fontSize: 48, fontWeight: "800", color: colors.primary },
  avatarEditBadge: {
    position: "absolute", bottom: 4, right: 4,
    backgroundColor: colors.primary,
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.background,
  },
  avatarHint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 15, color: colors.textMain,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMain, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  currChip: {
    flex: 1, minWidth: "40%",
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    gap: 2,
  },
  currSub: { fontSize: 11, color: colors.textMuted },
  error: { color: colors.error, fontSize: 13, marginTop: 12 },
  cta: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8, marginTop: spacing.xl,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  skipBtn: { padding: spacing.md, alignItems: "center", marginTop: 4 },
  skipText: { color: colors.textMuted, fontWeight: "600" },
});
