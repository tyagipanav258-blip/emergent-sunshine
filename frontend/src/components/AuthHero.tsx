import React from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";

// A sunrise over sea and sand — the same image behind every entry screen. Built
// as vector art rather than a photograph, because a photograph this bright
// behind body text is how contrast dies for the exact eyes this app is for; a
// crafted gradient holds up at every crop height and never fights the words on
// top of it. contentPosition="top" keeps the sun anchored regardless of how
// tall a given hero is cropped to.
const BEACH_BG = require("../../assets/images/auth-beach.png");

/**
 * The banner that opens every entry screen — sign-in choice, elder login,
 * family login. One visual language for "you have arrived", before the screen
 * gets down to whichever specific thing it is asking for.
 *
 * Kept deliberately short on real screens: the image carries the welcome, the
 * cream sheet below carries the actual reading and typing, so contrast never
 * suffers where it matters for an older eye.
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
      <Image source={BEACH_BG} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
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
  // Deep ocean blue rather than the app's usual muted grey — the tone the sky
  // and sea themselves are made of, so it reads as chosen rather than pasted on.
  subtitle: { fontSize: 15, fontWeight: "700", color: "#0B4C7C", textAlign: "center", marginTop: 4 },
});
