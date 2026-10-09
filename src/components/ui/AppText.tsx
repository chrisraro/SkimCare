import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts, type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;
type Tone = 'default' | 'muted' | 'subtle' | 'inverse' | 'primary';

const toneColor: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  subtle: colors.textSubtle,
  inverse: colors.textInverse,
  primary: colors.primary,
};

/** Headlines and contract wording use the serif; everything else the sans. */
const SERIF: readonly Variant[] = ['display', 'title', 'quote'];

/** Custom fonts carry their weight in the family name, so resolve it here. */
function fontFamilyFor(serif: boolean, weight: TextStyle['fontWeight']) {
  const w = weight === 'bold' ? 700 : weight == null || weight === 'normal' ? 400 : Number(weight);
  if (serif) return w >= 600 ? fonts.serif[600] : w >= 500 ? fonts.serif[500] : fonts.serif[400];
  return w >= 700 ? fonts.sans[700] : w >= 600 ? fonts.sans[600] : w >= 500 ? fonts.sans[500] : fonts.sans[400];
}

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

export function AppText({ variant = 'body', tone = 'default', center, style, ...rest }: AppTextProps) {
  const base = typeScale[variant] as TextStyle;
  const weight = StyleSheet.flatten([base, style])?.fontWeight;
  const fontFamily = fontFamilyFor(SERIF.includes(variant), weight);
  return (
    <Text
      maxFontSizeMultiplier={2}
      style={[base, { color: toneColor[tone] }, center && { textAlign: 'center' }, style, { fontFamily, fontWeight: 'normal' }]}
      {...rest}
    />
  );
}
