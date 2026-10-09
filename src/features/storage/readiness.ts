import type { ReadinessCheck, ReadinessReport } from '@/ai/engines';
import type { StorageStatus } from './store';

/**
 * Folds the startup storage result into the engine's readiness report (S03), so
 * the "Private storage" check says whether the encrypted database actually opened.
 * A phone that cannot save reviews is not reported offline-ready.
 */
export function withStorageStatus(report: ReadinessReport, status: StorageStatus): ReadinessReport {
  const existing = report.checks.find((c) => c.id === 'storage');
  const base: ReadinessCheck = existing ?? { id: 'storage', label: 'Private storage', status: 'pass', detail: '' };
  const space = base.detail ? `${base.detail} ` : '';

  let check: ReadinessCheck;
  switch (status) {
    case 'encrypted':
      check = { ...base, detail: `${space}Reviews are saved in an encrypted database on this phone.` };
      break;
    case 'unavailable':
      check = { ...base, status: 'fail', detail: "Encrypted storage could not open, so reviews can't be saved on this phone right now." };
      break;
    case 'web':
      check = { ...base, status: 'warn', detail: 'On the web, reviews are kept only until you close the tab.' };
      break;
    case 'pending':
      check = { ...base, status: 'warn', detail: 'Storage is still opening.' };
      break;
  }

  const checks = existing ? report.checks.map((c) => (c.id === 'storage' ? check : c)) : [...report.checks, check];
  return { checks, offlineReady: report.offlineReady && status === 'encrypted' };
}
