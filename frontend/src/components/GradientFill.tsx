import { StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, DIAGONAL } from "@/src/theme";

type Tone = keyof typeof gradients;

/**
 * A gradient painted behind a non-interactive surface — an icon well, a card,
 * an avatar ring. Drop it in as the first child of a View that already has a
 * radius; it fills the parent and sits under the content.
 */
export function GradientFill({ tone = "brand", radius }: { tone?: Tone; radius?: number }) {
  return (
    <LinearGradient
      colors={gradients[tone] as unknown as readonly [string, string, ...string[]]}
      start={DIAGONAL.start}
      end={DIAGONAL.end}
      style={[StyleSheet.absoluteFill, radius != null ? { borderRadius: radius } : null] as StyleProp<ViewStyle>}
      pointerEvents="none"
    />
  );
}
