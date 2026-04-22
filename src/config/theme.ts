export const COLORS = {
  // Primary palette — dark, professional, secure feeling
  primary: '#1a1a2e',
  primaryLight: '#16213e',
  primaryDark: '#0f0f1a',
  accent: '#0f3460',
  accentLight: '#1a5276',

  // Action colors
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // Alert level colors
  alertAttention: '#F59E0B',
  alertWarning: '#F97316',
  alertEmergency: '#EF4444',

  // PTT colors
  pttIdle: '#166534',
  pttIdleGlow: '#22c55e',
  pttTransmitting: '#EF4444',
  pttReceiving: '#10B981',

  // Neutrals
  white: '#FFFFFF',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  black: '#000000',

  // Backgrounds
  background: '#0f0f1a',
  surface: '#1a1a2e',
  surfaceLight: '#16213e',
  card: '#1F2937',

  // Text
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  textInverse: '#111827',

  // Semantic aliases used across screens
  error: '#EF4444',   // alias for danger
  border: '#374151',  // alias for gray700
} as const;

export const TYPOGRAPHY = {
  heading1: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
  },
  heading2: {
    fontSize: 22,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  heading3: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
  },

  // Shorthand aliases (h1/h2/h3) used in qualification/training screens
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '600' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BORDER_RADIUS = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;
