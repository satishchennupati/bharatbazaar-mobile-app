/**
 * SearchablePicker — bottom-sheet modal picker with search.
 * Works for any list of strings (countries, regions, cities).
 */
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing } from "@/src/theme";

export type PickerItem = {
  key: string;
  label: string;
  sublabel?: string;
  prefix?: string; // e.g. flag emoji
};

type Props = {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedKey?: string;
  searchPlaceholder?: string;
  emptyHint?: string;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
};

export function SearchablePicker({
  visible,
  title,
  items,
  selectedKey,
  searchPlaceholder = "Search…",
  emptyHint = "No results",
  onSelect,
  onClose,
}: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(s) ||
        (it.sublabel || "").toLowerCase().includes(s) ||
        it.key.toLowerCase().includes(s),
    );
  }, [items, q]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} testID="picker-close">
              <Ionicons name="close" size={22} color={colors.textMain} />
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textDisabled}
              style={styles.searchInput}
              autoFocus
              testID="picker-search"
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.key}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={() => (
              <View style={{ padding: spacing.xl, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted }}>{emptyHint}</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const active = item.key === selectedKey;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    setQ("");
                  }}
                  style={[styles.row, active && { backgroundColor: colors.primaryLight }]}
                  testID={`picker-item-${item.key}`}
                >
                  {item.prefix ? <Text style={styles.prefix}>{item.prefix}</Text> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    {item.sublabel ? <Text style={styles.rowSub}>{item.sublabel}</Text> : null}
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    height: "85%",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.textMain },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.surfaceMuted },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.textMain, fontSize: 15, padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  prefix: { fontSize: 22 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: colors.textMain },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },
});
