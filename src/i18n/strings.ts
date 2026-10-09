/**
 * UI copy in English and Filipino. Primary labels avoid legal jargon (PRD §08)
 * and follow the language style guide in PRD §15.
 */
const en = {
  appName: 'PirmaBago',
  tagline: 'Understand what you are signing.',
  promise: 'Unawain bago pirmahan.',

  // Status labels (PRD §05 / §15)
  status_needs_attention: 'Needs attention',
  status_needs_clarification: 'Needs clarification',
  status_explained: 'Explained from source',
  status_unable_to_verify: 'Cannot verify',

  viewSource: 'View source',
  whatIf: 'What if…?',
  checkUnderstanding: 'Check understanding',
  questionsToAsk: 'Questions to ask',

  // Welcome
  welcome_title: 'Read it. Understand it. Then decide.',
  welcome_body:
    'PirmaBago helps you understand an agreement before you sign. It reads your document on this phone — nothing is uploaded.',
  welcome_point_local: 'Everything stays on this phone',
  welcome_point_local_body: 'No account. No cloud. Works in airplane mode once set up.',
  welcome_point_source: 'Every finding shows its source',
  welcome_point_source_body: 'Tap any finding to see the exact sentence it came from.',
  welcome_point_limits: 'Not legal advice',
  welcome_point_limits_body:
    'It explains what the document says. It does not say whether a clause is legal or whether you should sign.',
  welcome_cta: 'I understand — continue',

  // Readiness
  readiness_title: 'On-device AI check',
  readiness_body: 'Checking what is installed on this phone. We will not claim offline readiness unless every check passes.',
  readiness_ready: 'Ready to work offline',
  readiness_not_ready: 'Not fully ready for offline use',
  readiness_demo_note:
    'You are using the Demo engine. It shows sample findings so you can explore the app. It does not read your document.',
  readiness_continue: 'Continue',
  readiness_recheck: 'Run checks again',

  // Home
  home_greeting: 'Kumusta!',
  home_title: 'What are you about to sign?',
  home_start: 'Start a review',
  home_start_body: 'Scan pages or import a PDF',
  home_recent: 'Recent reviews',
  home_empty: 'No reviews yet. Your reviews are saved privately on this phone.',
  home_offline: 'Offline · on-device',
  home_supported: 'Best for: freelance/service agreements and simple installment agreements.',

  // Capture flow
  add_title: 'Add your document',
  add_camera: 'Scan pages',
  add_camera_body: 'Finds page edges and straightens each page',
  add_gallery: 'Choose images',
  add_gallery_body: 'Pick page photos from your gallery',
  add_pdf: 'Import PDF',
  add_pdf_body: 'Digital PDFs are read exactly, no scanning needed',
  add_sample: 'Try a sample agreement',
  add_sample_body: 'Fictional contracts for practice',
  add_privacy: 'Files are opened through the system picker. PirmaBago cannot see your other files.',

  capture_title: 'Capture pages',
  preview_title: 'Check your pages',
  preview_body: 'Drag order is top to bottom. Retake any blurry page before continuing.',
  preview_confirm: 'Read the text',
  preview_reading: 'Reading text on this phone…',

  verify_title: 'Check the important details',
  verify_body:
    'Amounts, dates and names matter most. Confirm each one matches the paper, or fix it. Findings will only use confirmed values.',
  verify_looks_right: 'Matches the paper',
  verify_edit: 'Fix text',
  verify_low_conf: 'Hard to read',
  verify_continue: 'Continue',

  prefs_title: 'What kind of agreement is this?',
  prefs_detected: 'Detected',
  prefs_language: 'Explain in',
  prefs_limited: 'Limited support — reading help only, not a full review.',
  prefs_start: 'Start review',

  processing_title: 'Reviewing on this phone',
  processing_body: 'This can take up to a minute. You can keep the screen on; nothing is being uploaded.',
  processing_cancel: 'Cancel',

  // Overview / review
  overview_terms: 'Terms found',
  overview_clarify: 'To clarify',
  overview_unverified: 'Cannot verify',
  overview_findings: 'Findings',
  overview_next: 'Next steps',
  overview_rejected: 'outputs were discarded because they did not match the document.',
  overview_stale: 'You edited the text after this review. Some findings may be out of date.',
  overview_rerun: 'Review again',
  overview_incomplete: 'Some pages could not be read. This review is incomplete.',

  finding_source: 'What the document says',
  finding_meaning: 'What this means',
  finding_unknown: 'What the document does not say',
  finding_questions: 'Questions you could ask',
  finding_ai_label: 'Explanation by the on-device model — not contract text',

  terms_title: 'Terms & obligations',
  terms_all: 'All',

  source_title: 'Original page',
  source_correct: 'Correct this text',
  source_save: 'Save correction',

  whatif_title: 'What if…?',
  whatif_body: 'Scenarios only use rules written in your agreement. Math is calculated exactly, not by the AI.',
  whatif_late: 'What if I pay one installment late?',
  whatif_insufficient: 'Not enough information',
  whatif_inputs: 'Values from your agreement',
  whatif_result: 'Result',
  whatif_assumptions: 'Assumptions',
  whatif_confirm: 'Confirm value',
  whatif_none: 'This agreement has no supported scenario yet. You can still save a question about it.',

  check_title: 'Check understanding',
  check_body: 'A quick way to see if the key points are clear. This is not a test.',
  check_supported: 'Supported by the document',
  check_review: 'Worth another look',
  check_cannot: 'Cannot determine',
  check_next: 'Next question',
  check_done: 'Done',
  check_summary: 'You matched the document on',

  questions_title: 'Questions to ask',
  questions_body: 'Bring these to the other party or a qualified professional before signing.',
  questions_add: 'Add your own question',
  questions_copy: 'Copy all',
  questions_copied: 'Copied',

  docs_title: 'My documents',
  docs_search: 'Search your reviews',
  docs_empty: 'Nothing saved yet.',
  docs_delete: 'Delete',
  docs_rename: 'Rename',
  docs_delete_confirm: 'Delete this review and all its pages? This cannot be undone.',

  settings_title: 'Settings',
  settings_language: 'Language',
  settings_model: 'On-device AI',
  settings_storage: 'Storage & privacy',
  settings_erase: 'Erase all documents',
  settings_erase_confirm: 'Erase every saved document, page and review from this phone?',
  settings_disclaimer:
    'PirmaBago is a document comprehension and legal-information aid. It is not legal advice, a licensed attorney, a contract certification service, or an instruction to sign or refuse any document.',
  settings_diagnostics: 'Inference diagnostics',

  demo_banner: 'Demo engine — showing sample findings, not your document.',
  cancel: 'Cancel',
  save: 'Save',
  delete: 'Delete',
  back: 'Back',
  done: 'Done',
  page: 'Page',
};

export type StringKey = keyof typeof en;

const fil: Partial<Record<StringKey, string>> = {
  tagline: 'Unawain ang pinipirmahan mo.',
  status_needs_attention: 'Bigyang-pansin',
  status_needs_clarification: 'Kailangan pang linawin',
  status_explained: 'Ipinaliwanag mula sa dokumento',
  status_unable_to_verify: 'Hindi matukoy sa dokumento',
  viewSource: 'Tingnan ang nakasulat',
  whatIf: 'Ano ang mangyayari kung…?',
  checkUnderstanding: 'Naintindihan ko ba?',
  questionsToAsk: 'Mga tanong bago pumirma',
  welcome_title: 'Basahin. Unawain. Saka magpasya.',
  welcome_body:
    'Tinutulungan ka ng PirmaBago na maunawaan ang kasunduan bago pumirma. Sa phone na ito binabasa ang dokumento — walang ina-upload.',
  welcome_point_local: 'Nananatili ang lahat sa phone na ito',
  welcome_point_local_body: 'Walang account. Walang cloud. Gumagana kahit naka-airplane mode.',
  welcome_point_source: 'May pinanggalingan ang bawat paliwanag',
  welcome_point_source_body: 'I-tap ang anumang natuklasan para makita ang eksaktong pangungusap.',
  welcome_point_limits: 'Hindi ito legal advice',
  welcome_point_limits_body:
    'Ipinapaliwanag nito ang sinasabi ng dokumento. Hindi nito sinasabi kung legal ang probisyon o kung dapat kang pumirma.',
  welcome_cta: 'Naiintindihan ko — tuloy',
  home_title: 'Ano ang pipirmahan mo?',
  home_start: 'Magsimula ng review',
  home_start_body: 'Kunan ng litrato o mag-import ng PDF',
  home_recent: 'Mga huling review',
  home_offline: 'Offline · nasa phone',
  add_title: 'Idagdag ang dokumento',
  add_camera: 'I-scan ang mga pahina',
  add_gallery: 'Pumili ng larawan',
  add_pdf: 'Mag-import ng PDF',
  add_sample: 'Subukan ang halimbawang kasunduan',
  verify_title: 'Suriin ang mahahalagang detalye',
  verify_looks_right: 'Tugma sa papel',
  verify_edit: 'Itama',
  processing_title: 'Sinusuri sa phone na ito',
  finding_source: 'Ang nakasulat sa dokumento',
  finding_meaning: 'Ang ibig sabihin',
  finding_unknown: 'Ang hindi sinasabi ng dokumento',
  finding_questions: 'Mga puwedeng itanong',
  whatif_title: 'Ano ang mangyayari kung…?',
  whatif_insufficient: 'Kulang ang impormasyon',
  check_title: 'Naintindihan ko ba?',
  check_supported: 'Suportado ng dokumento',
  check_review: 'Balikan muli',
  check_cannot: 'Hindi matukoy',
  questions_title: 'Mga tanong bago pumirma',
  docs_title: 'Aking mga dokumento',
  settings_title: 'Mga setting',
  demo_banner: 'Demo engine — halimbawang resulta, hindi ang iyong dokumento.',
  cancel: 'Kanselahin',
  save: 'I-save',
  delete: 'Burahin',
  back: 'Bumalik',
  done: 'Tapos',
  page: 'Pahina',
};

export const STRINGS = { en, fil } as const;
export type Locale = keyof typeof STRINGS;

export function translate(locale: Locale, key: StringKey): string {
  return (locale === 'fil' ? fil[key] : undefined) ?? en[key];
}
