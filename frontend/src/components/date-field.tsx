/**
 * Cross-platform date picker field.
 * - Web: uses a native <input type="date"> for the best UX and no extra deps.
 * - iOS/Android: uses @react-native-community/datetimepicker via a tap-to-open modal.
 *
 * Value / onChange contract: value is a YYYY-MM-DD string (or "" when cleared).
 * We keep it as a plain date string so it round-trips cleanly through the
 * offers API without timezone hassles.
 */
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius } from "@/src/theme";

type Props = {
  value?: string | null;
  onChange: (val: string) => void;
  placeholder?: string;
  minDate?: Date;
  testID?: string;
};

function toISO(d: Date): string {
  // Produce YYYY-MM-DD in *local* time so users don't see off-by-one dates.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fromISO(s?: string | null): Date | null {
  if (!s) return null;
  // Accept full ISO ("2026-01-01T00:00:00Z") too.
  const trimmed = String(s).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDisplay(s?: string | null): string {
  const d = fromISO(s || "");
  if (!d) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function DateField({ value, onChange, placeholder = "Select date", minDate, testID }: Props) {
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === "web") {
    // Use a proper HTML date input on web for the best UX.
    return (
      <View style={styles.inputWrap} testID={testID}>
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        {/* @ts-ignore RNW passes through DOM props for input */}
        <input
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          min={minDate ? toISO(minDate) : undefined}
          onChange={(e: any) => onChange(e.target.value || "")}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 14,
            color: colors.textMain,
            fontFamily: "inherit",
            flex: 1,
            padding: 0,
            minWidth: 0,
          }}
        />
        {value ? (
          <Pressable onPress={() => onChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setShowPicker(true)}
        style={styles.inputWrap}
        testID={testID}
      >
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        <Text style={[styles.value, !value && { color: colors.textDisabled }]}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        {value ? (
          <Pressable onPress={() => onChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        )}
      </Pressable>
      {showPicker && <NativePicker
        initial={fromISO(value) || new Date()}
        minDate={minDate}
        onDismiss={() => setShowPicker(false)}
        onSelect={(d) => {
          setShowPicker(false);
          onChange(toISO(d));
        }}
      />}
    </>
  );
}

/**
 * Wrapped native picker. On Android the picker is a system dialog that dismisses
 * itself after selection. On iOS we render an inline spinner inside a bottom
 * sheet with Done/Cancel buttons so the user has explicit control.
 */
function NativePicker({
  initial,
  minDate,
  onDismiss,
  onSelect,
}: {
  initial: Date;
  minDate?: Date;
  onDismiss: () => void;
  onSelect: (d: Date) => void;
}) {
  // Lazy require so web bundles never load the native module.
  const DateTimePicker = require("@react-native-community/datetimepicker").default;
  const [temp, setTemp] = useState<Date>(initial);

  if (Platform.OS === "android") {
    return (
      <DateTimePicker
        value={initial}
        mode="date"
        display="default"
        minimumDate={minDate}
        onChange={(event: any, d?: Date) => {
          if (event?.type === "dismissed") {
            onDismiss();
            return;
          }
          if (d) onSelect(d);
          else onDismiss();
        }}
      />
    );
  }

  // iOS: bottom sheet with spinner + explicit Done button.
  return (
    <View style={styles.iosBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <View style={styles.iosSheet}>
        <View style={styles.iosBar}>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Text style={styles.iosBarBtn}>Cancel</Text>
          </Pressable>
          <Text style={styles.iosBarTitle}>Select date</Text>
          <Pressable onPress={() => onSelect(temp)} hitSlop={8}>
            <Text style={[styles.iosBarBtn, { fontWeight: "800", color: colors.primary }]}>Done</Text>
          </Pressable>
        </View>
        <DateTimePicker
          value={temp}
          mode="date"
          display="spinner"
          minimumDate={minDate}
          onChange={(_: any, d?: Date) => d && setTemp(d)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
  },
  value: {
    flex: 1,
    fontSize: 14,
    color: colors.textMain,
  },
  iosBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  iosSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  iosBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iosBarBtn: {
    fontSize: 15,
    color: colors.textMain,
    fontWeight: "600",
  },
  iosBarTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
  },
});
