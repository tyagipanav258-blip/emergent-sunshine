import React from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";

// A sunrise over sea and sand, generated to match the reference the user
// supplied (no file access to the original — recreated the scene itself,
// their explicit call over an abstracted gradient). Now the backdrop for the
// whole entry screen, not just a banner: one <AuthBackground> behind
// everything, with AuthHero as transparent chrome sitting on top of it.
const BEACH_BG = require("../../assets/images/auth-beach.png");

/** The full-bleed backdrop for an entry screen. Render once, as the first
 * child of the screen's root, so the same photograph shows through the
 * header, the gaps around the form sheet, and the safe-area edges alike. */
export function AuthBackground() {
  return <Image source={BEACH_BG} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />;
}

/**
 * The transparent header that opens every entry screen — sign-in choice,
 * elder login, family login — sitting directly on the shared AuthBackground
 * rather than carrying its own image. The reading and typing below live in an
 * opaque cream sheet, so contrast never suffers where it matters for an older
 * eye, while the photograph itself is free to run the full height of the page.
 */
export function AuthHero({
  title,
  subtitle,
  icon = "sunny",
  photo,
  onBack,
  insetTop,
  compact = false,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /** A face for the persona this screen is speaking to — shown instead of the icon. */
  photo?: string;
  onBack?: () => void;
  insetTop: number;
  /** Shorter banner for screens that need the room below for a form or keypad. */
  compact?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.wrap, compact ? styles.wrapCompact : styles.wrapTall]} testID={testID}>
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
            {photo ? (
              <Image source={{ uri: photo }} style={styles.iconPhoto} contentFit="cover" />
            ) : (
              <Ionicons name={icon} size={compact ? 34 : 44} color={theme.colors.marigoldDark} />
            )}
          </View>
        </View>
        <AppText style={[styles.title, compact && styles.titleCompact]}>{title}</AppText>
        {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  wrapTall: { paddingBottom: 28 },
  wrapCompact: { paddingBottom: 18 },
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
    backgroundColor: theme.colors.surface, overflow: "hidden",
    shadowColor: "#3A5A1E", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  iconPhoto: { width: "100%", height: "100%" },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center" },
  titleCompact: { fontSize: 22 },
  // Deep leaf green rather than the app's usual muted grey — the tone the scene
  // itself is made of, so it reads as chosen rather than pasted on.
  subtitle: { fontSize: 15, fontWeight: "700", color: theme.colors.brandDark, textAlign: "center", marginTop: 4 },
});
