/**
 * On/off switch for the clause classifier, read by the extraction engine at the start of
 * each review and by readiness. Turned off by the user (Diagnostics → Settings store keeps
 * this in sync and persists it) or for a whole build with EXPO_PUBLIC_CLAUSE_SORTER=off.
 * Off means the language model sorts every block, exactly as before the classifier.
 */
export const CLASSIFIER_BUILD_OFF = process.env.EXPO_PUBLIC_CLAUSE_SORTER === 'off';

let enabled = !CLASSIFIER_BUILD_OFF;

export const isClassifierEnabled = (): boolean => enabled;

export function setClassifierEnabled(on: boolean): void {
  enabled = on && !CLASSIFIER_BUILD_OFF;
}
