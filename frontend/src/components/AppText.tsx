import { Text as RNText, StyleSheet, TextProps } from "react-native";
import { theme } from "@/src/theme";
import { useTextScale } from "@/src/text-scale";
import { fontStyleFor } from "@/src/fonts";

/**
 * Drop-in replacement for React Native's `Text` that honours the user's
 * "Larger text" setting and draws in the app's typeface.
 *
 * It reads whatever `fontSize` the passed style already declares and scales it,
 * so every screen scales together without each one having to know about the
 * setting. Line height is scaled with it so long passages don't collide.
 *
 * The typeface is resolved here rather than screen by screen, so a style that
 * asks for `fontWeight: "800"` gets the ExtraBold *file* — React Native will
 * not pick it from the weight alone for a custom font.
 */
export function AppText({ style, ...props }: TextProps) {
  const { scale } = useTextScale();
  const flat = StyleSheet.flatten(style) || {};
  const font = fontStyleFor(flat.fontWeight);

  if (scale === 1) return <RNText {...props} style={[style, font]} />;

  const size = typeof flat.fontSize === "number" ? flat.fontSize : theme.font.base;
  const lineHeight = typeof flat.lineHeight === "number" ? Math.round(flat.lineHeight * scale) : undefined;

  return (
    <RNText
      {...props}
      style={[
        style,
        font,
        { fontSize: Math.round(size * scale), ...(lineHeight ? { lineHeight } : null) },
      ]}
    />
  );
}
