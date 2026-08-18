import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import type { TextStyle } from "react-native";

/**
 * Poppins, the app's one typeface.
 *
 * Geometric and open, with a tall x-height — the letterforms stay distinct at
 * the large sizes this app already sets, and their roundness sits naturally
 * against the card radii. One family rather than a display/body pairing,
 * because a pairing has to be chosen per element and `AppText` only ever knows
 * a weight, which is a poor proxy for "is this a heading".
 *
 * React Native does not synthesise weights for custom fonts the way a browser
 * does: asking for Poppins at fontWeight 800 on Android gives you Poppins
 * Regular, not a bold one. Every weight is therefore its own loaded file, and
 * `fontStyleFor` picks the file instead of leaving `fontWeight` to do it.
 */
const WEIGHT_TO_FAMILY: Record<string, string> = {
  "100": "Poppins_400Regular",
  "200": "Poppins_400Regular",
  "300": "Poppins_400Regular",
  "400": "Poppins_400Regular",
  normal: "Poppins_400Regular",
  "500": "Poppins_500Medium",
  "600": "Poppins_600SemiBold",
  "700": "Poppins_700Bold",
  bold: "Poppins_700Bold",
  "800": "Poppins_800ExtraBold",
  "900": "Poppins_800ExtraBold",
};

export const FONT_FAMILY_REGULAR = "Poppins_400Regular";

/** Loads every weight. Gate the app's first render on this, or text flashes. */
export const useAppFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

/**
 * The family a given weight should actually be drawn in, plus a `fontWeight` of
 * "normal".
 *
 * Clearing the weight matters: leaving 800 on a face that is already ExtraBold
 * lets Android synthesise a second layer of boldness on top, which smears the
 * stems. The file carries the weight; the style property must not repeat it.
 */
export function fontStyleFor(weight: TextStyle["fontWeight"]): TextStyle {
  return {
    fontFamily: WEIGHT_TO_FAMILY[String(weight ?? "400")] || FONT_FAMILY_REGULAR,
    fontWeight: "normal",
  };
}
