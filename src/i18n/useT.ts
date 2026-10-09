import { useCallback } from 'react';
import { useSettings } from '@/features/settings/store';
import { translate, type StringKey } from './strings';

export function useT() {
  const locale = useSettings((s) => s.locale);
  return useCallback((key: StringKey) => translate(locale, key), [locale]);
}
