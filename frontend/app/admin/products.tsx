/**
 * Admin Products — CRUD list + inline edit modal.
 * Supports create, edit, delete, stock toggle, category filter, search,
 * image upload (base64 data URL), and CSV bulk re-import.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";
import { SearchablePicker, type PickerItem } from "@/src/components/searchable-picker";

type Product = {
  id: string;
  name: string;
  description?: string;
  category_slug: string;
  price_lek: number;
  price_eur?: number;
  mrp_lek?: number | null;
  discount?: number;
  sku?: string;
  product_code?: string;
  ean_barcode?: string;
  stock: number;
  in_stock: boolean;
  weight?: string;
  weight_grams?: number;
  brand?: string;
  tags?: string[];
  image_url?: string;
  image_emoji?: string;
  unit?: string;
};
type Category = { slug: string; name: string; emoji?: string };

function fmtLek(n?: number) {
  return `${Math.round(n || 0).toLocaleString()} L`;
}
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

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "all") qs.set("category", categoryFilter);
      if (debouncedQ) qs.set("q", debouncedQ);
      qs.set("limit", "1000");
      const [pr, cr] = await Promise.all([
        api.get<{ products: Product[]; count: number }>(`/admin/products?${qs.toString()}`, true),
        api.get<{ categories: Category[] }>("/admin/categories", true),
      ]);
      setProducts(pr.products);
      setCategories(cr.categories);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryFilter, debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggleStock = async (p: Product) => {
    // Optimistic update
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, in_stock: !x.in_stock } : x)));
    try {
      await api.patch(`/admin/products/${p.id}`, { in_stock: !p.in_stock }, true);
    } catch {
      // revert on failure
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, in_stock: p.in_stock } : x)));
    }
  };

  const remove = (p: Product) => {
    confirmAction(`Delete "${p.name}"? This cannot be undone.`, async () => {
      try {
        await api.del(`/admin/products/${p.id}`, true);
        setProducts((prev) => prev.filter((x) => x.id !== p.id));
      } catch {}
    });
  };

  const openCreate = () =>
    setEditing({
      name: "",
      category_slug: categoryFilter !== "all" ? categoryFilter : categories[0]?.slug || "",
      price_lek: 0,
      stock: 0,
      in_stock: true,
    });

  const catItems: PickerItem[] = useMemo(
    () => categories.map((c) => ({ key: c.slug, label: c.name, prefix: c.emoji })),
    [categories],
  );
  const filterItems: PickerItem[] = useMemo(
    () => [{ key: "all", label: "All categories" }, ...catItems],
    [catItems],
  );
  const activeCat = categories.find((c) => c.slug === categoryFilter);

  // CSV bulk import (web only via file input)
  const onCsvImport = async (file: File, replace: boolean) => {
    setCsvBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const url = resolveImageUrl(`/api/admin/products/import-csv?replace=${replace ? "true" : "false"}`) || "";
      const tokenRaw = (globalThis as any).localStorage?.getItem("mbc_token") || "";
      const token = tokenRaw ? JSON.parse(tokenRaw) : "";
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      alert(`Imported: ${data.inserted} inserted, ${data.updated} updated`);
      await load();
    } catch (e: any) {
      alert(e?.message || "Import failed");
    } finally {
      setCsvBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  return (
    <View style={styles.wrap} testID="admin-products">
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Products</Text>
          <Text style={styles.subtitle}>
            {products.length} product{products.length === 1 ? "" : "s"}
            {activeCat ? ` · ${activeCat.name}` : ""}
          </Text>
        </View>
        <Pressable onPress={openCreate} style={styles.ctaPrimary} testID="prod-add">
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.ctaPrimaryText}>Add product</Text>
        </Pressable>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={[styles.searchBox, { width: "100%" }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search name, SKU, code, barcode…"
            placeholderTextColor={colors.textDisabled}
            style={styles.searchInput}
            testID="prod-search"
          />
        </View>
        <View style={styles.toolbarRow}>
          <Pressable onPress={() => setShowFilterPicker(true)} style={[styles.catBtn, { flex: 1 }]} testID="prod-cat-filter">
            <Ionicons name="filter" size={16} color={colors.primary} />
            <Text style={styles.catBtnText} numberOfLines={1}>
              {activeCat?.name || "All categories"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
          {Platform.OS === "web" && (
            <>
              <Pressable
                onPress={() => csvInputRef.current?.click()}
                style={styles.catBtn}
                disabled={csvBusy}
                testID="prod-csv-btn"
              >
                {csvBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="cloud-upload" size={16} color={colors.primary} />
                )}
                <Text style={styles.catBtnText}>CSV import</Text>
              </Pressable>
              {/* @ts-ignore — plain DOM node for web file picker */}
              <input
                ref={csvInputRef as any}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={(e: any) => {
                  const f = e.target.files?.[0];
                  if (f) onCsvImport(f, false);
                }}
              />
            </>
          )}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color={colors.textDisabled} />
              <Text style={styles.emptyText}>No products match this filter.</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const img = resolveImageUrl(item.image_url || undefined);
            const cat = categories.find((c) => c.slug === item.category_slug);
            return (
              <View style={styles.card} testID={`prod-row-${item.id}`}>
                <View style={styles.thumb}>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.thumbImg} />
                  ) : (
                    <Text style={{ fontSize: 26 }}>{item.image_emoji || "🛒"}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {cat?.emoji || ""} {cat?.name || item.category_slug}
                    {item.weight ? ` · ${item.weight}` : ""}
                    {item.sku ? ` · ${item.sku}` : ""}
                  </Text>
                  <View style={styles.cardStats}>
                    <Text style={styles.cardPrice}>{fmtLek(item.price_lek)}</Text>
                    <Text style={styles.cardStock}>
                      Stock: <Text style={{ color: item.stock <= 0 ? colors.error : colors.textMain, fontWeight: "700" }}>
                        {item.stock}
                      </Text>
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <View style={styles.switchRow}>
                    <Switch
                      value={item.in_stock}
                      onValueChange={() => toggleStock(item)}
                      trackColor={{ true: colors.primary, false: colors.border }}
                      thumbColor="#fff"
                    />
                    <Text style={styles.switchLabel}>{item.in_stock ? "In stock" : "Hidden"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Pressable onPress={() => setEditing(item)} style={styles.iconBtn} testID={`prod-edit-${item.id}`}>
                      <Ionicons name="create" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => remove(item)} style={styles.iconBtnDanger} testID={`prod-del-${item.id}`}>
                      <Ionicons name="trash" size={16} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Category filter picker */}
      <SearchablePicker
        visible={showFilterPicker}
        title="Filter by category"
        items={filterItems}
        selectedKey={categoryFilter}
        onSelect={(it) => {
          setCategoryFilter(it.key);
          setShowFilterPicker(false);
        }}
        onClose={() => setShowFilterPicker(false)}
      />

      {/* Edit modal */}
      {editing && (
        <EditProductModal
          product={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </View>
  );
}

// ---------- Edit modal ----------
function EditProductModal({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Partial<Product>;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product.id;
  const [form, setForm] = useState<any>({
    name: product.name || "",
    category_slug: product.category_slug || categories[0]?.slug || "",
    price_lek: String(product.price_lek ?? ""),
    mrp_lek: String(product.mrp_lek ?? ""),
    stock: String(product.stock ?? 0),
    in_stock: product.in_stock ?? true,
    weight: product.weight || "",
    brand: product.brand || "",
    description: product.description || "",
    sku: product.sku || "",
    product_code: product.product_code || "",
    ean_barcode: product.ean_barcode || "",
    unit: product.unit || "",
  });
  const [saving, setSaving] = useState(false);
  const [imgPreview, setImgPreview] = useState<string | null>(resolveImageUrl(product.image_url || undefined) || null);
  const [imgDataUrl, setImgDataUrl] = useState<string | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cat = categories.find((c) => c.slug === form.category_slug);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.75,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || "image/jpeg";
    const b64 = asset.base64 || "";
    if (!b64) return;
    const dataUrl = `data:${mime};base64,${b64}`;
    setImgDataUrl(dataUrl);
    setImgPreview(dataUrl);
  };

  const save = async () => {
    setError(null);
    const priceNum = Number(form.price_lek);
    const stockNum = Number(form.stock);
    if (!form.name.trim()) return setError("Name is required");
    if (!form.category_slug) return setError("Category is required");
    if (!(priceNum > 0)) return setError("Price must be > 0");
    if (Number.isNaN(stockNum)) return setError("Stock must be a number");
    const body: any = {
      name: form.name.trim(),
      category_slug: form.category_slug,
      price_lek: priceNum,
      stock: stockNum,
      in_stock: form.in_stock,
      weight: form.weight,
      brand: form.brand,
      description: form.description,
      sku: form.sku,
      product_code: form.product_code,
      ean_barcode: form.ean_barcode,
      unit: form.unit,
    };
    // MRP is optional — only send when a valid number is entered.
    const mrpNum = Number(form.mrp_lek);
    if (form.mrp_lek !== "" && !Number.isNaN(mrpNum) && mrpNum > 0) {
      body.mrp_lek = mrpNum;
    }
    if (imgDataUrl) body.image_data_url = imgDataUrl;
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/admin/products/${product.id}`, body, true);
      } else {
        await api.post("/admin/products", body, true);
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{isEdit ? "Edit product" : "New product"}</Text>
            <Pressable onPress={onClose} style={styles.iconBtn} testID="prod-modal-close">
              <Ionicons name="close" size={22} color={colors.textMain} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={modalStyles.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* Image */}
            <View style={modalStyles.imgRow}>
              <Pressable onPress={pickImage} style={modalStyles.imgBox} testID="prod-modal-image">
                {imgPreview ? (
                  <Image source={{ uri: imgPreview }} style={modalStyles.img} />
                ) : (
                  <>
                    <Ionicons name="camera" size={28} color={colors.textMuted} />
                    <Text style={modalStyles.imgHint}>Tap to pick image</Text>
                  </>
                )}
              </Pressable>
              <View style={{ flex: 1, gap: 6 }}>
                <Field label="Name">
                  <TextInput
                    value={form.name}
                    onChangeText={(v) => setForm({ ...form, name: v })}
                    style={styles.input}
                    placeholder="Product name"
                    placeholderTextColor={colors.textDisabled}
                    testID="prod-modal-name"
                  />
                </Field>
                <Field label="Category">
                  <Pressable onPress={() => setShowCatPicker(true)} style={styles.input} testID="prod-modal-cat">
                    <Text style={{ color: colors.textMain, fontSize: 14 }}>
                      {cat ? `${cat.emoji || ""} ${cat.name}` : "Select"}
                    </Text>
                  </Pressable>
                </Field>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Field label="Price (LEK)" flex>
                <TextInput
                  value={form.price_lek}
                  onChangeText={(v) => setForm({ ...form, price_lek: v.replace(/[^\d.]/g, "") })}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textDisabled}
                  testID="prod-modal-price"
                />
              </Field>
              <Field label="MRP (LEK, optional)" flex>
                <TextInput
                  value={form.mrp_lek}
                  onChangeText={(v) => setForm({ ...form, mrp_lek: v.replace(/[^\d.]/g, "") })}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  placeholder="Shows % OFF"
                  placeholderTextColor={colors.textDisabled}
                  testID="prod-modal-mrp"
                />
              </Field>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Field label="Stock" flex>
                <TextInput
                  value={form.stock}
                  onChangeText={(v) => setForm({ ...form, stock: v.replace(/[^\d-]/g, "") })}
                  keyboardType="number-pad"
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textDisabled}
                  testID="prod-modal-stock"
                />
              </Field>
              <Field label="Weight" flex>
                <TextInput
                  value={form.weight}
                  onChangeText={(v) => setForm({ ...form, weight: v })}
                  style={styles.input}
                  placeholder="500g"
                  placeholderTextColor={colors.textDisabled}
                />
              </Field>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Field label="Brand" flex>
                <TextInput
                  value={form.brand}
                  onChangeText={(v) => setForm({ ...form, brand: v })}
                  style={styles.input}
                  placeholder="Brand"
                  placeholderTextColor={colors.textDisabled}
                />
              </Field>
              <Field label="SKU" flex>
                <TextInput
                  value={form.sku}
                  onChangeText={(v) => setForm({ ...form, sku: v })}
                  style={styles.input}
                  placeholder="SKU"
                  placeholderTextColor={colors.textDisabled}
                />
              </Field>
            </View>

            <Field label="Description">
              <TextInput
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                multiline
                style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                placeholder="Optional description"
                placeholderTextColor={colors.textDisabled}
              />
            </Field>

            <View style={modalStyles.stockRow}>
              <Switch
                value={form.in_stock}
                onValueChange={(v) => setForm({ ...form, in_stock: v })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#fff"
              />
              <Text style={{ marginLeft: 8, fontWeight: "700", color: colors.textMain }}>
                {form.in_stock ? "Visible to customers" : "Hidden from customers"}
              </Text>
            </View>

            {error && <Text style={{ color: colors.error, fontSize: 12, fontWeight: "700" }}>{error}</Text>}
          </ScrollView>

          {/* Sticky action bar so Save is always visible */}
          <View style={modalStyles.actionBar}>
            <Pressable onPress={onClose} style={[styles.ctaSecondary, { flex: 1 }]} testID="prod-modal-cancel">
              <Text style={styles.ctaSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={[styles.ctaPrimary, { flex: 1 }, saving && { opacity: 0.6 }]}
              testID="prod-modal-save"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.ctaPrimaryText}>{isEdit ? "Save changes" : "Create product"}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
      <SearchablePicker
        visible={showCatPicker}
        title="Select category"
        items={categories.map((c) => ({ key: c.slug, label: c.name, prefix: c.emoji }))}
        selectedKey={form.category_slug}
        onSelect={(it) => {
          setForm({ ...form, category_slug: it.key });
          setShowCatPicker(false);
        }}
        onClose={() => setShowCatPicker(false)}
      />
    </Modal>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <View style={{ marginBottom: 6, flex: flex ? 1 : undefined }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "800", color: colors.textMain, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  toolbar: { gap: 8 },
  toolbarRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.textMain },
  catBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    minWidth: 140,
  },
  catBtnText: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.textMain },
  ctaPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14,
  },
  ctaPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ctaSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  ctaSecondaryText: { color: colors.textMain, fontWeight: "700", fontSize: 13 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight,
  },
  iconBtnDanger: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center", backgroundColor: "#FEE2E2",
  },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 12, marginBottom: 8,
  },
  thumb: {
    width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.surfaceMuted,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  cardName: { fontSize: 14, fontWeight: "700", color: colors.textMain },
  cardMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  cardStats: { flexDirection: "row", gap: 12, marginTop: 6 },
  cardPrice: { fontSize: 14, fontWeight: "800", color: colors.primary },
  cardStock: { fontSize: 12, color: colors.textMuted },
  actions: { alignItems: "flex-end", gap: 6 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  switchLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.textMain,
  },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  empty: { padding: 40, alignItems: "center", gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheet: {
    width: "100%", maxWidth: 560, height: "90%",
    backgroundColor: colors.background, borderRadius: radius.xl,
    overflow: "hidden", borderWidth: 1, borderColor: colors.border,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.textMain },
  body: { padding: spacing.lg, gap: 8, paddingBottom: spacing.xl },
  imgRow: { flexDirection: "row", gap: 12 },
  imgBox: {
    width: 100, height: 100, borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", overflow: "hidden",
  },
  img: { width: "100%", height: "100%" },
  imgHint: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  stockRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, backgroundColor: colors.surfaceMuted, borderRadius: radius.md,
  },
  actionBar: {
    flexDirection: "row", gap: 8,
    padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
