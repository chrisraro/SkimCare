import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;
type Tone = 'default' | 'muted' | 'subtle' | 'inverse' | 'primary';

const toneColor: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  subtle: colors.textSubtle,
  inverse: colors.textInverse,
  primary: colors.primary,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

export function AppText({ variant = 'body', tone = 'default', center, style, ...rest }: AppTextProps) {
  const base = typeScale[variant] as TextStyle;
  return (
    <Text
      maxFontSizeMultiplier={2}
      style={[base, { color: toneColor[tone] }, center && { textAlign: 'center' }, style]}
      {...rest}
    />
  );
}
