import { Text as RNText, StyleSheet, TextProps } from "react-native";
import { theme } from "@/src/theme";
import { useTextScale } from "@/src/text-scale";

/**
 * Drop-in replacement for React Native's `Text` that honours the user's
 * "Larger text" setting.
 *
 * It reads whatever `fontSize` the passed style already declares and scales it,
 * so every screen scales together without each one having to know about the
 * setting. Line height is scaled with it so long passages don't collide.
 */
export function AppText({ style, ...props }: TextProps) {
  const { scale } = useTextScale();
  if (scale === 1) return <RNText {...props} style={style} />;

  const flat = StyleSheet.flatten(style) || {};
  const size = typeof flat.fontSize === "number" ? flat.fontSize : theme.font.base;
  const lineHeight = typeof flat.lineHeight === "number" ? Math.round(flat.lineHeight * scale) : undefined;

  return (
    <RNText
      {...props}
      style={[style, { fontSize: Math.round(size * scale), ...(lineHeight ? { lineHeight } : null) }]}
    />
  );
}
