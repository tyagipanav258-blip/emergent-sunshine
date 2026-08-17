import { Pressable, StyleSheet, StyleProp, ViewStyle, PressableProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, DIAGONAL, theme } from "@/src/theme";

type Tone = keyof typeof gradients;

type Props = PressableProps & {
  /** Which gradient to paint. Defaults to the sage brand sweep. */
  tone?: Tone;
  /** Layout for the button itself — padding, radius, min height. */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * A filled button painted with a diagonal gradient instead of a flat colour.
 *
 * The gradient sits behind the content rather than on the Pressable, so the
 * existing layout styles (radius, padding, flex direction) keep working
 * unchanged — this is a drop-in for the solid buttons it replaces.
 */
export function GradientButton({ tone = "brand", style, children, disabled, ...rest }: Props) {
  const flat = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const radius = typeof flat.borderRadius === "number" ? flat.borderRadius : theme.radius.pill;

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        style,
        { backgroundColor: "transparent", overflow: "hidden" },
        disabled && styles.disabled,
        // A gentle press state, since a gradient can't darken on touch by itself.
        pressed && !disabled && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={gradients[tone] as unknown as readonly [string, string, ...string[]]}
        start={DIAGONAL.start}
        end={DIAGONAL.end}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
});
