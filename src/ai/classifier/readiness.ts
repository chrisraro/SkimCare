/**
 * The readiness row for the clause classifier. It is optional: without it the language
 * model sorts every block (slower, same checks), so this row never decides
 * `offlineReady`. It passes only when the files are present, their checksums match and a
 * test sentence was classified on this device — otherwise it says what is missing.
 */
import type { ReadinessCheck } from '../engines';
import type { ClassifierCheck } from './laya';

const LABEL = 'Clause sorter (optional)';
const FALLBACK = 'Reviews still work: the language model sorts the clauses instead, a little slower.';

export function classifierReadinessCheck(result: ClassifierCheck, where: 'phone' | 'browser'): ReadinessCheck {
  const place = where === 'phone' ? 'on this phone' : 'in this browser';
  if (result.ok) {
    return {
      id: 'classifier',
      label: LABEL,
      status: 'pass',
      detail: `Files verified and a test sentence was sorted ${place} (${result.ms} ms). It decides which blocks need an explanation.`,
    };
  }
  const why: Record<typeof result.problem, string> = {
    not_configured: 'Not set up in this version of the app.',
    disabled: 'Turned off in Diagnostics.',
    missing: `Not downloaded ${place}.`,
    size_mismatch: 'A downloaded file has the wrong size. Download it again.',
    checksum_mismatch: 'A downloaded file does not match its checksum, so it is not used. Download it again.',
    load_failed: `It could not be loaded${result.error ? ` (${result.error})` : ''}.`,
    smoke_failed: `It did not pass its test${result.error ? ` (${result.error})` : ''}, so it is not used.`,
  };
  const damaged = result.problem === 'size_mismatch' || result.problem === 'checksum_mismatch' || result.problem === 'load_failed' || result.problem === 'smoke_failed';
  return { id: 'classifier', label: LABEL, status: damaged ? 'fail' : 'warn', detail: `${why[result.problem]} ${FALLBACK}` };
}
