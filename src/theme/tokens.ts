/**
 * SkimCare design tokens.
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
  canvas: '#F2F4F7',
  mist: '#E6EAF0',
  white: '#FFFFFF',
  quoteBg: '#FFFBF2',
  quoteRule: '#D9B45C',
} as const;

export const colors = {
  bg: palette.canvas,
  surface: palette.white,
  surfaceMuted: palette.slate100,
  border: palette.slate200,
  borderStrong: palette.slate300,
  text: palette.navy800,
  textMuted: palette.slate500,
  textSubtle: palette.slate700,
  textInverse: palette.white,
  // teal700 keeps white button labels above 4.5:1; teal600 falls just short.
  primary: palette.teal700,
  primaryPressed: palette.navy800,
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

export const radius = { sm: 8, md: 12, lg: 16, card: 22, xl: 24, sheet: 34, pill: 999 } as const;

/**
 * Liquid Glass fallbacks. On iOS 26 the system material is used instead
 * (see GlassSurface); these fill in on older iOS, Android and Reduce Transparency.
 */
export const glass = {
  fill: 'rgba(250,251,253,0.72)',
  fillAndroid: 'rgba(250,251,253,0.94)',
  rim: 'rgba(255,255,255,0.7)',
  solid: palette.white,
} as const;

/** Loaded in the root layout; the name encodes the weight. */
export const fonts = {
  sans: {
    400: 'InstrumentSans_400Regular',
    500: 'InstrumentSans_500Medium',
    600: 'InstrumentSans_600SemiBold',
    700: 'InstrumentSans_700Bold',
  },
  serif: {
    400: 'Newsreader_400Regular',
    500: 'Newsreader_500Medium',
    600: 'Newsreader_600SemiBold',
  },
} as const;

/** Minimum touch target per accessibility requirements (PRD §15). */
export const touch = { min: 48 } as const;

/** display, title and quote render in the serif (see AppText); the rest in the sans. */
export const type = {
  display: { fontSize: 36, lineHeight: 41, fontWeight: '500', letterSpacing: -0.6 },
  title: { fontSize: 30, lineHeight: 35, fontWeight: '500', letterSpacing: -0.5 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8 },
  quote: { fontSize: 17, lineHeight: 26, fontWeight: '400' },
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
