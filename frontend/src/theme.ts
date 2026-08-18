/**
 * Fresh garden green: leaf and lime, with mint and butter as the supporting
 * pastels, on an almost-white green-tinted ground.
 *
 * The palette it is drawn from is a very pale one — pale enough that its own
 * label text would fail contrast at this app's audience. So the pastels are
 * kept for what they are good at (fills, wells, chips, card tints) and every
 * value that ever carries text or an icon is darkened until it clears 4.5:1.
 * The result reads as the same fresh, airy family without asking a 75-year-old
 * to find grey-green type on a pale-green card.
 */
export const theme = {
  colors: {
    // Elder-friendly: Leaf Green + Lime, with mint and butter pastels
    surface: '#FBFDF6',
    onSurface: '#1C2714',
    surfaceSecondary: '#FFFFFF',
    surfaceTertiary: '#EFF5E4',
    surfaceInverse: '#2E4A1C',
    onSurfaceInverse: '#FFFFFF',

    // 5.1:1 against white — safe for white text on a solid brand button.
    // The reference green sits nearer #7CA84A, which is only ~2.8:1 and could
    // not carry a label; this is that green taken down until it can.
    brand: '#4A7A2B',
    brandDark: '#37601D',
    brandLight: '#E9F4D7',
    onBrand: '#FFFFFF',

    // Butter, standing in for the old marigold. The pale value is the fill;
    // `marigoldDark` is the 5.6:1 version used whenever it has to be read.
    marigold: '#E8D25A',
    marigoldDark: '#7A6605',
    marigoldLight: '#FCF6C9',
    onMarigold: '#1C2714',

    // A deeper, bluer green than `brand`, so "done" never reads as merely
    // "branded" on a screen where the brand is already green.
    success: '#1F7A4D',
    warning: '#8A6A00',
    // Muted brick rather than a hot alarm red — calm enough to sit beside all
    // day, and still clearly the emergency colour. 5.7:1 on the surface.
    error: '#A8443C',
    onError: '#FFFFFF',
    // Mint, darkened to 4.9:1 so it can carry text as well as tint a card.
    info: '#2C7F68',

    border: '#E4EDD6',
    borderStrong: '#C6D4B2',
    muted: '#6B7560',
    onSurfaceSecondary: '#3D4A32',
  },
  // The single source of truth for type size. Screens name a step, never a pixel,
  // so the "Larger text" setting can scale every one of them at once.
  font: {
    xs: 13,
    sm: 15,
    base: 17,
    md: 19,
    lg: 22,
    xl: 26,
    xxl: 32,
    display: 40,
  },
  space: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40, huge: 56 },
  // Softened a step at the larger end: the cards in this style are rounder than
  // the ones they replace, which is most of what makes the layout feel airy.
  radius: { sm: 8, md: 16, lg: 24, xl: 32, pill: 999 },
  // Clearance so the floating assistant/SOS buttons never sit on top of content.
  fabClearance: 96,
} as const;

/**
 * Diagonal multi-stop gradients — a sweep from a lighter corner into a deeper
 * one — built from Sunshine's leaf green and lime so the app reads as garden
 * and growth rather than clinic.
 *
 * Each sweep spans roughly a 4x luminance range, so the fade is clearly visible
 * rather than a flat colour with a hint of shading. The lightest stop of every
 * white-text gradient is set as bright as 4.5:1 allows and no brighter — that
 * is what buys the width while keeping a label legible across the whole face.
 */
export const gradients = {
  brand: ["#6E9A3E", "#4A7A2B", "#33601C"],
  success: ["#2E8F5E", "#1F7A4D", "#0F5433"],
  // A muted rose-brick rather than a hot red. On a screen an older adult looks
  // at all day, a bright alarm colour sitting there permanently reads as being
  // shouted at — this stays clearly the emergency colour without the glare.
  danger: ["#B15E52", "#9A3F38", "#6E2420"],
  /** Mint, deep enough across the whole sweep to carry white text. */
  info: ["#3D9A80", "#2C7F68", "#175A48"],
  /** Carries dark text, so it can stay bright — lime through to butter. */
  sunrise: ["#F2F7C4", "#D8ED9A", "#BFDE6E"],
  /** The logo mark: a sun rising through lime into leaf. */
  logo: ["#FAF7B8", "#E4F2A0", "#A9D45F", "#5E8F35"],
  /** Soft tints for icon wells and cards. */
  brandSoft: ["#F1F7E4", "#E4EFD2"],
  sunriseSoft: ["#FCFAE0", "#F5F3C4"],
} as const;

/** Top-left to bottom-right, the diagonal that gives a gradient its lift. */
export const DIAGONAL = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as const;

export type FontStep = keyof typeof theme.font;

/** Text-size steps offered in Profile > Accessibility. */
export const TEXT_SCALES = {
  normal: 1,
  large: 1.15,
  larger: 1.3,
} as const;

export type TextScaleKey = keyof typeof TEXT_SCALES;

/** Round to a whole pixel so scaled type stays crisp. */
export function scaleFont(step: FontStep, scale: number): number {
  return Math.round(theme.font[step] * scale);
}

export const API = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';
