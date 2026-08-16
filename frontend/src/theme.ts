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
    warning: '#B56D00',
    error: '#D62828',
    onError: '#FFFFFF',
    info: '#457B9D',

    border: '#E5E2DA',
    borderStrong: '#C8C4B7',
    muted: '#6E6A5F',
    onSurfaceSecondary: '#3A4034',
  },
  font: { sm: 14, base: 18, lg: 20, xl: 24, xxl: 32, display: 40 },
  space: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40, huge: 56 },
  radius: { sm: 8, md: 16, lg: 24, xl: 28, pill: 999 },
};

export const API = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';
