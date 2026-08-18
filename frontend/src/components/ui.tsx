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
      {filled && <GradientFill tone={variant === "danger" ? "danger" : "brand"} radius={theme.radius.md} />}
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

/**
 * A number worth glancing at.
 *
 * Tinted rather than white, and flat rather than lifted: these sit in grids of
 * two or four, and a grid of shadows reads as clutter where a grid of quiet
 * colour reads as a set.
 */
export function StatTile({
  value, label, icon, tone = "brand", testID,
}: { value: string; label: string; icon?: IconName; tone?: "brand" | "warm" | "danger"; testID?: string }) {
  const bg = {
    brand: theme.colors.brandLight,
    warm: theme.colors.marigoldLight,
    danger: theme.colors.surfaceTertiary,
  }[tone];
  return (
    <View style={[styles.stat, { backgroundColor: bg }]} testID={testID}>
      {icon && <IconWell icon={icon} size={36} tone={tone === "danger" ? "danger" : tone} />}
      <AppText style={styles.statValue}>{value}</AppText>
      <AppText style={styles.statLabel}>{label}</AppText>
    </View>
  );
}

/**
 * The small circular action that sits at the end of a list row — call, message,
 * open. Filled and tinted so it reads as pressable at a glance, which a bare
 * icon on a white row does not.
 */
export function RoundAction({
  icon, onPress, tone = "brand", testID, accessibilityLabel,
}: {
  icon: IconName;
  onPress: () => void;
  tone?: "brand" | "warm" | "danger";
  testID?: string;
  accessibilityLabel: string;
}) {
  const [bg, fg] = {
    brand: [theme.colors.brandLight, theme.colors.brand],
    warm: [theme.colors.marigoldLight, theme.colors.marigoldDark],
    danger: [theme.colors.surfaceTertiary, theme.colors.error],
  }[tone];
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.round, { backgroundColor: bg }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={20} color={fg} />
    </Pressable>
  );
}

/** A list row on a white card: thumbnail or well, text, then actions. */
export function Row({
  children, style, onPress, testID, accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  if (!onPress) return <View style={[styles.row, style]} testID={testID}>{children}</View>;
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.row, style, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
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
  // No border. A card is a white sheet lifted off a tinted page by its shadow —
  // an outline around it is the thing that makes a card look like a box.
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: 18,
    shadowColor: "#0E2439",
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardRaised: {
    shadowOpacity: 0.11,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  // A tinted panel that belongs to the page rather than floating over it, so it
  // carries no shadow at all.
  cardQuiet: {
    backgroundColor: theme.colors.surfaceTertiary,
    shadowOpacity: 0,
    elevation: 0,
  },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    // A rounded rectangle, not a pill. Every primary action in the reference
    // designs sits around this radius; a full pill reads as a chip, not a button.
    borderRadius: theme.radius.md,
    paddingVertical: 18,
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

  stat: {
    flex: 1, gap: 8, alignItems: "flex-start", minWidth: 140,
    borderRadius: theme.radius.lg, padding: 16,
  },
  statValue: { fontSize: theme.font.xl, fontWeight: "800", color: theme.colors.onSurface },
  statLabel: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, fontWeight: "600" },

  round: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 12, minHeight: 64 },

  sectionHead: { marginTop: 26, marginBottom: 12 },
  sectionTitle: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  sectionHint: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 2, lineHeight: 21 },
});
