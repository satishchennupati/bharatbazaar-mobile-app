/**
 * Admin Order detail — full order info + status transitions + delivery-person
 * assignment + admin notes.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { formatWeight, mapsUrlForAddress, orderWeightGrams } from "@/src/lib/order";
import { colors, radius, spacing } from "@/src/theme";

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  placed: { label: "Placed", color: "#B26A00", bg: "#FFF8E1", icon: "receipt" },
  confirmed: { label: "Confirmed", color: "#1565C0", bg: "#E3F2FD", icon: "checkmark-circle" },
  packed: { label: "Packed", color: "#6A1B9A", bg: "#F3E5F5", icon: "cube" },
  out_for_delivery: { label: "Out for delivery", color: "#EF6C00", bg: "#FFF3E0", icon: "bicycle" },
  delivered: { label: "Delivered", color: "#2E7D32", bg: "#E8F5E9", icon: "checkmark-done-circle" },
  cancelled: { label: "Cancelled", color: "#C62828", bg: "#FFEBEE", icon: "close-circle" },
};
const FLOW: string[] = ["placed", "confirmed", "packed", "out_for_delivery", "delivered"];

function fmtLek(n?: number) {
  return `${Math.round(n || 0).toLocaleString()} L`;
}
function fmtDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Web/native-safe confirm helper.
function confirmAction(msg: string, onOk: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(msg)) onOk();
  } else {
    Alert.alert("Confirm", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "OK", onPress: onOk },
    ]);
  }
}

export default function AdminOrderDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [dpName, setDpName] = useState("");
  const [dpPhone, setDpPhone] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const o = await api.get<any>(`/admin/orders/${id}`, true);
      setOrder(o);
      setNote(o.admin_note || "");
      setDpName(o.delivery_person_name || "");
      setDpPhone(o.delivery_person_phone || "");
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (body: any) => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.patch<any>(`/admin/orders/${id}`, body, true);
      setOrder(updated);
    } finally {
      setSaving(false);
    }
  };

  const advance = () => {
    if (!order) return;
    const idx = FLOW.indexOf(order.status);
    if (idx < 0 || idx >= FLOW.length - 1) return;
    const next = FLOW[idx + 1];
    confirmAction(`Move order to "${STATUS_META[next].label}"?`, () => patch({ status: next }));
  };
  const cancel = () => {
    confirmAction("Cancel this order? This cannot be undone.", () => patch({ status: "cancelled" }));
  };
  const setStatus = (s: string) => {
    confirmAction(`Change status to "${STATUS_META[s].label}"?`, () => patch({ status: s }));
  };

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const meta = STATUS_META[order.status] || STATUS_META.placed;
  const isFinal = order.status === "delivered" || order.status === "cancelled";
  const idx = FLOW.indexOf(order.status);
  const nextStatus = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.wrap}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="od-back">
          <Ionicons name="chevron-back" size={22} color={colors.textMain} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderId}>#{order.id}</Text>
          <Text style={styles.orderDate}>{fmtDate(order.placed_at)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon as any} size={14} color={meta.color} />
          <Text style={{ color: meta.color, fontSize: 12, fontWeight: "800", marginLeft: 4 }}>
            {meta.label}
          </Text>
        </View>
      </View>

      {/* Status timeline / actions */}
      <View style={styles.card}>
        <Text style={styles.section}>Status</Text>
        <View style={styles.timeline}>
          {FLOW.map((s, i) => {
            const done = FLOW.indexOf(order.status) >= i && order.status !== "cancelled";
            const m = STATUS_META[s];
            return (
              <View key={s} style={styles.tlItem}>
                <View
                  style={[
                    styles.tlDot,
                    { backgroundColor: done ? m.color : colors.border, borderColor: done ? m.color : colors.border },
                  ]}
                >
                  {done && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text
                  style={[styles.tlLabel, done && { color: m.color, fontWeight: "800" }]}
                  numberOfLines={1}
                >
                  {m.label}
                </Text>
                {i < FLOW.length - 1 && (
                  <View style={[styles.tlLine, done && { backgroundColor: m.color }]} />
                )}
              </View>
            );
          })}
        </View>
        {!isFinal && (
          <View style={styles.actionRow}>
            {nextStatus && (
              <Pressable
                onPress={advance}
                disabled={saving}
                style={[styles.ctaPrimary, saving && { opacity: 0.6 }]}
                testID="od-advance"
              >
                <Ionicons name="arrow-forward-circle" size={16} color="#fff" />
                <Text style={styles.ctaPrimaryText}>Advance to {STATUS_META[nextStatus].label}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={cancel}
              disabled={saving}
              style={[styles.ctaDanger, saving && { opacity: 0.6 }]}
              testID="od-cancel"
            >
              <Ionicons name="close-circle" size={16} color={colors.error} />
              <Text style={styles.ctaDangerText}>Cancel order</Text>
            </Pressable>
          </View>
        )}
        {/* Manual status change (edge cases) */}
        <View style={styles.manualRow}>
          <Text style={styles.helper}>Or set status manually:</Text>
          <View style={styles.pillsRow}>
            {["placed", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"].map((s) => {
              if (s === order.status) return null;
              const m = STATUS_META[s];
              return (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  style={[styles.pill, { backgroundColor: m.bg }]}
                  testID={`od-set-${s}`}
                >
                  <Text style={[styles.pillText, { color: m.color }]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Customer */}
      <View style={styles.card}>
        <Text style={styles.section}>Customer</Text>
        <InfoRow icon="person" label="Name" value={order.customer_name || "—"} />
        <InfoRow icon="call" label="Phone" value={order.customer_phone || order.address?.phone || "—"} />
        {order.address?.whatsapp ? <InfoRow icon="logo-whatsapp" label="WhatsApp" value={order.address.whatsapp} /> : null}
      </View>

      {/* Address */}
      <View style={styles.card}>
        <Text style={styles.section}>Delivery address</Text>
        <Text style={styles.addrLine}>{order.address?.line1}</Text>
        {order.address?.area ? <Text style={styles.addrLine}>Area: {order.address.area}</Text> : null}
        {order.address?.landmark ? <Text style={styles.addrLine}>Landmark: {order.address.landmark}</Text> : null}
        <Text style={styles.addrLine}>
          {[order.address?.city, order.address?.state, order.address?.postal_code].filter(Boolean).join(", ")}
        </Text>
        <Text style={styles.addrLine}>{order.address?.country || "Albania"}</Text>
        <Pressable
          onPress={() => Linking.openURL(mapsUrlForAddress(order.address))}
          style={styles.mapsBtn}
          testID="od-maps"
        >
          <Ionicons name="map" size={16} color="#fff" />
          <Text style={styles.mapsBtnText}>Open in Google Maps</Text>
        </Pressable>
        {order.note ? (
          <View style={styles.noteBox}>
            <Ionicons name="chatbubble-ellipses" size={14} color={colors.textMuted} />
            <Text style={styles.noteText}>Customer note: {order.note}</Text>
          </View>
        ) : null}
      </View>

      {/* Items */}
      <View style={styles.card}>
        <Text style={styles.section}>Items ({order.items?.length || 0})</Text>
        {(order.items || []).map((it: any, i: number) => (
          <View key={it.product_id || i} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
              <Text style={styles.itemMeta}>{it.qty} × {fmtLek(it.price_lek)} · {it.unit || ""}</Text>
            </View>
            <Text style={styles.itemLine}>{fmtLek(it.line_lek)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <TotalRow label="Total weight" value={formatWeight(orderWeightGrams(order))} />
        <TotalRow label="Subtotal" value={fmtLek(order.subtotal_lek)} />
        <TotalRow label="Delivery fee" value={order.delivery_fee_lek === 0 ? "Free" : fmtLek(order.delivery_fee_lek)} />
        <TotalRow label="Total" value={fmtLek(order.total_lek)} bold />
      </View>

      {/* Delivery person */}
      <View style={styles.card}>
        <Text style={styles.section}>Delivery person</Text>
        <TextInput
          value={dpName}
          onChangeText={setDpName}
          placeholder="Name"
          placeholderTextColor={colors.textDisabled}
          style={styles.input}
          testID="od-dp-name"
        />
        <TextInput
          value={dpPhone}
          onChangeText={setDpPhone}
          placeholder="Phone"
          placeholderTextColor={colors.textDisabled}
          keyboardType="phone-pad"
          style={styles.input}
          testID="od-dp-phone"
        />
        <Pressable
          onPress={() => patch({ delivery_person_name: dpName, delivery_person_phone: dpPhone })}
          disabled={saving}
          style={[styles.ctaSecondary, saving && { opacity: 0.6 }]}
          testID="od-dp-save"
        >
          <Ionicons name="bicycle" size={16} color={colors.primary} />
          <Text style={styles.ctaSecondaryText}>Save delivery person</Text>
        </Pressable>
      </View>

      {/* Admin note */}
      <View style={styles.card}>
        <Text style={styles.section}>Internal note</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add an internal note visible only to admins…"
          placeholderTextColor={colors.textDisabled}
          multiline
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          testID="od-note"
        />
        <Pressable
          onPress={() => patch({ admin_note: note })}
          disabled={saving}
          style={[styles.ctaSecondary, saving && { opacity: 0.6 }]}
          testID="od-note-save"
        >
          <Ionicons name="save" size={16} color={colors.primary} />
          <Text style={styles.ctaSecondaryText}>Save note</Text>
        </Pressable>
      </View>

      {/* History */}
      {order.status_history?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.section}>Status history</Text>
          {(order.status_history || []).map((h: any, i: number) => {
            const m = STATUS_META[h.status] || STATUS_META.placed;
            return (
              <View key={i} style={styles.histRow}>
                <View style={[styles.histDot, { backgroundColor: m.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.histLabel}>{m.label}</Text>
                  <Text style={styles.histAt}>{fmtDate(h.at)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}
function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, bold && { color: colors.textMain, fontWeight: "800", fontSize: 15 }]}>{label}</Text>
      <Text style={[styles.totalValue, bold && { fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  wrap: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  orderId: { fontSize: 18, fontWeight: "800", color: colors.textMain },
  orderDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, gap: 8,
  },
  section: { fontSize: 14, fontWeight: "800", color: colors.textMain, marginBottom: 4 },
  timeline: { flexDirection: "row", alignItems: "center" },
  tlItem: { flex: 1, alignItems: "center", gap: 4, position: "relative" },
  tlDot: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: "center", justifyContent: "center", zIndex: 2,
  },
  tlLabel: { fontSize: 9, color: colors.textMuted, textAlign: "center" },
  tlLine: { position: "absolute", top: 10, right: -50, width: 100, height: 2, backgroundColor: colors.border, zIndex: 1 },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 },
  ctaPrimary: {
    flex: 1, flexBasis: 220, minWidth: 200,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 12,
  },
  ctaPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ctaDanger: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 12,
  },
  ctaDangerText: { color: colors.error, fontWeight: "700", fontSize: 13 },
  ctaSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12,
    backgroundColor: colors.primaryLight, marginTop: 4,
  },
  ctaSecondaryText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  manualRow: { marginTop: 10, gap: 6 },
  helper: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: "700" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  infoValue: { fontSize: 13, color: colors.textMain, fontWeight: "600", flex: 1 },
  addrLine: { fontSize: 13, color: colors.textMain, lineHeight: 18 },
  mapsBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 11, marginTop: 10,
  },
  mapsBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  noteBox: { flexDirection: "row", gap: 6, backgroundColor: colors.surfaceMuted, padding: 8, borderRadius: 8, marginTop: 6 },
  noteText: { flex: 1, fontSize: 12, color: colors.textMain },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border,
  },
  itemName: { fontSize: 13, fontWeight: "700", color: colors.textMain },
  itemMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  itemLine: { fontSize: 13, fontWeight: "800", color: colors.textMain },
  divider: { height: 2, backgroundColor: colors.border, marginVertical: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 12, color: colors.textMuted },
  totalValue: { fontSize: 13, fontWeight: "700", color: colors.textMain },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 14, color: colors.textMain, marginTop: 6,
  },
  histRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  histDot: { width: 8, height: 8, borderRadius: 4 },
  histLabel: { fontSize: 13, fontWeight: "700", color: colors.textMain },
  histAt: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
