/**
 * DropdownField — labelled pressable that opens the SearchablePicker.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing } from "@/src/theme";

type Props = {
  label: string;
  value: string;
  placeholder?: string;
  prefix?: string; // e.g. flag emoji
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
};

export function DropdownField({ label, value, placeholder, prefix, disabled, onPress, testID }: Props) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={[styles.field, disabled && { opacity: 0.5 }]}
        testID={testID}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <Text
          style={[styles.value, !value && { color: colors.textDisabled, fontWeight: "400" }]}
          numberOfLines={1}
        >
          {value || placeholder || "Select"}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  prefix: { fontSize: 20 },
  value: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textMain },
});
