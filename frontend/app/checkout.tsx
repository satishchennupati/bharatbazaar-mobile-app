/**
 * Checkout: pick/enter address, COD only, place order.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api, type Cart } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

const FREE_MIN_LEK = 1500;
const DELIVERY_FEE_LEK = 99;
const LEK_PER_EUR = 100;

export default function Checkout() {
  const router = useRouter();
  const { t, currency, user, setCartCount, refreshUser } = useApp();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("Tirana");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("Albania");
  const [phone, setPhone] = useState(user?.phone || "");
  const [note, setNote] = useState("");

  useEffect(() => {
    const saved = user?.addresses?.[0];
    if (saved) {
      setLine1(saved.line1 || "");
      setLine2(saved.line2 || "");
      setCity(saved.city || "Tirana");
      setPostal(saved.postal_code || "");
      setCountry(saved.country || "Albania");
      setPhone(saved.phone || user?.phone || "");
    }
    api
      .get<Cart>("/cart", true)
      .then(setCart)
      .finally(() => setLoading(false));
  }, [user]);

  const subLek = cart?.subtotal_lek || 0;
  const subEur = cart?.subtotal_eur || 0;
  const isFree = subLek >= FREE_MIN_LEK;
  const feeLek = isFree ? 0 : DELIVERY_FEE_LEK;
  const feeEur = isFree ? 0 : DELIVERY_FEE_LEK / LEK_PER_EUR;
  const totalLek = subLek + feeLek;
  const totalEur = subEur + feeEur;

  const placeOrder = async () => {
    setError(null);
    if (!line1.trim() || !city.trim() || !phone.trim()) {
      setError("Please fill address line, city, and phone");
      return;
    }
    setSubmitting(true);
    try {
      const order = await api.post<{ id: string; eta_minutes: number }>(
        "/orders",
        {
          address: { label: "Home", line1, line2, city, postal_code: postal, country, phone },
          note,
          currency,
        },
        true,
      );
      // also persist address on user if first time
      if (!user?.addresses || user.addresses.length === 0) {
        try {
          const addr = await api.post<any>("/me/addresses", {
            label: "Home", line1, line2, city, postal_code: postal, country, phone,
          });
          if (user) await refreshUser({ ...user, addresses: [...(user.addresses || []), addr] });
        } catch {}
      }
      setCartCount(0);
      router.replace(`/order-success?id=${order.id}&eta=${order.eta_minutes}`);
    } catch (e: any) {
      setError(e?.message || t("error_generic"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="checkout-back">
          <Ionicons name="chevron-back" size={24} color={colors.textMain} />
        </Pressable>
        <Text style={styles.title}>{t("checkout")}</Text>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180 }} bottomOffset={20}>
        <Text style={styles.section}>{t("delivery_address")}</Text>
        <Field label={t("address_line1")}>
          <TextInput value={line1} onChangeText={setLine1} style={styles.input} testID="co-line1" placeholder="Rruga e Durresit 12" placeholderTextColor={colors.textDisabled} />
        </Field>
        <Field label={t("address_line2")}>
          <TextInput value={line2} onChangeText={setLine2} style={styles.input} testID="co-line2" placeholder="Apt 4" placeholderTextColor={colors.textDisabled} />
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1.5 }}>
            <Field label={t("city")}>
              <TextInput value={city} onChangeText={setCity} style={styles.input} testID="co-city" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("postal_code")}>
              <TextInput value={postal} onChangeText={setPostal} style={styles.input} keyboardType="number-pad" testID="co-postal" />
            </Field>
          </View>
        </View>
        <Field label={t("country")}>
          <TextInput value={country} onChangeText={setCountry} style={styles.input} testID="co-country" />
        </Field>
        <Field label={t("phone")}>
          <TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" testID="co-phone" />
        </Field>
        <Field label={t("order_note")}>
          <TextInput value={note} onChangeText={setNote} style={[styles.input, { minHeight: 60 }]} multiline testID="co-note" />
        </Field>

        <Text style={[styles.section, { marginTop: spacing.lg }]}>{t("payment_method")}</Text>
        <View style={styles.payOpt} testID="co-pay-cod">
          <View style={styles.radio}>
            <View style={styles.radioDot} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.payTitle}>{t("cod")}</Text>
            <Text style={styles.paySub}>{t("cod_sub")}</Text>
          </View>
          <Ionicons name="cash-outline" size={22} color={colors.success} />
        </View>

        <View style={styles.summary}>
          <Text style={styles.section}>Order summary</Text>
          <Row label={t("subtotal")} value={formatPrice(subLek, subEur, currency)} />
          <Row label={t("delivery_fee")} value={isFree ? t("free") : formatPrice(feeLek, feeEur, currency)} valueColor={isFree ? colors.success : undefined} />
          <View style={styles.divider} />
          <Row label={t("total")} value={formatPrice(totalLek, totalEur, currency)} bold />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </KeyboardAwareScrollView>

      <View style={styles.footerBar}>
        <Pressable onPress={placeOrder} disabled={submitting} style={[styles.cta, submitting && { opacity: 0.6 }]} testID="co-place-order-btn">
          <Text style={styles.ctaText}>{submitting ? t("loading") : `${t("place_order")} · ${formatPrice(totalLek, totalEur, currency)}`}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, bold, valueColor }: { label: string; value: string; bold?: boolean; valueColor?: string }) {
  return (
    <View style={rstyles.row}>
      <Text style={[rstyles.label, bold && { color: colors.textMain, fontWeight: "700", fontSize: 16 }]}>{label}</Text>
      <Text style={[rstyles.value, bold && { fontSize: 18 }, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", padding: spacing.base, gap: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.textMain, letterSpacing: -0.3 },
  section: { fontSize: 16, fontWeight: "700", color: colors.textMain, marginBottom: spacing.md },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: colors.textMain },
  payOpt: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.lg, padding: spacing.base },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  payTitle: { fontSize: 15, fontWeight: "700", color: colors.textMain },
  paySub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  summary: { marginTop: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.base, gap: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  error: { color: colors.error, fontSize: 13, marginTop: 8 },
  footerBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

const rstyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  label: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 14, fontWeight: "600", color: colors.textMain },
});
