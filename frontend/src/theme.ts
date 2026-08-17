export const theme = {
  colors: {
    // Elder-friendly: Deep Sage Green + Soft Marigold, warm cream surfaces
    surface: '#FDFBF7',
    onSurface: '#1A2015',
    surfaceSecondary: '#FFFFFF',
    surfaceTertiary: '#F2EFE9',
    surfaceInverse: '#2C3F2F',
    onSurfaceInverse: '#FFFFFF',

    brand: '#3A5A40',
    brandDark: '#2C3F2F',
    brandLight: '#E7EDE6',
    onBrand: '#FFFFFF',

    marigold: '#FFB703',
    marigoldDark: '#E29500',
    marigoldLight: '#FFF3D6',
    onMarigold: '#1A2015',

    success: '#2D6A4F',
    // Darkened from #B56D00 to clear 4.5:1 against the cream surface.
    warning: '#8A5400',
    error: '#D62828',
    onError: '#FFFFFF',
    info: '#457B9D',

    border: '#E5E2DA',
    borderStrong: '#C8C4B7',
    muted: '#6E6A5F',
    onSurfaceSecondary: '#3A4034',
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
  radius: { sm: 8, md: 16, lg: 20, xl: 28, pill: 999 },
  // Clearance so the floating assistant/SOS buttons never sit on top of content.
  fabClearance: 96,
} as const;

/**
 * Diagonal multi-stop gradients, in the manner of the Instagram mark — a warm
 * sweep from a lighter corner into a deeper one — but built from Sunshine's own
 * sage and marigold so the app still reads as elder care rather than social.
 *
 * Every stop on a white-text gradient clears 4.5:1, so a button stays legible
 * across its whole face, not just in the middle.
 */
export const gradients = {
  brand: ["#4C7654", "#3A5A40", "#2B4733"],
  success: ["#388360", "#2D6A4F", "#1F5138"],
  danger: ["#CF4632", "#D62828", "#B01F1F"],
  info: ["#4A7B95", "#457B9D", "#2F5D7C"],
  /** Carries dark text, so it can stay bright. */
  sunrise: ["#FFE08A", "#FFB703", "#F08C00"],
  /** The logo mark: a full sunrise, warm gold falling into coral. */
  logo: ["#FFDE7A", "#FFB703", "#F97316", "#E0526D"],
  /** Soft tints for icon wells and cards. */
  brandSoft: ["#F0F4EF", "#E2EAE1"],
  sunriseSoft: ["#FFF6E0", "#FFEFC7"],
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
