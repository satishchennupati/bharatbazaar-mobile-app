/**
 * Address picker — interactive map (Leaflet + OSM tiles) + search autocomplete.
 *
 * The map is served by the backend at `/api/geo/map-picker` as a self-contained
 * HTML page. It's embedded in a `WebView` on native and an `<iframe>` on web.
 * As the user drags the map, the child page posts `{type:"map-pin", lat, lng}`
 * back to the RN side, which then calls `/api/geo/reverse-geocode` to resolve
 * the pin into a structured address.
 *
 * A "Fly to" message is sent back to the map when the user picks an
 * autocomplete suggestion, so both interactions stay in sync.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { api, resolveImageUrl } from "@/src/lib/api";
import { useApp, type SelectedAddress } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

type Prediction = { place_id: string; description: string; main_text?: string; secondary_text?: string };

const ALBANIA_CENTER = { lat: 41.3275, lng: 19.8187, zoom: 12 };
const REVERSE_DEBOUNCE_MS = 500;

// -----------------------------------------------------------------------------
// Cross-platform interactive map component
// -----------------------------------------------------------------------------
type MapProps = {
  initial: { lat: number; lng: number; zoom: number };
  onPin: (lat: number, lng: number) => void;
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
};

/** Web: use an `<iframe>` and postMessage. */
function MapPickerWeb({ initial, onPin, flyTo }: MapProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const src = resolveImageUrl(`/api/geo/map-picker?lat=${initial.lat}&lng=${initial.lng}&zoom=${initial.zoom}`) || "";

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (data && data.type === "map-pin" && typeof data.lat === "number") {
          onPin(data.lat, data.lng);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onPin]);

  useEffect(() => {
    if (!flyTo || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ type: "fly-to", lat: flyTo.lat, lng: flyTo.lng, zoom: flyTo.zoom || 15 }),
      "*",
    );
  }, [flyTo]);

  // React Native web renders unknown elements via the DOM — use string tag directly.
  const Iframe: any = "iframe";
  return (
    <Iframe
      ref={iframeRef}
      src={src}
      style={{ width: "100%", height: "100%", border: "0" }}
      allow="geolocation"
      testID="map-picker-iframe"
    />
  );
}

/** Native: use `react-native-webview`. */
function MapPickerNative({ initial, onPin, flyTo }: MapProps) {
  const webRef = useRef<WebView>(null);
  const uri = resolveImageUrl(`/api/geo/map-picker?lat=${initial.lat}&lng=${initial.lng}&zoom=${initial.zoom}`) || "";

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data);
        if (data.type === "map-pin" && typeof data.lat === "number") {
          onPin(data.lat, data.lng);
        }
      } catch {
        /* ignore */
      }
    },
    [onPin],
  );

  useEffect(() => {
    if (!flyTo || !webRef.current) return;
    const js = `window.postMessage(${JSON.stringify(
      JSON.stringify({ type: "fly-to", lat: flyTo.lat, lng: flyTo.lng, zoom: flyTo.zoom || 15 }),
    )}, '*'); true;`;
    webRef.current.injectJavaScript(js);
  }, [flyTo]);

  return (
    <WebView
      ref={webRef}
      source={{ uri }}
      onMessage={onMessage}
      style={{ flex: 1 }}
      javaScriptEnabled
      domStorageEnabled
      testID="map-picker-webview"
    />
  );
}

const MapPicker = Platform.OS === "web" ? MapPickerWeb : MapPickerNative;

// -----------------------------------------------------------------------------
// Screen
// -----------------------------------------------------------------------------
export default function AddressPicker() {
  const router = useRouter();
  const { setSelectedAddress } = useApp();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  const suggestDebounce = useRef<any>(null);
  const reverseDebounce = useRef<any>(null);

  // ---- Autocomplete ----
  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    clearTimeout(suggestDebounce.current);
    suggestDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get<{ predictions: Prediction[] }>(
          `/geo/autocomplete?input=${encodeURIComponent(query)}`,
        );
        setSuggestions(res.predictions);
      } catch {
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(suggestDebounce.current);
  }, [query]);

  // ---- Pin drag → reverse geocode ----
  const onPin = useCallback((lat: number, lng: number) => {
    clearTimeout(reverseDebounce.current);
    reverseDebounce.current = setTimeout(async () => {
      setResolving(true);
      try {
        const details = await api.get<SelectedAddress>(`/geo/reverse-geocode?lat=${lat}&lng=${lng}`);
        setSelected(details);
      } catch {
        /* ignore */
      } finally {
        setResolving(false);
      }
    }, REVERSE_DEBOUNCE_MS);
  }, []);

  const onPickSuggestion = async (p: Prediction) => {
    setSearchLoading(true);
    setSuggestions([]);
    try {
      const details = await api.get<SelectedAddress>(`/geo/place-details?place_id=${p.place_id}`);
      setSelected(details);
      setQuery(details.formatted_address);
      if (details.lat && details.lng) {
        setFlyTo({ lat: details.lat, lng: details.lng, zoom: 16 });
      }
    } finally {
      setSearchLoading(false);
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

      {/* Search bar (floats over the map) */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search street, area, city..."
            placeholderTextColor={colors.textDisabled}
            style={styles.input}
            returnKeyType="search"
            testID="addr-search-input"
          />
          {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        {suggestions.length > 0 && (
          <View style={styles.suggList}>
            {suggestions.slice(0, 5).map((p) => (
              <Pressable
                key={p.place_id}
                onPress={() => onPickSuggestion(p)}
                style={styles.suggRow}
                testID={`addr-sugg-${p.place_id}`}
              >
                <Ionicons name="location-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggMain} numberOfLines={1}>
                    {p.main_text || p.description}
                  </Text>
                  {p.secondary_text && (
                    <Text style={styles.suggSub} numberOfLines={1}>
                      {p.secondary_text}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Interactive map fills the rest of the screen */}
      <View style={styles.mapArea} testID="map-picker-area">
        <MapPicker initial={ALBANIA_CENTER} onPin={onPin} flyTo={flyTo} />
      </View>

      {/* Bottom sheet with resolved address + confirm */}
      <View style={styles.bottomSheet}>
        {resolving ? (
          <View style={styles.resolvingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.resolvingText}>Resolving address…</Text>
          </View>
        ) : selected ? (
          <>
            <View style={styles.addrRow}>
              <Ionicons name="location" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.selAddr} numberOfLines={2}>
                  {selected.formatted_address}
                </Text>
                <Text style={styles.selMeta} numberOfLines={1}>
                  {[selected.city, selected.state, selected.country]
                    .filter(Boolean)
                    .join(" · ") || selected.country_code}
                </Text>
              </View>
            </View>
            {!isServiceable && (
              <View style={styles.errorBox} testID="addr-unserviceable">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>
                  {selected.unserviceable_reason ||
                    "This address is not serviceable — we currently deliver only within Albania."}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.hintRow}>
            <Ionicons name="hand-left-outline" size={18} color={colors.textMuted} />
            <Text style={styles.hintText}>Drag the map to place the pin, or search above</Text>
          </View>
        )}
        <Pressable
          onPress={onConfirm}
          disabled={!isServiceable}
          style={[styles.cta, !isServiceable && styles.ctaDisabled]}
          testID="addr-confirm-btn"
        >
          <Text style={styles.ctaText}>{isServiceable ? "Use this address" : "Not serviceable"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.base,
    gap: 8,
    zIndex: 10,
    backgroundColor: colors.background,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.textMain },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    zIndex: 10,
    backgroundColor: colors.background,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.textMain },
  suggList: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  suggRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggMain: { fontSize: 14, fontWeight: "600", color: colors.textMain },
  suggSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  mapArea: { flex: 1, backgroundColor: colors.surfaceMuted },
  bottomSheet: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  resolvingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  resolvingText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hintText: { flex: 1, fontSize: 12, color: colors.textMuted },
  addrRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  selAddr: { fontSize: 14, fontWeight: "700", color: colors.textMain, lineHeight: 20 },
  selMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  errorBox: {
    flexDirection: "row",
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FEE2E2",
    alignItems: "flex-start",
  },
  errorText: { flex: 1, color: colors.error, fontSize: 12, fontWeight: "600", lineHeight: 16 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: "center",
  },
  ctaDisabled: { backgroundColor: colors.textDisabled },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
