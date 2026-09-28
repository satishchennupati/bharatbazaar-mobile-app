/**
 * Reusable favourite (heart) toggle button. Filled red heart when saved,
 * outline when not. Used on product cards and the product detail hero.
 */
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useFavourites } from "@/src/hooks/use-favourites";
import { colors } from "@/src/theme";

export function FavouriteHeart({
  productId,
  size = 18,
  style,
}: {
  productId: string;
  size?: number;
  style?: any;
}) {
  const { isFavourite, toggleFavourite } = useFavourites();
  const fav = isFavourite(productId);
  return (
    <Pressable
      onPress={(e) => {
        // Prevent the parent card's onPress (navigate) from firing.
        // @ts-ignore — RN web/native both expose stopPropagation here.
        e?.stopPropagation?.();
        toggleFavourite(productId);
      }}
      hitSlop={8}
      style={[styles.btn, style]}
      testID={`fav-toggle-${productId}`}
    >
      <Ionicons
        name={fav ? "heart" : "heart-outline"}
        size={size}
        color={fav ? colors.error : colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
});
