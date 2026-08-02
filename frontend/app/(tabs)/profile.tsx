/**
 * Profile: user info, language switcher, currency switcher, logout.
 */
import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl } from "@/src/lib/api";
import { CURRENCIES, LANGUAGES, type Currency, type Lang } from "@/src/i18n";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Profile() {
  const router = useRouter();
  const { t, user, lang, setLang, currency, setCurrency, clearSession, refreshUser } = useApp();
  const [showLangs, setShowLangs] = useState(false);
  const [showCurs, setShowCurs] = useState(false);

  const onLogout = async () => {
    await clearSession();
    router.replace("/(auth)/login");
  };

  const onLangPick = async (l: Lang) => {
    setShowLangs(false);
    await setLang(l);
    try {
      const updated = await api.patch<any>("/me", { language: l });
      await refreshUser(updated);
    } catch {}
  };

  const onCurPick = async (c: Currency) => {
    setShowCurs(false);
    await setCurrency(c);
    try {
      const updated = await api.patch<any>("/me", { currency: c });
      await refreshUser(updated);
    } catch {}
  };

  const langLabel = LANGUAGES.find((l) => l.code === lang)?.native || "English";
  const curLabel = CURRENCIES.find((c) => c.code === currency)?.label || "Lek";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            {user?.avatar_url ? (
              <ProfileAvatarImage uri={user.avatar_url} />
            ) : (
              <Text style={styles.avatarText}>
                {(user?.full_name || user?.username || "?").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} testID="profile-name">
              {user?.full_name || user?.username}
            </Text>
            <Text style={styles.sub}>{user?.phone || user?.email || ""}</Text>
          </View>
          <Pressable
            onPress={() => router.push("/complete-profile")}
            style={styles.editBtn}
            testID="profile-edit-btn"
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>

        <Section title="Preferences">
          <Row
            icon="language"
            label={t("language")}
            value={langLabel}
            onPress={() => setShowLangs(true)}
            testID="profile-lang-row"
          />
          <Row
            icon="cash"
            label={t("currency")}
            value={curLabel}
            onPress={() => setShowCurs(true)}
            testID="profile-cur-row"
          />
        </Section>

        <Section title="Account">
          <Row
            icon="location"
            label={t("saved_addresses")}
            value={`${user?.addresses?.length || 0}`}
            onPress={() => router.push("/manage-addresses")}
            testID="profile-addr-row"
          />
          <Row icon="help-circle" label="Help & support" value="" onPress={() => {}} testID="profile-help-row" />
        </Section>

        <Pressable onPress={onLogout} style={styles.logoutBtn} testID="profile-logout-btn">
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </Pressable>

        <Text style={styles.version}>Bharat Bazaar · v1.0</Text>
      </ScrollView>

      <PickerModal
        visible={showLangs}
        onClose={() => setShowLangs(false)}
        title={t("pick_language")}
        items={LANGUAGES.map((l) => ({ id: l.code, label: l.native, sub: l.label }))}
        selectedId={lang}
        onSelect={(id) => onLangPick(id as Lang)}
        testIDPrefix="profile-pick-lang"
      />
      <PickerModal
        visible={showCurs}
        onClose={() => setShowCurs(false)}
        title={t("pick_currency")}
        items={CURRENCIES.map((c) => ({ id: c.code, label: c.symbol, sub: c.label }))}
        selectedId={currency}
        onSelect={(id) => onCurPick(id as Currency)}
        testIDPrefix="profile-pick-cur"
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function ProfileAvatarImage({ uri }: { uri: string }) {
  return <Image source={{ uri: resolveImageUrl(uri) }} style={{ width: 60, height: 60, borderRadius: 30 }} />;
}

function Row({
  icon,
  label,
  value,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.primary} style={{ width: 28 }} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
    </Pressable>
  );
}

function PickerModal({
  visible,
  onClose,
  title,
  items,
  selectedId,
  onSelect,
  testIDPrefix,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: { id: string; label: string; sub?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  testIDPrefix: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{title}</Text>
        {items.map((it) => {
          const active = selectedId === it.id;
          return (
            <Pressable
              key={it.id}
              onPress={() => onSelect(it.id)}
              style={[styles.optRow, active && { backgroundColor: colors.primaryLight }]}
              testID={`${testIDPrefix}-${it.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optLabel, active && { color: colors.primary }]}>{it.label}</Text>
                {it.sub && <Text style={styles.optSub}>{it.sub}</Text>}
              </View>
              {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.base,
    padding: spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { color: "#fff", fontSize: 26, fontWeight: "700" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  name: { fontSize: 20, fontWeight: "700", color: colors.textMain },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.base, gap: 6 },
  rowLabel: { fontSize: 14, color: colors.textMain, flex: 1, fontWeight: "500" },
  rowValue: { fontSize: 13, color: colors.textMuted, marginRight: 4 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: 15 },
  version: { textAlign: "center", color: colors.textDisabled, fontSize: 12, marginTop: spacing.lg },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 20,
    maxHeight: "70%",
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.textMain, marginBottom: spacing.md },
  optRow: { flexDirection: "row", alignItems: "center", padding: spacing.base, borderRadius: radius.md },
  optLabel: { fontSize: 15, fontWeight: "600", color: colors.textMain },
  optSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
