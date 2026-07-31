/**
 * OffersCarousel — home rotating banner carousel.
 * Auto-rotates every 4s. Tap to navigate to CTA target.
 * Uses banners fetched from /api/offers/banners.
 */
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

import { api, resolveImageUrl } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

export type Banner = {
  id: string;
  title: string;
  description?: string;
  banner_image_url?: string | null;
  banner_bg_color?: string;
  banner_text_color?: string;
  cta_label?: string;
  cta_target?: string;
};

const { width: SCREEN_W } = Dimensions.get("window");

export function OffersCarousel({ testID }: { testID?: string }) {
  const router = useRouter();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [cardWidth, setCardWidth] = useState<number>(Math.min(SCREEN_W - spacing.lg * 2, 520));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<{ banners: Banner[] }>("/offers/banners");
        if (!cancelled) setBanners(r.banners || []);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-rotate
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => {
      const next = (idx + 1) % banners.length;
      setIdx(next);
      scrollRef.current?.scrollTo({ x: next * (cardWidth + spacing.md), animated: true });
    }, 4200);
    return () => clearInterval(t);
  }, [idx, banners.length, cardWidth]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const step = cardWidth + spacing.md;
    const n = Math.round(e.nativeEvent.contentOffset.x / step);
    if (n !== idx) setIdx(n);
  };

  const handleTap = (b: Banner) => {
    if (!b.cta_target) return;
    const t = b.cta_target.trim();
    if (t.startsWith("category:")) {
      const slug = t.slice("category:".length);
      if (slug) router.push(`/category/${slug}`);
    } else if (t.startsWith("product:")) {
      const pid = t.slice("product:".length);
      if (pid) router.push(`/product/${pid}`);
    } else if (t.startsWith("tab:")) {
      const tab = t.slice("tab:".length);
      if (tab === "categories") router.push("/(tabs)/categories");
      else if (tab === "cart") router.push("/(tabs)/cart");
      else if (tab === "orders") router.push("/(tabs)/orders");
      else if (tab === "profile") router.push("/(tabs)/profile");
      else router.push("/(tabs)");
    } else if (t.startsWith("url:")) {
      const url = t.slice("url:".length);
      if (url) Linking.openURL(url).catch(() => {});
    } else if (t.startsWith("http")) {
      Linking.openURL(t).catch(() => {});
    }
  };

  if (banners.length === 0) return null;

  return (
    <View style={styles.wrap} testID={testID || "home-offers-carousel"}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled={false}
        snapToInterval={cardWidth + spacing.md}
        snapToAlignment="start"
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: spacing.md, paddingHorizontal: 0 }}
        onLayout={(e) => setCardWidth(Math.min(e.nativeEvent.layout.width, 520))}
      >
        {banners.map((b) => (
          <Pressable
            key={b.id}
            onPress={() => handleTap(b)}
            style={[
              styles.card,
              { width: cardWidth, backgroundColor: b.banner_bg_color || colors.primary },
            ]}
            testID={`home-offer-${b.id}`}
          >
            {b.banner_image_url ? (
              <Image
                source={{ uri: resolveImageUrl(b.banner_image_url) }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.cardOverlay} />
            <View style={styles.cardContent}>
              <Text style={[styles.title, { color: b.banner_text_color || "#fff" }]} numberOfLines={2}>
                {b.title}
              </Text>
              {b.description ? (
                <Text style={[styles.sub, { color: b.banner_text_color || "#fff" }]} numberOfLines={2}>
                  {b.description}
                </Text>
              ) : null}
              {b.cta_label ? (
                <View style={styles.cta}>
                  <Text style={[styles.ctaText, { color: b.banner_bg_color || colors.primary }]}>
                    {b.cta_label}
                  </Text>
                  <Ionicons name="arrow-forward" size={12} color={b.banner_bg_color || colors.primary} />
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {banners.length > 1 && (
        <View style={styles.dotsRow}>
          {banners.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === idx && { width: 18, backgroundColor: colors.primary },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  card: {
    height: 140,
    borderRadius: radius.xl,
    overflow: "hidden",
    justifyContent: "center",
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  cardContent: { padding: spacing.lg, gap: 4 },
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  sub: { fontSize: 13, opacity: 0.92 },
  cta: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ctaText: { fontSize: 12, fontWeight: "800" },
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 4, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
});
