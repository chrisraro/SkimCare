/**
 * Deterministic prefilter: decides in code which blocks can carry a finding, so
 * only those cost a model call (each call is seconds on a phone). A block goes to
 * the model when it has any term signal: a number, money, a date or duration, a
 * deadline word, a penalty/termination/renewal word, an obligation or permission
 * verb (shall, must, may, dapat, kailangan…), a party/role word, ownership,
 * delivery or notice. Amounts, dates and party lines (`isCriticalText`) are never
 * skipped. Skipped blocks are not removed: they stay in the document and in the
 * source viewer, they just are not asked about.
 *
 * Deliberately loose (recall first): it only drops text with none of these signals,
 * such as "This Agreement is governed by the laws of the Philippines." or
 * "WHEREAS, the Company is engaged in the bakery business." The eval set checks
 * that no labelled term is skipped (tests/evalSet.test.ts, tests/prefilter.test.ts).
 */
import { isCriticalText } from '../textBlocks';

const TERM_SIGNALS: RegExp[] = [
  // Any digit: amounts, counts "(3)", percentages, days, dates, clause-internal numbers.
  /\d/,
  /%|\bpercent\b|\bporsiyento\b|\bkalahati\b/i,
  // Money and payment (EN + FIL).
  /\b(?:pay\w*|paid|fees?|price\w*|costs?|charges?|charged|deposit\w*|advance|down\s?payment|balance|install?ments?|amorti[sz]ations?|interest|rates?|refund\w*|reimburs\w*|invoices?|bill(?:s|ed|ing)?|tax(?:es)?|salary|wages?|rent(?:al)?|upa|bayad|babayaran|magbabayad|binabayaran|hulog|utang|singil|deposito|multa|interes|presyo|halaga)\b/i,
  // Time, dates, deadlines.
  /\b(?:days?|weeks?|months?|monthly|years?|yearly|annual\w*|daily|weekly|dates?|deadlines?|due|within|before|after|until|upon|prior|later|immediately|weekdays?|hours?|araw|linggo|buwan|buwanang|taon|petsa|bago|pagkatapos|hanggang|loob)\b/i,
  // Number words used for counts and durations.
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety|hundred|thousand|half|isa|dalawa|tatlo|apat|lima|anim|pito|walo|siyam|sampu)\b/i,
  // Late, penalties, ending, renewal.
  /\b(?:late|delay\w*|penalt(?:y|ies)|surcharge|forfeit\w*|terminat\w*|cancel\w*|kanselahin|rescind\w*|rescission|renew\w*|extend\w*|extension|expir\w*|breach\w*|default\w*|repossess\w*|suspend\w*|withh[eo]ld\w*|disconnect\w*|itigil|tapusin|ends?|ended)\b/i,
  // Obligations and permissions.
  /\b(?:shall|must|will|may|might|agrees?|agreed|required?|requires|responsible|liab(?:le|ility)|entitled|obligat\w*|warrant\w*|guarantee\w*|cannot|not allowed|prohibit\w*|dapat|kailangan|kailangang|maaari|maaaring|pwede|puwede|bawal|mananagot|sasagutin)\b/i,
  // Parties (a defined name like ("Client"), "between", "engages"), ownership, delivery, notice, revisions.
  // Role nouns alone ("the Owner operates a bakery") are not a signal: recitals are full of them.
  /\(\s*["“'‘][A-Z]/,
  /\b(?:between|part(?:y|ies)|engages?|engaged to|pagitan|owns?|owned|ownership|property|title|transfer\w*|pag-aari|deliver\w*|provide\w*|perform\w*|services?|notice|notif\w*|abiso|paunawa|revisions?|rebisyon)\b/i,
];

/** True when a block has any signal that it could state a term (see the file comment). */
export function mayStateTerm(text: string): boolean {
  return isCriticalText(text) || TERM_SIGNALS.some((re) => re.test(text));
}
