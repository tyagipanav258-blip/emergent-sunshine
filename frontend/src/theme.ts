/**
 * Azure blue with a warm peach counterpoint, on a ground carrying the faintest
 * blue bias — a chosen neutral rather than an inherited grey.
 *
 * No green anywhere, by instruction. That costs one convention worth naming:
 * `success` is a deep cyan rather than the usual green tick, so the checkmark
 * itself carries "done" rather than the colour doing it. Say the word and a
 * green comes back for that state alone.
 *
 * The reference blue sits lighter than the brand here — nearer #3387CE, which is
 * 3.8:1 and cannot carry a white label. So the pale values keep doing what pale
 * values are good at, filling wells and tinting cards, and anything carrying
 * text or an icon is taken down until it clears 4.5:1.
 */
export const theme = {
  colors: {
    // Elder-friendly: Azure Blue + warm Peach on a blue-tinted ground.
    //
    // The ground is deliberately a shade off white. Cards are white and carry no
    // border, so the page behind them has to be tinted enough for them to lift
    // off it — a near-white ground is why bordered boxes were needed at all.
    surface: '#EDF3FA',
    onSurface: '#131E2A',
    surfaceSecondary: '#FFFFFF',
    surfaceTertiary: '#E4EDF7',
    surfaceInverse: '#17395C',
    onSurfaceInverse: '#FFFFFF',

    // 5.1:1 against white — safe for white text on a solid brand button.
    brand: '#2570B8',
    brandDark: '#1B558C',
    brandLight: '#DEEBF7',
    onBrand: '#FFFFFF',

    // The warm accent, kept amber-leaning rather than pink-coral so it can never
    // be mistaken for `error` at a glance. The pale value fills; `marigoldDark`
    // is the 5.2:1 version used whenever it has to be read.
    marigold: '#FFB48A',
    marigoldDark: '#96551B',
    marigoldLight: '#FFEADF',
    onMarigold: '#131E2A',

    // Deep cyan rather than green, so it is still clearly its own state next to
    // the brand azure without reaching for a hue this palette has ruled out.
    success: '#0E6E8C',
    warning: '#8A6A00',
    // Muted brick rather than a hot alarm red — calm enough to sit beside all
    // day, and still unmistakably the emergency colour.
    error: '#A8443C',
    onError: '#FFFFFF',
    // Violet, because blue is spoken for twice over. 6.2:1.
    info: '#5A55B5',

    border: '#D9E4F2',
    borderStrong: '#B3C6DE',
    muted: '#5A6B80',
    onSurfaceSecondary: '#2E3F52',
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
 * one — built from Sunshine's azure and peach.
 *
 * Each sweep spans roughly a 4x luminance range, so the fade is clearly visible
 * rather than a flat colour with a hint of shading. The lightest stop of every
 * white-text gradient is set as bright as 4.5:1 allows and no brighter — that
 * is what buys the width while keeping a label legible across the whole face.
 */
export const gradients = {
  brand: ["#2A76BE", "#2570B8", "#1A4F84"],
  success: ["#12788F", "#0E6E8C", "#08506A"],
  // A muted rose-brick rather than a hot red. On a screen an older adult looks
  // at all day, a bright alarm colour sitting there permanently reads as being
  // shouted at — this stays clearly the emergency colour without the glare.
  danger: ["#B15E52", "#9A3F38", "#6E2420"],
  /** Violet, deep enough across the whole sweep to carry white text. */
  info: ["#6560C4", "#5A55B5", "#403C8C"],
  /** Carries dark text, so it can stay bright — peach through to apricot. */
  sunrise: ["#FFDCC0", "#FFB48A", "#FF9166"],
  /** The logo mark: a sun rising out of peach into deep azure. */
  logo: ["#FFE3CC", "#FFB48A", "#6BA8DE", "#2570B8"],
  /** Soft tints for icon wells and cards. */
  brandSoft: ["#F1F6FC", "#E3EDF8"],
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
