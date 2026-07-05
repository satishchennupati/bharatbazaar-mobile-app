/**
 * Address picker — search Google Places (Albania only), preview on Static Map,
 * validate serviceability (country must be Albania).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api, resolveImageUrl } from "@/src/lib/api";
import { useApp, type SelectedAddress } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

type Prediction = { place_id: string; description: string; main_text?: string; secondary_text?: string };

export default function AddressPicker() {
  const router = useRouter();
  const { t, setSelectedAddress } = useApp();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<{ predictions: Prediction[] }>(`/geo/autocomplete?input=${encodeURIComponent(query)}`);
        setSuggestions(res.predictions);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const onPickPrediction = async (p: Prediction) => {
    setLoading(true);
    setSuggestions([]);
    try {
      const details = await api.get<SelectedAddress>(`/geo/place-details?place_id=${p.place_id}`);
      setSelected(details);
      setQuery(details.formatted_address);
      if (details.lat && details.lng) {
        // Direct URL — backend streams the image (key stays server-side).
        setMapUrl(resolveImageUrl(`/api/geo/static-map?lat=${details.lat}&lng=${details.lng}&width=600&height=280`) || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const isServiceable = !!(selected && selected.serviceable);

  const onConfirm = () => {
    if (!selected || !isServiceable) return;
    setSelectedAddress(selected);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="addr-back">
          <Ionicons name="chevron-back" size={24} color={colors.textMain} />
        </Pressable>
        <Text style={styles.title}>Select delivery address</Text>
      </View>

      <KeyboardAwareScrollView bottomOffset={20} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search street, area, city..."
            placeholderTextColor={colors.textDisabled}
            style={styles.input}
            autoFocus
            testID="addr-search-input"
          />
          {loading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {suggestions.length > 0 && (
          <View style={styles.suggList}>
            {suggestions.map((p) => (
              <Pressable key={p.place_id} onPress={() => onPickPrediction(p)} style={styles.suggRow} testID={`addr-sugg-${p.place_id}`}>
                <Ionicons name="location-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggMain}>{p.main_text || p.description}</Text>
                  {p.secondary_text && <Text style={styles.suggSub}>{p.secondary_text}</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {selected && (
          <View style={styles.card}>
            {mapUrl && (
              <Image source={{ uri: mapUrl }} style={styles.map} resizeMode="cover" />
            )}
            <View style={{ padding: spacing.base }}>
              <Text style={styles.selAddr}>{selected.formatted_address}</Text>
              <Text style={styles.selMeta}>
                {selected.city ? `${selected.city} · ` : ""}{selected.country || selected.country_code}
              </Text>
              {!isServiceable && (
                <View style={styles.errorBox} testID="addr-unserviceable">
                  <Ionicons name="alert-circle" size={18} color={colors.error} />
                  <Text style={styles.errorText}>
                    {selected.unserviceable_reason || "This address is not serviceable — we currently deliver only within Albania."}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      {selected && (
        <View style={styles.footer}>
          <Pressable
            onPress={onConfirm}
            disabled={!isServiceable}
            style={[styles.cta, !isServiceable && styles.ctaDisabled]}
            testID="addr-confirm-btn"
          >
            <Text style={styles.ctaText}>{isServiceable ? "Use this address" : "Not serviceable"}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.base, gap: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.textMain },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: colors.textMain },
  suggList: { marginTop: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.base, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggMain: { fontSize: 14, fontWeight: "600", color: colors.textMain },
  suggSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  card: { marginTop: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden" },
  map: { width: "100%", height: 180, backgroundColor: colors.surfaceMuted },
  selAddr: { fontSize: 15, fontWeight: "600", color: colors.textMain },
  selMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  errorBox: { flexDirection: "row", gap: 6, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: "#FEE2E2", alignItems: "flex-start" },
  errorText: { flex: 1, color: colors.error, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center" },
  ctaDisabled: { backgroundColor: colors.textDisabled },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
