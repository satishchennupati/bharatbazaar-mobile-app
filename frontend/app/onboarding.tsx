/**
 * Onboarding: language picker (first launch).
 */
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/store/app-context";
import { LANGUAGES, type Lang } from "@/src/i18n";
import { colors, radius, spacing } from "@/src/theme";

export default function Onboarding() {
  const router = useRouter();
  const { setOnboarded, setLang, lang, t } = useApp();
  const [selLang, setSelLang] = useState<Lang>(lang);

  const onContinue = async () => {
    await setLang(selLang);
    await setOnboarded(true);
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image source={require("@/assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>Bharat Bazaar</Text>
          <Text style={styles.tagline}>{t("tagline")}</Text>
        </View>

        <Text style={styles.sectionTitle} testID="onboard-lang-title">{t("pick_language")}</Text>
        <View style={styles.list}>
          {LANGUAGES.map((l) => {
            const active = selLang === l.code;
            return (
              <Pressable
                key={l.code}
                onPress={() => setSelLang(l.code)}
                testID={`onboard-lang-${l.code}`}
                style={[styles.row, active && styles.rowActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowNative, active && styles.rowNativeActive]}>{l.native}</Text>
                  <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                    {l.label}
                    {l.code === "en" ? "  ·  Default" : ""}
                  </Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={onContinue} style={styles.cta} testID="onboard-continue-btn">
          <Text style={styles.ctaText}>{t("continue")}</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  header: { alignItems: "center", marginVertical: spacing.xl },
  logo: { width: 88, height: 88, marginBottom: spacing.md },
  brand: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  sectionTitle: { fontSize: 20, fontWeight: "600", color: colors.textMain, marginBottom: spacing.md },
  list: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  rowNative: { fontSize: 17, fontWeight: "700", color: colors.textMain },
  rowNativeActive: { color: colors.primary },
  rowLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowLabelActive: { color: colors.primaryDark },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
