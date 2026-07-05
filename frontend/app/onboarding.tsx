/**
 * Onboarding: pick language + currency before login.
 */
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/store/app-context";
import { CURRENCIES, LANGUAGES, type Currency, type Lang } from "@/src/i18n";
import { colors, radius, spacing } from "@/src/theme";

export default function Onboarding() {
  const router = useRouter();
  const { setOnboarded, setLang, setCurrency, lang, currency, t } = useApp();
  const [selLang, setSelLang] = useState<Lang>(lang);
  const [selCur, setSelCur] = useState<Currency>(currency);

  const onContinue = async () => {
    await setLang(selLang);
    await setCurrency(selCur);
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
        <View style={styles.grid}>
          {LANGUAGES.map((l) => {
            const active = selLang === l.code;
            return (
              <Pressable
                key={l.code}
                onPress={() => setSelLang(l.code)}
                testID={`onboard-lang-${l.code}`}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipNative, active && styles.chipNativeActive]}>{l.native}</Text>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{l.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]} testID="onboard-cur-title">
          {t("pick_currency")}
        </Text>
        <View style={styles.grid}>
          {CURRENCIES.map((c) => {
            const active = selCur === c.code;
            return (
              <Pressable
                key={c.code}
                onPress={() => setSelCur(c.code)}
                testID={`onboard-cur-${c.code}`}
                style={[styles.curChip, active && styles.chipActive]}
              >
                <Text style={[styles.curSymbol, active && styles.curSymbolActive]}>{c.symbol}</Text>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{c.label}</Text>
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    width: "48%",
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  chipNative: { fontSize: 16, fontWeight: "700", color: colors.textMain },
  chipNativeActive: { color: colors.primary },
  chipLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chipLabelActive: { color: colors.primaryDark },
  curChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    width: "48%",
    alignItems: "flex-start",
  },
  curSymbol: { fontSize: 24, fontWeight: "700", color: colors.textMain },
  curSymbolActive: { color: colors.primary },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
