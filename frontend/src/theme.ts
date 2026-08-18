/**
 * Deep teal with a warm peach counterpoint, on an almost-white ground carrying
 * the faintest teal bias — a chosen neutral rather than an inherited grey.
 *
 * The reference designs sit far lighter than this: their teal is nearer #2DB89C
 * and their coral #FF8A7A, both around 3:1, which is fine on a mockup and not
 * fine on a button a 75-year-old has to read. So the pale values are kept for
 * what pale values are good at — fills, wells, chips, card tints — and anything
 * that ever carries text or an icon is taken down until it clears 4.5:1. Same
 * family, a few shades deeper where legibility depends on it.
 */
export const theme = {
  colors: {
    // Elder-friendly: Deep Teal + warm Peach on a teal-tinted ground.
    //
    // The ground is deliberately a shade off white. Cards are white and carry no
    // border, so the page behind them has to be tinted enough for them to lift
    // off it — a near-white ground is why bordered boxes were needed at all.
    surface: '#EFF6F4',
    onSurface: '#14211F',
    surfaceSecondary: '#FFFFFF',
    surfaceTertiary: '#E9F2F0',
    surfaceInverse: '#123B36',
    onSurfaceInverse: '#FFFFFF',

    // 5.1:1 against white — safe for white text on a solid brand button.
    brand: '#0E7C6B',
    brandDark: '#0A5F53',
    brandLight: '#DDF2EE',
    onBrand: '#FFFFFF',

    // The warm accent, kept amber-leaning rather than pink-coral so it can never
    // be mistaken for `error` at a glance. The pale value fills; `marigoldDark`
    // is the 5.8:1 version used whenever it has to be read.
    marigold: '#FFB48A',
    marigoldDark: '#96551B',
    marigoldLight: '#FFEADF',
    onMarigold: '#14211F',

    // A true green rather than another teal, so "done" is its own colour on a
    // screen whose brand already sits in that corner of the wheel.
    success: '#2E7D32',
    warning: '#8A6A00',
    // Muted brick rather than a hot alarm red — calm enough to sit beside all
    // day, and still unmistakably the emergency colour.
    error: '#A8443C',
    onError: '#FFFFFF',
    // Blue, because teal is spoken for. 5.5:1.
    info: '#2A6F97',

    border: '#DDE9E6',
    borderStrong: '#B8CCC8',
    muted: '#61736F',
    onSurfaceSecondary: '#2F4340',
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
 * one — built from Sunshine's teal and peach.
 *
 * Each sweep spans roughly a 4x luminance range, so the fade is clearly visible
 * rather than a flat colour with a hint of shading. The lightest stop of every
 * white-text gradient is set as bright as 4.5:1 allows and no brighter — that
 * is what buys the width while keeping a label legible across the whole face.
 */
export const gradients = {
  brand: ["#0E8270", "#0E7C6B", "#08574C"],
  success: ["#31852F", "#2E7D32", "#175A1B"],
  // A muted rose-brick rather than a hot red. On a screen an older adult looks
  // at all day, a bright alarm colour sitting there permanently reads as being
  // shouted at — this stays clearly the emergency colour without the glare.
  danger: ["#B15E52", "#9A3F38", "#6E2420"],
  /** Blue, deep enough across the whole sweep to carry white text. */
  info: ["#2F7BA6", "#2A6F97", "#1A5273"],
  /** Carries dark text, so it can stay bright — peach through to apricot. */
  sunrise: ["#FFDCC0", "#FFB48A", "#FF9166"],
  /** The logo mark: a sun rising out of peach into deep teal. */
  logo: ["#FFE3CC", "#FFB48A", "#5FC4AE", "#0E7C6B"],
  /** Soft tints for icon wells and cards. */
  brandSoft: ["#EFF7F5", "#E1EFEC"],
  sunriseSoft: ["#FFF3EC", "#FFE7DA"],
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
