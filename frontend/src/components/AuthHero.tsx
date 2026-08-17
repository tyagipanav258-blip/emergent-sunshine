import React from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { gradients, DIAGONAL, theme } from "@/src/theme";

/**
 * The warm sunrise banner that opens every entry screen — sign-in choice,
 * elder login, family login. One visual language for "you have arrived",
 * before the screen gets down to whichever specific thing it is asking for.
 *
 * Kept deliberately short on real screens: the gradient carries the welcome,
 * the cream sheet below carries the actual reading and typing, so contrast
 * never suffers where it matters for an older eye.
 */
export function AuthHero({
  title,
  subtitle,
  icon = "sunny",
  onBack,
  insetTop,
  compact = false,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onBack?: () => void;
  insetTop: number;
  /** Shorter banner for screens that need the room below for a form or keypad. */
  compact?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.wrap, compact ? styles.wrapCompact : styles.wrapTall]} testID={testID}>
      <LinearGradient
        colors={gradients.sunrise as unknown as readonly [string, string, ...string[]]}
        start={DIAGONAL.start}
        end={DIAGONAL.end}
        style={StyleSheet.absoluteFill}
      />
      {onBack && (
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            onBack();
          }}
          hitSlop={12}
          style={[styles.back, { top: insetTop + 8 }]}
          testID="auth-hero-back"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={theme.colors.onSurface} />
        </Pressable>
      )}
      <View style={[styles.content, { paddingTop: insetTop + (compact ? 36 : 16) }]}>
        <View style={styles.glow}>
          <View style={styles.iconWell}>
            <Ionicons name={icon} size={compact ? 34 : 44} color={theme.colors.marigoldDark} />
          </View>
        </View>
        <AppText style={[styles.title, compact && styles.titleCompact]}>{title}</AppText>
        {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: "hidden",
  },
  wrapTall: { paddingBottom: 36 },
  wrapCompact: { paddingBottom: 22 },
  back: {
    position: "absolute", left: 16, width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center",
    zIndex: 1,
  },
  content: { alignItems: "center", paddingHorizontal: 24 },
  // A soft halo behind the mark, echoing a sunburst without hand-drawn art.
  glow: {
    width: 96, height: 96, borderRadius: 48, marginBottom: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  iconWell: {
    width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surface,
    shadowColor: "#7C4A03", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  titleCompact: { fontSize: 22 },
  subtitle: { fontSize: 15, fontWeight: "600", color: "#5B4200", textAlign: "center", marginTop: 4, opacity: 0.85 },
});
