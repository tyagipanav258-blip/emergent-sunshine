import React from "react";
import { View, StyleSheet, Pressable, Platform, ActivityIndicator, StyleProp, ViewStyle } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientFill } from "@/src/components/GradientFill";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";

/**
 * The shared surface of the app: card, button, chip, icon well, stat tile.
 *
 * These existed before as sixteen separate button styles and fifteen hand-rolled
 * cards, one per screen, which is why the app read as a set of screens rather
 * than one product. Same tokens, same radii, same shadow, defined once.
 *
 * Everything here is deliberately hue-agnostic — colour comes from theme tokens,
 * so the palette can change without touching a component.
 */

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const tap = () => { if (Platform.OS !== "web") Haptics.selectionAsync(); };

/** The soft-shadowed white surface everything sits on. */
export function Card({
  children, style, tone = "plain", testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `raised` lifts it off the page; `quiet` recedes into it. */
  tone?: "plain" | "raised" | "quiet";
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        tone === "raised" && styles.cardRaised,
        tone === "quiet" && styles.cardQuiet,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The app's button.
 *
 * `primary` is the one action a screen is asking for, `secondary` a real but
 * lesser one, `quiet` a way out. Danger is kept separate from primary so an
 * irreversible action never wears the same clothes as a safe one.
 */
export function Button({
  label, onPress, variant = "primary", icon, busy, disabled, full = true, style, testID, accessibilityLabel, accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const off = Boolean(disabled || busy);
  const filled = variant === "primary" || variant === "danger";
  const ink = filled ? "#fff" : variant === "secondary" ? theme.colors.brand : theme.colors.onSurfaceSecondary;

  return (
    <Pressable
      onPress={() => { if (off) return; tap(); onPress(); }}
      disabled={off}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off }}
      style={({ pressed }) => [
        styles.btn,
        full && { alignSelf: "stretch" },
        variant === "secondary" && styles.btnSecondary,
        variant === "quiet" && styles.btnQuiet,
        off && { opacity: 0.45 },
        pressed && !off && styles.btnPressed,
        style,
      ]}
    >
      {filled && <GradientFill tone={variant === "danger" ? "danger" : "brand"} radius={theme.radius.pill} />}
      {busy ? (
        <ActivityIndicator color={ink} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={22} color={ink} />}
          <AppText style={[styles.btnLabel, { color: ink }]}>{label}</AppText>
        </>
      )}
    </Pressable>
  );
}

/** A filter or category pill. Selected reads as filled, not merely outlined. */
export function Chip({
  label, selected, onPress, testID,
}: { label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <AppText style={[styles.chipText, selected && styles.chipTextOn]}>{label}</AppText>
    </Pressable>
  );
}

/** A tinted round well behind an icon — the motif that ties the screens together. */
export function IconWell({
  icon, size = 46, tone = "brand",
}: { icon: IconName; size?: number; tone?: "brand" | "warm" | "danger" | "muted" }) {
  const bg = {
    brand: theme.colors.brandLight,
    warm: theme.colors.marigoldLight,
    danger: theme.colors.surfaceTertiary,
    muted: theme.colors.surfaceTertiary,
  }[tone];
  const fg = {
    brand: theme.colors.brand,
    warm: theme.colors.marigoldDark,
    danger: theme.colors.error,
    muted: theme.colors.muted,
  }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={fg} />
    </View>
  );
}

/** A number worth glancing at, with its label under it. */
export function StatTile({
  value, label, icon, tone = "brand", testID,
}: { value: string; label: string; icon?: IconName; tone?: "brand" | "warm" | "danger"; testID?: string }) {
  return (
    <Card tone="raised" style={styles.stat} testID={testID}>
      {icon && <IconWell icon={icon} size={38} tone={tone} />}
      <AppText style={styles.statValue}>{value}</AppText>
      <AppText style={styles.statLabel}>{label}</AppText>
    </Card>
  );
}

/** A section heading with optional supporting line. */
export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHead}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      {hint ? <AppText style={styles.sectionHint}>{hint}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  // The lift in these designs is shadow, not a heavier border.
  cardRaised: {
    borderColor: "transparent",
    shadowColor: "#1C2714",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardQuiet: { backgroundColor: theme.colors.surfaceTertiary, borderColor: "transparent" },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: theme.radius.pill,
    paddingVertical: 17,
    paddingHorizontal: 24,
    // Comfortably past the 44pt floor: this app's hands are not steady ones.
    minHeight: 58,
    overflow: "hidden",
  },
  btnSecondary: { backgroundColor: theme.colors.brandLight },
  btnQuiet: { backgroundColor: theme.colors.surfaceTertiary },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  btnLabel: { fontSize: theme.font.md, fontWeight: "800" },

  chip: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    minHeight: 46,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { fontSize: theme.font.sm, fontWeight: "700", color: theme.colors.onSurfaceSecondary },
  chipTextOn: { color: "#fff" },

  stat: { flex: 1, gap: 6, alignItems: "flex-start", minWidth: 140 },
  statValue: { fontSize: theme.font.xl, fontWeight: "800", color: theme.colors.onSurface },
  statLabel: { fontSize: theme.font.sm, color: theme.colors.muted, fontWeight: "600" },

  sectionHead: { marginTop: 26, marginBottom: 12 },
  sectionTitle: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  sectionHint: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 2, lineHeight: 21 },
});
