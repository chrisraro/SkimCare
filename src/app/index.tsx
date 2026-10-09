import { Redirect } from 'expo-router';
import { useSettings } from '@/features/settings/store';

/** S01 Launch — route to onboarding on first use, otherwise Home. */
export default function Launch() {
  const onboarded = useSettings((s) => s.onboarded);
  return <Redirect href={onboarded ? '/(tabs)' : '/welcome'} />;
}
