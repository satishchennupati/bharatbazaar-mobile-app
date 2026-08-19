/**
 * Admin Offers — Phase 4
 * Tabs: Banners / Coupons / Category discounts
 * CRUD with inline edit modal, per-type dynamic fields.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";
import { SearchablePicker, type PickerItem } from "@/src/components/searchable-picker";
import { DateField } from "@/src/components/date-field";

type OfferType = "banner" | "coupon" | "category_discount" | "promo_strip";

type Offer = {
  id: string;
  type: OfferType;
  title: string;
  description?: string;
  active: boolean;
  priority?: number;

  banner_image_url?: string;
  banner_bg_color?: string;
  banner_text_color?: string;
  cta_label?: string;
  cta_target?: string;

  // promo_strip
  promo_headline?: string;
  promo_amount?: string;
  promo_sub?: string;

  coupon_code?: string;
  discount_type?: "percent" | "fixed";
  discount_value?: number;
  min_order_lek?: number;
  max_discount_lek?: number;
  usage_limit?: number | null;
  usage_count?: number;
  per_user_limit?: number | null;

  category_slug?: string;
  cat_discount_percent?: number;

  starts_at?: string;
  ends_at?: string;
};

type Category = { slug: string; name: string; emoji?: string };

const TABS: { key: OfferType; label: string; icon: any }[] = [
  { key: "banner", label: "Banners", icon: "images-outline" },
  { key: "promo_strip", label: "Promo strip", icon: "megaphone-outline" },
  { key: "coupon", label: "Coupons", icon: "pricetag-outline" },
  { key: "category_discount", label: "Category %", icon: "layers-outline" },
];

const PRESET_COLORS = ["#FF5722", "#0F9D58", "#4285F4", "#DB4437", "#8E24AA", "#00897B", "#F9A825", "#171717"];

function confirmAction(msg: string, onOk: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(msg)) onOk();
  } else {
    Alert.alert("Confirm", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "OK", onPress: onOk, style: "destructive" },
    ]);
  }
}

export default function AdminOffers() {
  const [tab, setTab] = useState<OfferType>("banner");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Partial<Offer> | null>(null);

  const load = useCallback(async () => {
    try {
      const [or, cr] = await Promise.all([
        api.get<{ offers: Offer[]; count: number }>(`/admin/offers?type=${tab}`, true),
        api.get<{ categories: Category[] }>("/admin/categories", true).catch(() => ({ categories: [] as Category[] })),
      ]);
      setOffers(or.offers || []);
      setCategories(cr.categories || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onCreate = () => {
    const base: Partial<Offer> = {
      type: tab,
      title: "",
      description: "",
      active: true,
      priority: 0,
    };
    if (tab === "banner") {
      base.banner_bg_color = "#FF5722";
      base.banner_text_color = "#FFFFFF";
      base.cta_label = "Shop now";
      base.cta_target = "tab:categories";
    } else if (tab === "coupon") {
      base.coupon_code = "";
      base.discount_type = "percent";
      base.discount_value = 10;
      base.min_order_lek = 0;
    } else if (tab === "category_discount") {
      base.category_slug = categories[0]?.slug || "";
      base.cat_discount_percent = 10;
    } else if (tab === "promo_strip") {
      base.promo_headline = "Free shipping over";
      base.promo_amount = "2000 L";
      base.promo_sub = "Cash on delivery available";
    }
    setEditing(base);
  };

  const onToggle = async (o: Offer) => {
    try {
      const updated = await api.post<Offer>(`/admin/offers/${o.id}/toggle`, {}, true);
      setOffers((list) => list.map((x) => (x.id === o.id ? updated : x)));
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to toggle");
    }
  };

  const onDelete = (o: Offer) => {
    confirmAction(`Delete "${o.title}"?`, async () => {
      try {
        await api.del(`/admin/offers/${o.id}`);
        setOffers((list) => list.filter((x) => x.id !== o.id));
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Failed to delete");
      }
    });
  };

  return (
    <View style={styles.wrap} testID="admin-offers">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Offers</Text>
          <Text style={styles.pageSub}>Banners, coupon codes, and category-wide discounts</Text>
        </View>
        <Pressable onPress={onCreate} style={styles.newBtn} testID="admin-offers-new">
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabPill, active && styles.tabPillActive]}
              testID={`admin-offers-tab-${t.key}`}
            >
              <Ionicons name={t.icon} size={14} color={active ? "#fff" : colors.textMuted} />
              <Text style={[styles.tabPillText, active && { color: "#fff" }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="pricetags-outline" size={40} color={colors.textDisabled} />
              <Text style={styles.emptyTitle}>No {TABS.find((t) => t.key === tab)?.label.toLowerCase()} yet</Text>
              <Text style={styles.emptySub}>Tap {`"+ New"`} to create your first one.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <OfferCard
              offer={item}
              onEdit={() => setEditing(item)}
              onDelete={() => onDelete(item)}
              onToggle={() => onToggle(item)}
              categories={categories}
            />
          )}
        />
      )}

      <OfferEditor
        offer={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        categories={categories}
      />
    </View>
  );
}

// --------------------------------------------------------------------------
// Row card
// --------------------------------------------------------------------------
function OfferCard({
  offer,
  onEdit,
  onDelete,
  onToggle,
  categories,
}: {
  offer: Offer;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  categories: Category[];
}) {
  const catName = useMemo(
    () => categories.find((c) => c.slug === offer.category_slug)?.name || offer.category_slug,
    [categories, offer.category_slug],
  );

  return (
    <View style={styles.card} testID={`admin-offer-row-${offer.id}`}>
      {offer.type === "banner" && (
        <View style={[styles.bannerPreview, { backgroundColor: offer.banner_bg_color || colors.primary }]}>
          {offer.banner_image_url ? (
            <Image
              source={{ uri: resolveImageUrl(offer.banner_image_url) }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : null}
          <Text style={[styles.bannerTitle, { color: offer.banner_text_color || "#fff" }]} numberOfLines={2}>
            {offer.title}
          </Text>
          {offer.description ? (
            <Text style={[styles.bannerSub, { color: offer.banner_text_color || "#fff" }]} numberOfLines={2}>
              {offer.description}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{offer.title || "Untitled"}</Text>
            <View style={[styles.badge, { backgroundColor: offer.active ? colors.success : "#a3a3a3" }]}>
              <Text style={styles.badgeText}>{offer.active ? "ACTIVE" : "INACTIVE"}</Text>
            </View>
          </View>

          {offer.type === "coupon" && (
            <View style={styles.metaGrid}>
              <MetaChip icon="pricetag" text={offer.coupon_code || "—"} strong />
              <MetaChip
                icon="cash"
                text={
                  offer.discount_type === "percent"
                    ? `${offer.discount_value ?? 0}% off`
                    : `${offer.discount_value ?? 0} L off`
                }
              />
              {offer.min_order_lek ? <MetaChip icon="basket" text={`Min ${offer.min_order_lek} L`} /> : null}
              {offer.max_discount_lek ? <MetaChip icon="trending-down" text={`Cap ${offer.max_discount_lek} L`} /> : null}
              <MetaChip
                icon="stats-chart"
                text={`Used ${offer.usage_count ?? 0}${offer.usage_limit ? `/${offer.usage_limit}` : ""}`}
              />
            </View>
          )}

          {offer.type === "category_discount" && (
            <View style={styles.metaGrid}>
              <MetaChip icon="layers" text={catName || "—"} strong />
              <MetaChip icon="pricetag" text={`${offer.cat_discount_percent ?? 0}% off`} />
            </View>
          )}

          {offer.type === "banner" && (
            <View style={styles.metaGrid}>
              {offer.cta_label ? <MetaChip icon="arrow-forward" text={offer.cta_label} /> : null}
              {offer.cta_target ? <MetaChip icon="link" text={offer.cta_target} /> : null}
            </View>
          )}

          {offer.type === "promo_strip" && (
            <View style={styles.metaGrid}>
              {offer.promo_headline ? <MetaChip icon="chatbubble-ellipses" text={offer.promo_headline} strong /> : null}
              {offer.promo_amount ? <MetaChip icon="cash" text={offer.promo_amount} /> : null}
              {offer.promo_sub ? <MetaChip icon="information-circle" text={offer.promo_sub} /> : null}
            </View>
          )}
        </View>

        <View style={styles.actionsCol}>
          <Switch
            value={offer.active}
            onValueChange={onToggle}
            thumbColor="#fff"
            trackColor={{ false: "#ddd", true: colors.primary }}
            testID={`admin-offer-toggle-${offer.id}`}
          />
          <Pressable onPress={onEdit} style={styles.iconBtn} testID={`admin-offer-edit-${offer.id}`}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
          </Pressable>
          <Pressable onPress={onDelete} style={styles.iconBtn} testID={`admin-offer-delete-${offer.id}`}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MetaChip({ icon, text, strong }: { icon: any; text: string; strong?: boolean }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={11} color={strong ? colors.primary : colors.textMuted} />
      <Text style={[styles.chipText, strong && { color: colors.primary, fontWeight: "700" }]}>{text}</Text>
    </View>
  );
}

// --------------------------------------------------------------------------
// Modal editor
// --------------------------------------------------------------------------
function OfferEditor({
  offer,
  onClose,
  onSaved,
  categories,
}: {
  offer: Partial<Offer> | null;
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
}) {
  const [draft, setDraft] = useState<Partial<Offer>>({});
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  useEffect(() => {
    if (offer) {
      setDraft({ ...offer });
      setImageDataUrl(null);
    }
  }, [offer]);

  if (!offer) return null;
  const isEdit = !!offer.id;
  const type = draft.type || offer.type || "banner";

  const set = (patch: Partial<Offer>) => setDraft((d) => ({ ...d, ...patch }));

  const onPickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Please grant photo library access");
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.7,
        allowsEditing: true,
        aspect: [16, 9],
      });
      if (!r.canceled && r.assets[0]) {
        const a = r.assets[0];
        const mime = a.mimeType || (a.uri?.match(/\.(png|jpg|jpeg|webp|gif)$/i) ? `image/${a.uri.split(".").pop()}` : "image/jpeg");
        setImageDataUrl(`data:${mime};base64,${a.base64}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to pick image");
    }
  };

  const validate = (): string | null => {
    if (!draft.title?.trim()) return "Title is required";
    if (type === "coupon") {
      if (!draft.coupon_code?.trim()) return "Coupon code is required";
      if (!draft.discount_value || Number(draft.discount_value) <= 0) return "Discount value must be > 0";
    }
    if (type === "category_discount") {
      if (!draft.category_slug) return "Please pick a category";
      const p = Number(draft.cat_discount_percent || 0);
      if (p <= 0 || p > 100) return "Percent must be between 1 and 100";
    }
    return null;
  };

  const onSave = async () => {
    const err = validate();
    if (err) {
      Alert.alert("Invalid input", err);
      return;
    }
    const payload: any = { ...draft, type };
    if (imageDataUrl) payload.banner_image_data_url = imageDataUrl;

    // Clean stringy numbers
    ["priority", "discount_value", "min_order_lek", "max_discount_lek",
     "usage_limit", "per_user_limit", "cat_discount_percent"].forEach((k) => {
      if (payload[k] === "" || payload[k] === null || payload[k] === undefined) delete payload[k];
      else payload[k] = Number(payload[k]);
    });
    if (payload.usage_limit === 0) payload.usage_limit = null;
    if (payload.per_user_limit === 0) payload.per_user_limit = null;

    setSaving(true);
    try {
      if (isEdit && offer.id) {
        await api.patch(`/admin/offers/${offer.id}`, payload);
      } else {
        await api.post("/admin/offers", payload, true);
      }
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const categoryItems: PickerItem[] = categories.map((c) => ({ key: c.slug, label: c.name, sublabel: c.slug }));

  const previewImgSrc = imageDataUrl || (draft.banner_image_url ? resolveImageUrl(draft.banner_image_url) : null);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{isEdit ? "Edit offer" : "New offer"}</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="admin-offer-close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
            {/* Type selector (only new) */}
            {!isEdit && (
              <View style={styles.typeRow}>
                {TABS.map((t) => {
                  const active = t.key === type;
                  return (
                    <Pressable
                      key={t.key}
                      style={[styles.typeChip, active && styles.typeChipActive]}
                      onPress={() => set({ type: t.key })}
                      testID={`admin-offer-type-${t.key}`}
                    >
                      <Ionicons name={t.icon} size={14} color={active ? "#fff" : colors.textMuted} />
                      <Text style={[styles.typeChipText, active && { color: "#fff" }]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Field label="Title *">
              <TextInput
                value={draft.title || ""}
                onChangeText={(v) => set({ title: v })}
                placeholder="Give it a catchy title"
                placeholderTextColor={colors.textDisabled}
                style={styles.input}
                testID="admin-offer-title"
              />
            </Field>

            <Field label="Description">
              <TextInput
                value={draft.description || ""}
                onChangeText={(v) => set({ description: v })}
                placeholder="Short description shown under the title"
                placeholderTextColor={colors.textDisabled}
                style={[styles.input, { height: 66 }]}
                multiline
              />
            </Field>

            {type === "banner" && (
              <>
                <Field label="Preview">
                  <View style={[styles.bannerPreview, { backgroundColor: draft.banner_bg_color || colors.primary, height: 140 }]}>
                    {previewImgSrc ? (
                      <Image source={{ uri: previewImgSrc }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    ) : null}
                    <View style={{ padding: 14 }}>
                      <Text style={[styles.bannerTitle, { color: draft.banner_text_color || "#fff" }]} numberOfLines={2}>
                        {draft.title || "Your banner title"}
                      </Text>
                      {draft.description ? (
                        <Text style={[styles.bannerSub, { color: draft.banner_text_color || "#fff" }]} numberOfLines={2}>
                          {draft.description}
                        </Text>
                      ) : null}
                      {draft.cta_label ? (
                        <View style={styles.previewCta}>
                          <Text style={{ color: draft.banner_bg_color || colors.primary, fontWeight: "700", fontSize: 12 }}>
                            {draft.cta_label}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Field>

                <Pressable onPress={onPickImage} style={styles.imagePickBtn} testID="admin-offer-pick-image">
                  <Ionicons name="image-outline" size={16} color={colors.primary} />
                  <Text style={styles.imagePickText}>{previewImgSrc ? "Change image" : "Upload background image (optional)"}</Text>
                </Pressable>

                <Field label="Background color">
                  <View style={styles.colorRow}>
                    {PRESET_COLORS.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => set({ banner_bg_color: c })}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: c },
                          draft.banner_bg_color === c && { borderColor: colors.textMain, borderWidth: 3 },
                        ]}
                      />
                    ))}
                  </View>
                </Field>

                <Field label="Text color">
                  <View style={styles.colorRow}>
                    {["#FFFFFF", "#171717"].map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => set({ banner_text_color: c })}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: c, borderWidth: 1, borderColor: colors.border },
                          draft.banner_text_color === c && { borderColor: colors.primary, borderWidth: 3 },
                        ]}
                      />
                    ))}
                  </View>
                </Field>

                <View style={styles.rowFields}>
                  <Field label="CTA label" style={{ flex: 1 }}>
                    <TextInput
                      value={draft.cta_label || ""}
                      onChangeText={(v) => set({ cta_label: v })}
                      placeholder="Shop now"
                      placeholderTextColor={colors.textDisabled}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="CTA target" style={{ flex: 1 }}>
                    <TextInput
                      value={draft.cta_target || ""}
                      onChangeText={(v) => set({ cta_target: v })}
                      placeholder="tab:categories · category:snacks"
                      placeholderTextColor={colors.textDisabled}
                      style={styles.input}
                    />
                  </Field>
                </View>
                <Text style={styles.hintText}>
                  CTA target examples: <Text style={{ fontWeight: "700" }}>tab:categories</Text>,{" "}
                  <Text style={{ fontWeight: "700" }}>category:snacks</Text>,{" "}
                  <Text style={{ fontWeight: "700" }}>product:p-abc</Text>,{" "}
                  <Text style={{ fontWeight: "700" }}>url:https://...</Text>
                </Text>
              </>
            )}

            {type === "coupon" && (
              <>
                <View style={styles.rowFields}>
                  <Field label="Coupon code *" style={{ flex: 1 }}>
                    <TextInput
                      value={draft.coupon_code || ""}
                      onChangeText={(v) => set({ coupon_code: v.toUpperCase() })}
                      autoCapitalize="characters"
                      placeholder="WELCOME10"
                      placeholderTextColor={colors.textDisabled}
                      style={[styles.input, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontWeight: "700" }]}
                      testID="admin-offer-code"
                    />
                  </Field>
                  <Field label="Type" style={{ width: 120 }}>
                    <Pressable
                      style={styles.segment}
                      onPress={() =>
                        set({
                          discount_type: draft.discount_type === "percent" ? "fixed" : "percent",
                        })
                      }
                    >
                      <Text style={styles.segmentText}>{draft.discount_type === "fixed" ? "L (fixed)" : "% (percent)"}</Text>
                      <Ionicons name="swap-horizontal" size={14} color={colors.textMuted} />
                    </Pressable>
                  </Field>
                </View>

                <View style={styles.rowFields}>
                  <Field label={`Discount value ${draft.discount_type === "fixed" ? "(L)" : "(%)"} *`} style={{ flex: 1 }}>
                    <TextInput
                      value={String(draft.discount_value ?? "")}
                      onChangeText={(v) => set({ discount_value: v === "" ? undefined : Number(v) })}
                      keyboardType="numeric"
                      style={styles.input}
                      testID="admin-offer-value"
                    />
                  </Field>
                  <Field label="Min order (L)" style={{ flex: 1 }}>
                    <TextInput
                      value={String(draft.min_order_lek ?? "")}
                      onChangeText={(v) => set({ min_order_lek: v === "" ? undefined : Number(v) })}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.textDisabled}
                      style={styles.input}
                    />
                  </Field>
                </View>

                <View style={styles.rowFields}>
                  <Field label="Max discount cap (L)" style={{ flex: 1 }}>
                    <TextInput
                      value={draft.max_discount_lek == null ? "" : String(draft.max_discount_lek)}
                      onChangeText={(v) => set({ max_discount_lek: v === "" ? undefined : Number(v) })}
                      keyboardType="numeric"
                      placeholder="No cap"
                      placeholderTextColor={colors.textDisabled}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="Usage limit total" style={{ flex: 1 }}>
                    <TextInput
                      value={draft.usage_limit == null ? "" : String(draft.usage_limit)}
                      onChangeText={(v) => set({ usage_limit: v === "" ? null : Number(v) })}
                      keyboardType="numeric"
                      placeholder="Unlimited"
                      placeholderTextColor={colors.textDisabled}
                      style={styles.input}
                    />
                  </Field>
                </View>

                <Field label="Per-user limit">
                  <TextInput
                    value={draft.per_user_limit == null ? "" : String(draft.per_user_limit)}
                    onChangeText={(v) => set({ per_user_limit: v === "" ? null : Number(v) })}
                    keyboardType="numeric"
                    placeholder="Unlimited"
                    placeholderTextColor={colors.textDisabled}
                    style={styles.input}
                  />
                </Field>
              </>
            )}

            {type === "category_discount" && (
              <>
                <Field label="Category *">
                  <Pressable style={styles.selectBtn} onPress={() => setShowCatPicker(true)} testID="admin-offer-cat">
                    <Text style={{ color: draft.category_slug ? colors.textMain : colors.textDisabled }}>
                      {categories.find((c) => c.slug === draft.category_slug)?.name || "Pick category"}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </Pressable>
                </Field>

                <Field label="Discount % *">
                  <TextInput
                    value={String(draft.cat_discount_percent ?? "")}
                    onChangeText={(v) => set({ cat_discount_percent: v === "" ? undefined : Number(v) })}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={colors.textDisabled}
                    style={styles.input}
                    testID="admin-offer-cat-pct"
                  />
                </Field>
              </>
            )}

            {type === "promo_strip" && (
              <>
                <Field label="Preview">
                  <View style={styles.promoPreview}>
                    <View style={styles.promoIcon}>
                      <Ionicons name="rocket" size={22} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promoHeadline} numberOfLines={1}>
                        <Text style={{ fontWeight: "800" }}>
                          {draft.promo_headline || "Free shipping"}
                        </Text>
                        {draft.promo_amount ? (
                          <Text style={styles.promoAmount}>{`  ${draft.promo_amount}`}</Text>
                        ) : null}
                      </Text>
                      {draft.promo_sub ? (
                        <Text style={styles.promoSub} numberOfLines={2}>
                          {draft.promo_sub}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Field>
                <Field label="Headline">
                  <TextInput
                    value={draft.promo_headline || ""}
                    onChangeText={(v) => set({ promo_headline: v })}
                    placeholder="Free shipping over"
                    placeholderTextColor={colors.textDisabled}
                    style={styles.input}
                    testID="admin-offer-promo-headline"
                  />
                </Field>
                <Field label="Amount / highlight">
                  <TextInput
                    value={draft.promo_amount || ""}
                    onChangeText={(v) => set({ promo_amount: v })}
                    placeholder="2000 L"
                    placeholderTextColor={colors.textDisabled}
                    style={styles.input}
                    testID="admin-offer-promo-amount"
                  />
                </Field>
                <Field label="Subtitle">
                  <TextInput
                    value={draft.promo_sub || ""}
                    onChangeText={(v) => set({ promo_sub: v })}
                    placeholder="Cash on delivery available"
                    placeholderTextColor={colors.textDisabled}
                    style={styles.input}
                    testID="admin-offer-promo-sub"
                  />
                </Field>
                <Text style={styles.hintText}>
                  This ribbon is shown at the top of the home screen when active. Only one
                  promo strip is displayed at a time (highest priority wins).
                </Text>
              </>
            )}

            {/* Date window */}
            <View style={styles.rowFields}>
              <Field label="Starts at" style={{ flex: 1 }}>
                <DateField
                  value={draft.starts_at || ""}
                  onChange={(v) => set({ starts_at: v })}
                  placeholder="Pick start date"
                  testID="admin-offer-starts-at"
                />
              </Field>
              <Field label="Ends at" style={{ flex: 1 }}>
                <DateField
                  value={draft.ends_at || ""}
                  onChange={(v) => set({ ends_at: v })}
                  placeholder="Pick end date"
                  minDate={draft.starts_at ? new Date(String(draft.starts_at).slice(0, 10)) : undefined}
                  testID="admin-offer-ends-at"
                />
              </Field>
            </View>

            <View style={styles.rowFields}>
              <Field label="Priority (higher = shown first)" style={{ flex: 1 }}>
                <TextInput
                  value={String(draft.priority ?? "")}
                  onChangeText={(v) => set({ priority: v === "" ? undefined : Number(v) })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textDisabled}
                  style={styles.input}
                />
              </Field>
              <Field label="Active" style={{ width: 120, alignItems: "flex-start" }}>
                <Switch
                  value={draft.active ?? true}
                  onValueChange={(v) => set({ active: v })}
                  thumbColor="#fff"
                  trackColor={{ false: "#ddd", true: colors.primary }}
                />
              </Field>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable onPress={onClose} style={[styles.footerBtn, styles.footerBtnGhost]}>
              <Text style={styles.footerBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.footerBtn} disabled={saving} testID="admin-offer-save">
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={styles.footerBtnText}>{isEdit ? "Save changes" : "Create offer"}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <SearchablePicker
        visible={showCatPicker}
        title="Pick category"
        items={categoryItems}
        selectedKey={draft.category_slug}
        onSelect={(item) => {
          set({ category_slug: item.key });
          setShowCatPicker(false);
        }}
        onClose={() => setShowCatPicker(false)}
      />
    </Modal>
  );
}

function Field({ label, children, style }: { label: string; children: any; style?: any }) {
  return (
    <View style={style}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// --------------------------------------------------------------------------
// Styles
// --------------------------------------------------------------------------
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingBottom: 0,
  },
  pageTitle: { fontSize: 22, fontWeight: "800", color: colors.textMain },
  pageSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  newBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  tabsRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingTop: 12, flexWrap: "wrap" },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabPillText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  bannerPreview: {
    minHeight: 90,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
  },
  bannerTitle: { fontSize: 16, fontWeight: "800" },
  bannerSub: { fontSize: 12, marginTop: 2, opacity: 0.9 },
  previewCta: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },

  cardBody: { flexDirection: "row", padding: spacing.md, gap: spacing.md, alignItems: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.textMain, flex: 1 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  chipText: { fontSize: 11, color: colors.textMuted },

  actionsCol: { alignItems: "center", gap: 8 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },

  emptyBox: {
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.xl,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.textMain, marginTop: 8 },
  emptySub: { fontSize: 12, color: colors.textMuted },

  // Modal
  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "92%",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: colors.textMain },

  typeRow: { flexDirection: "row", gap: 6, marginBottom: 4, flexWrap: "wrap" },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },

  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 14,
    color: colors.textMain,
    backgroundColor: colors.surface,
  },
  rowFields: { flexDirection: "row", gap: 10 },

  imagePickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryLight,
    padding: 10,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  imagePickText: { fontSize: 13, color: colors.primary, fontWeight: "700" },

  colorRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  colorSwatch: { width: 28, height: 28, borderRadius: 14 },

  segment: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  segmentText: { fontSize: 12, color: colors.textMain, fontWeight: "600" },

  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  hintText: { fontSize: 11, color: colors.textMuted, fontStyle: "italic" },

  promoPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 14,
  },
  promoIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  promoHeadline: { color: "#fff", fontSize: 14, lineHeight: 20 },
  promoAmount: {
    color: "#B26A00",
    fontSize: 13,
    fontWeight: "800",
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  promoSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 4 },

  modalFooter: {
    flexDirection: "row",
    gap: 10,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  footerBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  footerBtnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  footerBtnGhostText: { color: colors.textMain, fontSize: 14, fontWeight: "600" },
});
