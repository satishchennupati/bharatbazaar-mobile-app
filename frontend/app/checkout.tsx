/**
 * Checkout: pick/enter address (Manual or Map), COD only, place order.
 * Address model: country, state (qark), city (bashkia), area (lagje),
 * landmark, phone, whatsapp (optional).
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api, type Cart } from "@/src/lib/api";
import { resolveImageUrl } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";
import { COUNTRIES, findCountryByCode, findCountryByName } from "@/src/data/countries";
import { ALBANIA_QARKS, bashkiaFor, matchQark, matchBashkia } from "@/src/data/albania-regions";
import { SearchablePicker, type PickerItem } from "@/src/components/searchable-picker";
import { DropdownField } from "@/src/components/dropdown-field";

const FREE_MIN_LEK = 2000;
const DELIVERY_FEE_LEK = 99;
const LEK_PER_EUR = 100;

type EntryMode = "manual" | "map";

export default function Checkout() {
  const router = useRouter();
  const { t, currency, user, setCartCount, refreshUser, selectedAddress } = useApp();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entryMode, setEntryMode] = useState<EntryMode>("manual");

  // Address fields
  const [countryCode, setCountryCode] = useState<string>("AL");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [landmark, setLandmark] = useState("");
  const [line1, setLine1] = useState("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [whatsapp, setWhatsapp] = useState("");
  const [note, setNote] = useState("");
  const [postal, setPostal] = useState("");

  // Picker modals
  const [openPicker, setOpenPicker] = useState<null | "country" | "state" | "city">(null);

  const country = findCountryByCode(countryCode);
  const isAlbania = countryCode === "AL";

  // Hydrate from selected map address or saved profile address
  useEffect(() => {
    if (selectedAddress) {
      setEntryMode("map");
      const c = findCountryByName(selectedAddress.country || "Albania");
      const cc = c?.code || selectedAddress.country_code || "AL";
      setCountryCode(cc);
      // Reverse-geocode auto-fill: match Albania's qark/bashkia to our lists
      // when possible, otherwise fall back to the raw Google-returned strings
      // so the user always sees something meaningful in the fields.
      if (cc === "AL") {
        const qark = matchQark(selectedAddress.state) || selectedAddress.state || "";
        setState(qark);
        const bashkia =
          matchBashkia(selectedAddress.city, matchQark(selectedAddress.state)) ||
          selectedAddress.city ||
          "";
        setCity(bashkia);
      } else {
        setState(selectedAddress.state || "");
        setCity(selectedAddress.city || "");
      }
      // Area (Lagje): Google returns sublocality/neighborhood if available;
      // otherwise the backend derives it from the formatted address.
      setArea(selectedAddress.area || "");
      // line1 (street + number) is stored for the order payload.
      setLine1(selectedAddress.line1 || selectedAddress.formatted_address || "");
      setPostal(selectedAddress.postal_code || "");
      return;
    }
    const saved = user?.addresses?.[0] as any;
    if (saved) {
      setEntryMode(saved.entry_mode === "map" ? "map" : "manual");
      const c = findCountryByName(saved.country || "Albania");
      setCountryCode(c?.code || saved.country_code || "AL");
      setState(saved.state || "");
      setCity(saved.city || "");
      setArea(saved.area || "");
      setLandmark(saved.landmark || "");
      setLine1(saved.line1 || "");
      setPostal(saved.postal_code || "");
      setPhone(saved.phone || user?.phone || "");
      setWhatsapp(saved.whatsapp || "");
    }
  }, [user, selectedAddress]);

  useEffect(() => {
    api
      .get<Cart>("/cart", true)
      .then(setCart)
      .finally(() => setLoading(false));
  }, []);

  const subLek = cart?.subtotal_lek || 0;
  const subEur = cart?.subtotal_eur || 0;
  const isFree = subLek >= FREE_MIN_LEK;
  const feeLek = isFree ? 0 : DELIVERY_FEE_LEK;
  const feeEur = isFree ? 0 : DELIVERY_FEE_LEK / LEK_PER_EUR;
  const totalLek = subLek + feeLek;
  const totalEur = subEur + feeEur;

  // Picker items
  const countryItems: PickerItem[] = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        key: c.code,
        label: c.name,
        sublabel: c.dial,
        prefix: c.flag,
      })),
    [],
  );

  const stateItems: PickerItem[] = useMemo(() => {
    if (!isAlbania) return [];
    return ALBANIA_QARKS.map((q) => ({ key: q.name, label: q.name }));
  }, [isAlbania]);

  const cityItems: PickerItem[] = useMemo(() => {
    if (!isAlbania || !state) return [];
    return bashkiaFor(state).map((b) => ({ key: b, label: b }));
  }, [isAlbania, state]);

  const placeOrder = async () => {
    setError(null);
    // Validation
    if (!country) {
      setError("Please select a country");
      return;
    }
    if (isAlbania) {
      if (!state.trim()) return setError("Please select the qark (state)");
      if (!city.trim()) return setError("Please select the bashkia (city)");
    } else {
      if (!city.trim()) return setError("Please enter the city");
    }
    if (entryMode === "manual" && !area.trim()) return setError("Please enter the area (lagje)");
    if (entryMode === "map" && !line1.trim()) return setError("Please pick an address on the map");
    if (!phone.trim()) return setError("Please enter your phone number");

    const addressPayload = {
      label: "Home",
      line1: entryMode === "map" ? line1 : [line1, landmark].filter(Boolean).join(", "),
      line2: "",
      city,
      state,
      area,
      landmark,
      postal_code: postal,
      country: country.name,
      country_code: country.code,
      phone,
      whatsapp,
      entry_mode: entryMode,
      lat: selectedAddress?.lat,
      lng: selectedAddress?.lng,
      formatted_address: selectedAddress?.formatted_address || "",
    };

    setSubmitting(true);
    try {
      const order = await api.post<{ id: string; eta_minutes: number }>(
        "/orders",
        { address: addressPayload, note, currency },
        true,
      );
      // Persist to profile (always save if it's the first address)
      if (!user?.addresses || user.addresses.length === 0) {
        try {
          const addr = await api.post<any>("/me/addresses", addressPayload);
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

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180 }}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.section}>{t("delivery_address")}</Text>

        {/* Segmented control: Manual / Map */}
        <View style={styles.segment}>
          <SegmentTab
            label={t("enter_manually")}
            icon="create-outline"
            active={entryMode === "manual"}
            onPress={() => setEntryMode("manual")}
            testID="seg-manual"
          />
          <SegmentTab
            label={t("pick_on_map")}
            icon="location-outline"
            active={entryMode === "map"}
            onPress={() => setEntryMode("map")}
            testID="seg-map"
          />
        </View>

        {entryMode === "map" && (
          <>
            <Pressable
              onPress={() => router.push("/address-picker")}
              style={styles.mapBtn}
              testID="co-open-map-picker"
            >
              <Ionicons name="location" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {selectedAddress ? "Change address on map" : "Pick address on map"}
                </Text>
                {selectedAddress?.formatted_address ? (
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }} numberOfLines={2}>
                    {selectedAddress.formatted_address}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>

            {selectedAddress?.lat && selectedAddress?.lng ? (
              <MiniMapPreview
                lat={selectedAddress.lat}
                lng={selectedAddress.lng}
                onPress={() => router.push("/address-picker")}
              />
            ) : null}
          </>
        )}

        {/* Country */}
        <DropdownField
          label={t("country")}
          value={country ? country.name : ""}
          placeholder={t("select_country")}
          prefix={country?.flag}
          onPress={() => setOpenPicker("country")}
          testID="dd-country"
        />

        {/* State / Qark */}
        {isAlbania ? (
          <DropdownField
            label={t("state")}
            value={state}
            placeholder={t("select_state")}
            onPress={() => setOpenPicker("state")}
            testID="dd-state"
          />
        ) : (
          <Field label={t("state")}>
            <TextInput
              value={state}
              onChangeText={setState}
              style={styles.input}
              placeholder="State / Region"
              placeholderTextColor={colors.textDisabled}
              testID="in-state"
            />
          </Field>
        )}

        {/* City / Bashkia */}
        {isAlbania && stateItems.length > 0 && cityItems.length > 0 ? (
          <DropdownField
            label={t("city")}
            value={city}
            placeholder={t("select_city")}
            disabled={!state}
            onPress={() => setOpenPicker("city")}
            testID="dd-city"
          />
        ) : (
          <Field label={t("city")}>
            <TextInput
              value={city}
              onChangeText={setCity}
              style={styles.input}
              placeholder="City / Bashkia"
              placeholderTextColor={colors.textDisabled}
              testID="in-city"
            />
          </Field>
        )}

        {/* Area (Lagje) */}
        <Field label={t("area")}>
          <TextInput
            value={area}
            onChangeText={setArea}
            style={styles.input}
            placeholder="e.g. Lagjja 5, Kombinat"
            placeholderTextColor={colors.textDisabled}
            testID="in-area"
          />
        </Field>

        {/* Landmark */}
        <Field label={t("landmark")}>
          <TextInput
            value={landmark}
            onChangeText={setLandmark}
            style={styles.input}
            placeholder="e.g. Pranë Farmacisë, afër shkollës"
            placeholderTextColor={colors.textDisabled}
            testID="in-landmark"
          />
        </Field>

        {/* Postal code (optional, only if the country typically uses one) */}
        <Field label={t("postal_code") + " (optional)"}>
          <TextInput
            value={postal}
            onChangeText={setPostal}
            style={styles.input}
            keyboardType="number-pad"
            placeholder="1001"
            placeholderTextColor={colors.textDisabled}
            testID="in-postal"
          />
        </Field>

        {/* Phone */}
        <Field label={t("phone")}>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            style={styles.input}
            keyboardType="phone-pad"
            placeholder={country ? `${country.dial} ...` : "+355 ..."}
            placeholderTextColor={colors.textDisabled}
            testID="in-phone"
          />
        </Field>

        {/* WhatsApp (optional) */}
        <Field label={t("whatsapp")}>
          <View style={styles.inputRow}>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            <TextInput
              value={whatsapp}
              onChangeText={setWhatsapp}
              style={styles.inputInline}
              keyboardType="phone-pad"
              placeholder="Same as phone if left empty"
              placeholderTextColor={colors.textDisabled}
              testID="in-whatsapp"
            />
          </View>
        </Field>

        <Field label={t("order_note")}>
          <TextInput
            value={note}
            onChangeText={setNote}
            style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
            multiline
            placeholder="Any delivery instructions?"
            placeholderTextColor={colors.textDisabled}
            testID="in-note"
          />
        </Field>

        <Text style={styles.helper}>
          <Ionicons name="information-circle" size={12} color={colors.textMuted} /> {t("save_address_note")}
        </Text>

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
          <Row
            label={t("delivery_fee")}
            value={isFree ? t("free") : formatPrice(feeLek, feeEur, currency)}
            valueColor={isFree ? colors.success : undefined}
          />
          <View style={styles.divider} />
          <Row label={t("total")} value={formatPrice(totalLek, totalEur, currency)} bold />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </KeyboardAwareScrollView>

      <View style={styles.footerBar}>
        <Pressable
          onPress={placeOrder}
          disabled={submitting}
          style={[styles.cta, submitting && { opacity: 0.6 }]}
          testID="co-place-order-btn"
        >
          <Text style={styles.ctaText}>
            {submitting ? t("loading") : `${t("place_order")} · ${formatPrice(totalLek, totalEur, currency)}`}
          </Text>
        </Pressable>
      </View>

      {/* Pickers */}
      <SearchablePicker
        visible={openPicker === "country"}
        title={t("select_country")}
        items={countryItems}
        selectedKey={countryCode}
        searchPlaceholder="Search countries"
        onSelect={(it) => {
          setCountryCode(it.key);
          // Reset state/city on country change
          setState("");
          setCity("");
          setOpenPicker(null);
        }}
        onClose={() => setOpenPicker(null)}
      />
      <SearchablePicker
        visible={openPicker === "state"}
        title={t("select_state")}
        items={stateItems}
        selectedKey={state}
        searchPlaceholder="Search qark"
        onSelect={(it) => {
          setState(it.key);
          setCity("");
          setOpenPicker(null);
        }}
        onClose={() => setOpenPicker(null)}
      />
      <SearchablePicker
        visible={openPicker === "city"}
        title={t("select_city")}
        items={cityItems}
        selectedKey={city}
        searchPlaceholder="Search bashkia"
        onSelect={(it) => {
          setCity(it.key);
          setOpenPicker(null);
        }}
        onClose={() => setOpenPicker(null)}
      />
    </SafeAreaView>
  );
}

function MiniMapPreview({ lat, lng, onPress }: { lat: number; lng: number; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = resolveImageUrl(`/api/geo/static-map?lat=${lat}&lng=${lng}&width=700&height=280`);

  if (failed) {
    return (
      <Pressable onPress={onPress} style={styles.miniMapFallback} testID="mini-map-fallback">
        <View style={styles.mapPinBadge}>
          <Ionicons name="location" size={24} color="#fff" />
        </View>
        <Text style={styles.mapCoord}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </Text>
        <Text style={styles.mapCoordSub}>Tap to change on map</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.miniMapWrap} testID="mini-map">
      {url ? (
        <Image
          source={{ uri: url }}
          style={styles.miniMap}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {loaded && (
        <View style={styles.miniMapOverlay} pointerEvents="none">
          <Ionicons name="expand" size={14} color="#fff" />
          <Text style={styles.miniMapOverlayText}>Change</Text>
        </View>
      )}
    </Pressable>
  );
}

function SegmentTab({
  label,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon: any;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segTab, active && styles.segTabActive]}
      testID={testID}
    >
      <Ionicons name={icon} size={16} color={active ? "#fff" : colors.primary} />
      <Text style={[styles.segTabText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
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

function Row({
  label,
  value,
  bold,
  valueColor,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={rstyles.row}>
      <Text style={[rstyles.label, bold && { color: colors.textMain, fontWeight: "700", fontSize: 16 }]}>
        {label}
      </Text>
      <Text style={[rstyles.value, bold && { fontSize: 18 }, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
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
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 14,
    color: colors.textMain,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  inputInline: { flex: 1, paddingVertical: 14, fontSize: 14, color: colors.textMain },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: spacing.md,
  },
  segTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  segTabActive: { backgroundColor: colors.primary },
  segTabText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  mapBtn: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: spacing.md,
  },
  miniMapWrap: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  miniMap: { width: "100%", height: 140 },
  miniMapOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  miniMapOverlayText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  miniMapFallback: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mapPinBadge: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  mapCoord: { fontSize: 13, fontWeight: "700", color: colors.textMain },
  mapCoordSub: { fontSize: 11, color: colors.textMuted },
  helper: { fontSize: 11, color: colors.textMuted, marginTop: 4, marginBottom: 4 },
  payOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  payTitle: { fontSize: 15, fontWeight: "700", color: colors.textMain },
  paySub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  summary: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: 4,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  error: { color: colors.error, fontSize: 13, marginTop: 8 },
  footerBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cta: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

const rstyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  label: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 14, fontWeight: "600", color: colors.textMain },
});
