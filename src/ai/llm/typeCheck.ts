/**
 * Deterministic sanity check on the model's finding type (extract-v4 lost type
 * accuracy: wrong types 29 → 38 on the eval set). When the cited block has none of
 * the wording a type needs — a "late_fee" with no late/penalty/multa, a
 * "payment_amount" with no money, a "due_date" with no date or day — the type is
 * replaced from keyword evidence in the block, or with "other".
 *
 * It only relabels. It never adds an amount, date or text; the finding still goes
 * through the evidence gate afterwards. Types not listed in SUPPORTS are left alone.
 * The eval set checks that no labelled type is ever rejected (tests/typeCheck.test.ts).
 */
import type { FindingType } from '@/domain/schema';
import { moneyMatchesIn } from '../evidenceGate';

const MONTH = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const hasMoney = (text: string) => moneyMatchesIn(text).length > 0;

/** Broad wording a block needs for the type to be plausible at all. */
const SUPPORTS: Partial<Record<FindingType, (text: string) => boolean>> = {
  late_fee: (t) =>
    /\b(?:late|lateness|delay(?:s|ed)?|overdue|past due|penalt(?:y|ies)|surcharges?|interest|missed|unpaid|after the due date|multa|atraso|huli)\b/i.test(t),
  payment_amount: (t) =>
    hasMoney(t) ||
    /\d\s*%|\b(?:percent|price|fees?|deposit|advance|amount|cost|rate|balance|installments?|bayad|halaga|presyo|hulog|upa)\b/i.test(t),
  due_date: (t) =>
    new RegExp(
      `\\b(?:due|deadline|dates?|days?|weeks?|months?|monthly|years?|weekly|daily|within|before|after|upon|until|by the|${MONTH})\\b|\\b\\d{1,2}(?:st|nd|rd|th)\\b|\\bika-?\\d+|\\b(?:araw|petsa|buwan|linggo|tuwing)\\b`,
      'i',
    ).test(t),
  termination: (t) =>
    /\b(?:terminat\w*|cancel\w*|end|ends|ending|ended|expir\w*|rescind\w*|rescission|repossess\w*|disconnect\w*|withdraw\w*|stop\w*|suspend\w*|discontinu\w*|notice|kakanselahin|kanselahin|itigil|ititigil|tapusin|wakasan|umalis|putulin)\b/i.test(
      t,
    ),
  notice_period: (t) => /\b(?:notice|notify|notif\w*|inform\w*|abiso|paunawa|ipaalam)\b/i.test(t),
  party: (t) => /\b(?:between|pagitan|engages?|parties|partido)\b|\(\s*["“][A-Z]/i.test(t),
};

/** Narrow wording strong enough to re-type a contradicted finding, in priority order. */
const STRONG: [FindingType, (text: string) => boolean][] = [
  ['late_fee', (t) => /\b(?:late (?:fee|charge|payment)s?|penalt(?:y|ies)|surcharges?|overdue|multa)\b/i.test(t) || /\blate\b/i.test(t) && hasMoney(t)],
  ['termination', (t) => /\b(?:terminat\w*|cancel\w*|rescind\w*|repossess\w*|end this agreement|end the agreement|kanselahin|kakanselahin|itigil|wakasan)\b/i.test(t)],
  ['notice_period', (t) => /\b(?:days?|weeks?|months?)\b[^.]{0,30}\bnotice\b|\b(?:abiso|paunawa)\b/i.test(t)],
  ['party', (t) => /\b(?:between|pagitan)\b[\s\S]*\(\s*["“][A-Z]/.test(t)],
  ['payment_amount', hasMoney],
  ['due_date', (t) => /\b(?:due|deadline|on or before)\b|\b\d{1,2}(?:st|nd|rd|th)\s+(?:day|of)\b|\bika-?\d+|\btuwing\b/i.test(t)],
];

/** The model's type when the block supports it; otherwise a type from keyword evidence, or "other". */
export function checkFindingType(type: FindingType, text: string): FindingType {
  const supports = SUPPORTS[type];
  if (!supports || supports(text)) return type;
  return STRONG.find(([t, matches]) => t !== type && matches(text))?.[0] ?? 'other';
}
