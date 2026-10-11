/**
 * Admin → Shipping settings.
 *
 * Lets the store owner configure the delivery pricing used at checkout:
 *  - Free-delivery thresholds per zone (Tirana City vs Rest of Albania)
 *  - Base delivery fees per zone
 *  - Free weight allowance + per-kg surcharge above it
 *
 * Reads GET /api/admin/settings/shipping, saves via PUT (admin auth).
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

type ShippingSettings = {
  free_min_tirana_lek: number;
  free_min_outside_lek: number;
  base_tirana_lek: number;
  base_outside_lek: number;
  free_weight_kg: number;
  extra_per_kg_lek: number;
};

const FIELDS: { key: keyof ShippingSettings; label: string; hint: string; unit: string }[] = [
  { key: "free_min_tirana_lek", label: "Free delivery — Tirana City", hint: "Orders at/above this get free delivery inside Tirana", unit: "L" },
  { key: "free_min_outside_lek", label: "Free delivery — Rest of Albania", hint: "Orders at/above this get free delivery outside Tirana", unit: "L" },
  { key: "base_tirana_lek", label: "Base fee — Tirana City", hint: "Delivery fee for the first few kg inside Tirana", unit: "L" },
  { key: "base_outside_lek", label: "Base fee — Rest of Albania", hint: "Delivery fee for the first few kg outside Tirana", unit: "L" },
  { key: "free_weight_kg", label: "Free weight allowance", hint: "Weight included in the base fee before surcharge", unit: "kg" },
  { key: "extra_per_kg_lek", label: "Surcharge per extra kg", hint: "Added for each kg above the free allowance", unit: "L/kg" },
];

export default function AdminShippingSettings() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerPhone, setOwnerPhone] = useState("");
  const [savingOwner, setSavingOwner] = useState(false);
  const [savedOwner, setSavedOwner] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.get<ShippingSettings>("/admin/settings/shipping", true);
      const next: Record<string, string> = {};
      FIELDS.forEach((f) => {
        next[f.key] = String(s[f.key] ?? 0);
      });
      setForm(next);
      try {
        const store = await api.get<{ owner_phone: string }>("/admin/settings/store", true);
        setOwnerPhone(store.owner_phone || "");
      } catch {}
    } catch (e: any) {
      setError(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const onSaveOwner = async () => {
    setOwnerError(null);
    const phone = ownerPhone.trim();
    if (!phone.startsWith("+") || phone.length < 8) {
      setOwnerError("Enter a full number in E.164 format, e.g. +355695808480");
      return;
    }
    setSavingOwner(true);
    try {
      const updated = await api.put<{ owner_phone: string }>("/admin/settings/store", { owner_phone: phone }, true);
      setOwnerPhone(updated.owner_phone);
      setSavedOwner(true);
    } catch (e: any) {
      setOwnerError(e?.message || "Failed to save owner number");
    } finally {
      setSavingOwner(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key: string, val: string) => {
    // Allow digits and a single decimal point.
    const clean = val.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    setForm((f) => ({ ...f, [key]: clean }));
    setSaved(false);
  };

  const onSave = async () => {
    setError(null);
    const payload: Record<string, number> = {};
    for (const f of FIELDS) {
      const n = parseFloat(form[f.key]);
      if (isNaN(n) || n < 0) {
        setError(`"${f.label}" must be a number ≥ 0`);
        return;
      }
      payload[f.key] = n;
    }
    if (payload.free_min_tirana_lek > payload.free_min_outside_lek) {
      setError("Tirana free-delivery threshold is usually ≤ the Rest-of-Albania one.");
      // not a hard block — continue saving anyway
    }
    setSaving(true);
    try {
      const updated = await api.put<ShippingSettings>("/admin/settings/shipping", payload, true) as any;
      // Backend returns the fresh settings; reflect them.
      const next: Record<string, string> = {};
      FIELDS.forEach((f) => {
        next[f.key] = String(updated[f.key] ?? payload[f.key]);
      });
      setForm(next);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled" testID="admin-shipping-settings">
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="car" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Shipping settings</Text>
            <Text style={styles.subtitle}>
              Tune free-delivery thresholds and fees. Applied automatically at checkout based on the
              delivery address.
            </Text>
          </View>
        </View>

        <Text style={styles.groupTitle}>Free delivery thresholds</Text>
        {FIELDS.slice(0, 2).map((f) => (
          <Field key={f.key} f={f} value={form[f.key]} onChange={setField} />
        ))}

        <Text style={styles.groupTitle}>Base delivery fees</Text>
        {FIELDS.slice(2, 4).map((f) => (
          <Field key={f.key} f={f} value={form[f.key]} onChange={setField} />
        ))}

        <Text style={styles.groupTitle}>Weight rule</Text>
        {FIELDS.slice(4, 6).map((f) => (
          <Field key={f.key} f={f} value={form[f.key]} onChange={setField} />
        ))}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? (
          <View style={styles.savedBanner}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.savedText}>Saved! Changes are live at checkout.</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          testID="admin-shipping-save"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveText}>Save changes</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.groupTitle, { marginTop: spacing.xl }]}>Order notifications</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Owner phone number</Text>
          <Text style={styles.hint}>Receives a &quot;NEW ORDER&quot; SMS whenever a customer places an order. Use full E.164 format.</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={ownerPhone}
              onChangeText={(v) => { setOwnerPhone(v); setSavedOwner(false); }}
              keyboardType="phone-pad"
              autoCapitalize="none"
              style={styles.input}
              placeholder="+355695808480"
              placeholderTextColor={colors.textDisabled}
              testID="admin-owner-phone-input"
            />
          </View>
        </View>
        {ownerError ? <Text style={styles.error}>{ownerError}</Text> : null}
        {savedOwner ? (
          <View style={styles.savedBanner}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.savedText}>Owner number saved! New orders will notify this number.</Text>
          </View>
        ) : null}
        <Pressable
          onPress={onSaveOwner}
          disabled={savingOwner}
          style={[styles.saveBtn, savingOwner && { opacity: 0.6 }]}
          testID="admin-owner-save"
        >
          {savingOwner ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="notifications-outline" size={18} color="#fff" />
              <Text style={styles.saveText}>Save owner number</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  f,
  value,
  onChange,
}: {
  f: { key: string; label: string; hint: string; unit: string };
  value: string;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{f.label}</Text>
      <Text style={styles.hint}>{f.hint}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(f.key, v)}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholder="0"
          placeholderTextColor={colors.textDisabled}
          testID={`admin-shipping-input-${f.key}`}
        />
        <Text style={styles.unit}>{f.unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  wrap: { padding: spacing.lg, gap: spacing.md, paddingBottom: 140, maxWidth: 640, width: "100%", alignSelf: "center" },
  hero: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.primaryLight, borderRadius: radius.xl, padding: spacing.lg,
  },
  heroIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.textMain },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  groupTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: spacing.sm },
  field: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.base,
  },
  label: { fontSize: 14, fontWeight: "700", color: colors.textMain },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 2, marginBottom: 10 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 12, backgroundColor: colors.background,
  },
  input: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.textMain, paddingVertical: 12 },
  unit: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginLeft: 8 },
  error: { color: colors.error, fontSize: 13, fontWeight: "600", textAlign: "center" },
  savedBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#E8F5E9", borderRadius: radius.md, paddingVertical: 10,
  },
  savedText: { color: colors.success, fontSize: 13, fontWeight: "700" },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 15, marginTop: spacing.sm,
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
