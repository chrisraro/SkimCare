/**
 * PirmaBago design tokens.
 * Palette is derived from the PRD: deep navy for trust/structure, teal for the
 * primary action and "explained from source", warm amber for attention.
 * Status is never conveyed by color alone — every status also has an icon + label.
 */

export const palette = {
  navy900: '#0F1E31',
  navy800: '#14273E',
  navy700: '#1D3654',
  navy500: '#4A6380',
  navy300: '#9AABBF',
  teal700: '#0A6E6C',
  teal600: '#0E8584',
  teal500: '#12A09E',
  teal100: '#DDF2EF',
  teal50: '#EFF8F6',
  amber700: '#8A5A00',
  amber100: '#FCEFD3',
  coral700: '#A2352B',
  coral100: '#FBE4E1',
  slate700: '#3D4A5A',
  slate500: '#647386',
  slate300: '#C7D0DB',
  slate200: '#DEE4EB',
  slate100: '#EEF2F6',
  paper: '#F7F8FA',
  white: '#FFFFFF',
  quoteBg: '#FFFBF2',
  quoteRule: '#D9B45C',
} as const;

export const colors = {
  bg: palette.paper,
  surface: palette.white,
  surfaceMuted: palette.slate100,
  border: palette.slate200,
  borderStrong: palette.slate300,
  text: palette.navy800,
  textMuted: palette.slate500,
  textSubtle: palette.slate700,
  textInverse: palette.white,
  primary: palette.teal600,
  primaryPressed: palette.teal700,
  primarySoft: palette.teal100,
  header: palette.navy800,
  headerMuted: palette.navy300,
  focus: palette.teal500,
  // Source text (contract wording) is styled distinctly from AI interpretation.
  quoteBg: palette.quoteBg,
  quoteRule: palette.quoteRule,
} as const;

/** Finding / check states from PRD §05 and §06. */
export const statusColors = {
  needs_attention: { fg: palette.coral700, bg: palette.coral100 },
  needs_clarification: { fg: palette.amber700, bg: palette.amber100 },
  explained: { fg: palette.teal700, bg: palette.teal100 },
  unable_to_verify: { fg: palette.slate700, bg: palette.slate100 },
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Minimum touch target per accessibility requirements (PRD §15). */
export const touch = { min: 48 } as const;

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8 },
  quote: { fontSize: 16, lineHeight: 25, fontWeight: '400', fontFamily: 'serif' },
} as const;

export const shadow = {
  card: {
    shadowColor: palette.navy900,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
