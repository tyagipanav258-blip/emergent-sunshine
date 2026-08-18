import React from "react";
import { View, StyleSheet } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, DIAGONAL, theme } from "@/src/theme";

/**
 * The Sunshine mark: a sun on a warm sunrise gradient — gold falling through
 * amber into coral — with the sage leaf kept solid so it stays readable against
 * the bright face behind it.
 */
export function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={gradients.logo as unknown as readonly [string, string, ...string[]]}
        start={DIAGONAL.start}
        end={DIAGONAL.end}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      <Ionicons name="sunny" size={size * 0.6} color="#FFFFFF" style={styles.sun} />
      <View style={[styles.leafWell, { right: size * 0.02, bottom: size * 0.01, padding: size * 0.06 }]}>
        <Ionicons name="leaf" size={size * 0.3} color={theme.colors.brand} />
      </View>
    </View>
  );
}

/** The wordmark, echoing the mark's warm half in the second syllable. */
export function Logo({ size = 64, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <View style={styles.row}>
      <LogoMark size={size} />
      <View>
        <AppText style={styles.wordmark}>
          Sun<AppText style={styles.wordmarkWarm}>shine</AppText>
        </AppText>
        {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  mark: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    shadowColor: "#5E8F35",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sun: {
    // A soft cast so the white sun reads against the brightest part of the sweep.
    textShadowColor: "rgba(50,84,22,0.38)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  leafWell: {
    position: "absolute",
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
  },
  wordmark: { fontSize: 34, fontWeight: "800", color: theme.colors.brand, letterSpacing: -0.5 },
  // The "shine" half, in the butter that replaces the old amber. 5.6:1.
  wordmarkWarm: { color: theme.colors.marigoldDark },
  subtitle: { fontSize: 14, color: theme.colors.muted, fontWeight: "600", marginTop: -2 },
});
