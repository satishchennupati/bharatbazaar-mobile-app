/**
 * Product tile "+ / stepper" button.
 *
 * - When qty === 0: circular + button
 * - When qty >  0: pill stepper with – [qty] + (the + is highlighted green)
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius } from "@/src/theme";

type Props = {
  qty: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  productId: string;
  compact?: boolean;
};

export function ProductAddButton({ qty, onAdd, onIncrement, onDecrement, disabled, productId, compact }: Props) {
  if (qty <= 0) {
    return (
      <Pressable
        onPress={onAdd}
        disabled={disabled}
        style={[styles.addBtn, compact && styles.addBtnCompact]}
        hitSlop={8}
        testID={`add-to-cart-${productId}`}
      >
        <Ionicons name="add" size={compact ? 20 : 22} color={colors.primary} />
      </Pressable>
    );
  }
  return (
    <View style={[styles.stepper, compact && styles.stepperCompact]}>
      <Pressable
        onPress={onDecrement}
        disabled={disabled}
        style={styles.stepperBtn}
        hitSlop={6}
        testID={`qty-dec-${productId}`}
      >
        <Ionicons name="remove" size={16} color={colors.primary} />
      </Pressable>
      <Text style={styles.qtyText} testID={`qty-val-${productId}`}>{qty}</Text>
      <Pressable
        onPress={onIncrement}
        disabled={disabled}
        style={[styles.stepperBtn, styles.stepperPlus]}
        hitSlop={6}
        testID={`qty-inc-${productId}`}
      >
        <Ionicons name="add" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

const SUCCESS = "#16A34A";

const styles = StyleSheet.create({
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnCompact: { width: 32, height: 32, borderRadius: 16 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 2,
    height: 36,
    gap: 2,
  },
  stepperCompact: { height: 32 },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  stepperPlus: {
    backgroundColor: SUCCESS,
  },
  qtyText: {
    minWidth: 22,
    textAlign: "center",
    fontWeight: "700",
    color: colors.primary,
    fontSize: 14,
  },
});
