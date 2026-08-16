import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";

// Vector "Sunshine" logo: a warm marigold sun/diya with a sage leaf,
// paired with a bold wordmark. No stock emoji.
export function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="sunny" size={size * 0.62} color={theme.colors.marigold} />
      <View style={[styles.leaf, { right: size * 0.1, bottom: size * 0.08 }]}>
        <Ionicons name="leaf" size={size * 0.32} color={theme.colors.brand} />
      </View>
    </View>
  );
}

export function Logo({ size = 64, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <View style={styles.row}>
      <LogoMark size={size} />
      <View>
        <Text style={styles.wordmark}>
          Sun<Text style={{ color: theme.colors.marigoldDark }}>shine</Text>
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  mark: {
    backgroundColor: theme.colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: 2,
    borderColor: theme.colors.brand,
  },
  leaf: { position: "absolute" },
  wordmark: { fontSize: 34, fontWeight: "800", color: theme.colors.brand, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: theme.colors.muted, fontWeight: "600", marginTop: -2 },
});
