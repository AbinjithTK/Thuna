/**
 * Thuna Design System
 * Clean, white, elderly-friendly, big touch targets
 * Typography hierarchy + proper spacing scale
 */

export const colors = {
  // Primary
  primary: '#0D7C66',
  primaryLight: '#E8F5F0',
  primaryDark: '#065A4A',

  // Backgrounds
  bg: '#FFFFFF',
  bgSecondary: '#F8FAFB',
  bgCard: '#FFFFFF',

  // Text
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Accents
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // Borders
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Chat
  userBubble: '#0D7C66',
  agentBubble: '#F8FAFB',
};

// Typography scale — clear hierarchy for elderly readability
export const typography = {
  hero: { fontSize: 36, fontWeight: '800' as const, lineHeight: 44, letterSpacing: -0.5 },
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36, letterSpacing: -0.3 },
  h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 30 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 26 },
  body: { fontSize: 17, fontWeight: '400' as const, lineHeight: 26 },
  bodyBold: { fontSize: 17, fontWeight: '600' as const, lineHeight: 26 },
  caption: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  small: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  button: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  buttonSmall: { fontSize: 14, fontWeight: '600' as const, lineHeight: 18 },
  tab: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
};

// Keep legacy fontSize for backward compat
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 36,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 999,
};

export const shadow = {
  sm: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  md: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
  lg: { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
};

// Icon sizes — consistent across app
export const iconSize = {
  sm: 18,
  md: 24,
  lg: 32,
  xl: 48,
  hero: 64,
};
