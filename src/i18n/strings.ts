/**
 * UI copy in English and Filipino. Primary labels avoid legal jargon (PRD §08)
 * and follow the language style guide in PRD §15.
 */
const en = {
  appName: 'SkimCare',
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
    'SkimCare helps you understand an agreement before you sign. It reads your document on this phone — nothing is uploaded.',
  welcome_point_local: 'Everything stays on this phone',
  welcome_point_local_body: 'No account. No cloud. Works in airplane mode once set up.',
  privacy_mlkit:
    'Text recognition uses Google ML Kit, running on this phone. Your document never leaves it. When the phone is online, ML Kit may send Google usage statistics (device and app info, error codes) — never document text.',
  add_pick_failed: 'The file picker could not open. Close any other picker and try again.',
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

  // Model download (phone). {placeholders} are filled by fmt().
  md_label: 'LANGUAGE MODEL',
  md_body:
    'The AI runs on this phone. It needs the {model} model (≈{size} MB), downloaded once from Hugging Face. Only the model file is downloaded — your documents never leave this phone.',
  md_download: 'Download the model (≈{size} MB, once)',
  md_confirm_title: 'Download the model?',
  md_confirm_body:
    'This downloads about {size} MB, once. Use Wi-Fi if you can — on mobile data it can use up your load. Only the model file is downloaded; your documents stay on this phone.',
  md_confirm_ok: 'Download',
  md_starting: 'Starting the download…',
  md_progress: 'Downloading · {pct}% · {done} of {total} MB',
  md_speed: '{speed} MB/s',
  md_waiting: 'Paused · waiting for an internet connection',
  md_background_system: 'You can leave this screen or the app. The download keeps going and shows in your notifications.',
  md_background_app: 'You can leave this screen. Keep the app open until the download finishes.',
  md_verifying: 'Downloaded · checking the file (checksum)…',
  md_done: 'Installed · the checksum matches. The checks below run again.',
  md_canceled: 'Download canceled · nothing was installed.',
  md_cancel: 'Cancel download',
  md_retry: 'Try the download again',
  md_import_instead: 'Import a file instead',
  md_import_hide: 'Hide file import',
  md_failed: 'Download not finished',
  md_fail_no_space: 'Not enough free space: the download needs about {need} MB and the phone has {free} MB free.',
  md_fail_network: 'The connection dropped. Check your internet and try again.',
  md_fail_server: 'The download server did not send the file. Try again later.',
  md_fail_storage: 'The file could not be saved on this phone.',
  md_fail_removed: 'The download was stopped outside the app.',
  md_fail_size: 'The downloaded file is incomplete, so it was removed. Try again.',
  md_fail_checksum: 'The downloaded file does not match the expected model (checksum differs), so it was removed.',
  md_fail_check: 'The downloaded file could not be checked, so it was removed. Try again.',
  md_fail_install: 'The file could not be moved into place. Try again.',
  md_fail_unknown: 'Something went wrong. Try again.',
  md_pill_downloading: 'Model {pct}%',
  md_pill_verifying: 'Checking model',
  md_pill_failed: 'Model download stopped',

  // Home
  home_greeting: 'Kumusta!',
  home_title: 'What are you about to sign?',
  home_start: 'Start a review',
  home_start_body: 'Scan pages or import a PDF',
  home_recent: 'Recent reviews',
  home_empty: 'No reviews yet. Your reviews are saved privately on this phone.',
  home_offline: 'Offline · on-device',
  home_not_ready: 'Offline check needed',
  home_install_ios: 'Install SkimCare: tap Share, then Add to Home Screen. It then opens offline.',
  home_install_dismiss: 'Got it',
  home_supported: 'Best for: freelance/service agreements and simple installment agreements.',

  // Capture flow
  add_title: 'Add your document',
  add_camera: 'Scan pages',
  add_camera_body: 'Finds page edges and straightens each page',
  add_gallery: 'Choose images',
  add_gallery_body: 'Pick page photos from your gallery',
  add_pdf: 'Import PDF',
  add_pdf_body: 'Digital or scanned PDFs saved on this phone',
  add_sample: 'Try a sample agreement',
  add_sample_body: 'Fictional contracts for practice',
  add_privacy: 'Files are opened through the system picker. SkimCare cannot see your other files.',

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
  overview_rejected_one: 'output was discarded because it did not match the document.',
  overview_rejected_other: 'outputs were discarded because they did not match the document.',
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
    'SkimCare is a document comprehension and legal-information aid. It is not legal advice, a licensed attorney, a contract certification service, or an instruction to sign or refuse any document.',
  settings_diagnostics: 'Inference diagnostics',
  settings_storage_encrypted: 'Reviews are saved encrypted on this phone and stay until you delete them.',
  settings_storage_unavailable: "Reviews can't be saved on this phone right now. They will be gone when you close the app.",
  settings_storage_web: 'On the web, reviews are kept only until you close the tab.',

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
  md_label: 'LANGUAGE MODEL',
  md_body:
    'Sa phone na ito tumatakbo ang AI. Kailangan nito ang {model} model (≈{size} MB), na ida-download nang isang beses mula sa Hugging Face. Ang model file lang ang dina-download — hindi lumalabas ng phone ang mga dokumento mo.',
  md_download: 'I-download ang model (≈{size} MB, isang beses)',
  md_confirm_title: 'I-download ang model?',
  md_confirm_body:
    'Mga {size} MB ang ida-download, isang beses lang. Gumamit ng Wi-Fi kung puwede — baka maubos ang load mo sa mobile data. Ang model file lang ang dina-download; nananatili sa phone ang mga dokumento mo.',
  md_confirm_ok: 'I-download',
  md_starting: 'Sinisimulan ang download…',
  md_progress: 'Dina-download · {pct}% · {done} sa {total} MB',
  md_waiting: 'Naka-pause · naghihintay ng internet',
  md_background_system: 'Puwede mong iwan ang screen o ang app. Tuloy ang download at makikita ito sa notifications.',
  md_background_app: 'Puwede mong iwan ang screen na ito. Panatilihing bukas ang app hanggang matapos ang download.',
  md_verifying: 'Na-download na · sinusuri ang file (checksum)…',
  md_done: 'Na-install na · tugma ang checksum. Uulitin ang mga check sa ibaba.',
  md_canceled: 'Kinansela ang download · walang na-install.',
  md_cancel: 'Kanselahin ang download',
  md_retry: 'Subukan ulit ang download',
  md_import_instead: 'Mag-import na lang ng file',
  md_import_hide: 'Itago ang pag-import',
  md_failed: 'Hindi natapos ang download',
  md_fail_no_space: 'Kulang ang espasyo: mga {need} MB ang kailangan at {free} MB lang ang bakante sa phone.',
  md_fail_network: 'Naputol ang koneksyon. I-check ang internet at subukan ulit.',
  md_fail_server: 'Hindi naipadala ng server ang file. Subukan ulit mamaya.',
  md_fail_storage: 'Hindi ma-save ang file sa phone na ito.',
  md_fail_removed: 'Itinigil ang download sa labas ng app.',
  md_fail_size: 'Kulang ang na-download na file kaya binura ito. Subukan ulit.',
  md_fail_checksum: 'Hindi tugma ang na-download na file sa inaasahang model (iba ang checksum) kaya binura ito.',
  md_fail_check: 'Hindi masuri ang na-download na file kaya binura ito. Subukan ulit.',
  md_fail_install: 'Hindi mailipat sa tamang lugar ang file. Subukan ulit.',
  md_fail_unknown: 'May nagkaproblema. Subukan ulit.',
  md_pill_downloading: 'Model {pct}%',
  md_pill_verifying: 'Sinusuri ang model',
  md_pill_failed: 'Huminto ang download',
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
    'Tinutulungan ka ng SkimCare na maunawaan ang kasunduan bago pumirma. Sa phone na ito binabasa ang dokumento — walang ina-upload.',
  welcome_point_local: 'Nananatili ang lahat sa phone na ito',
  welcome_point_local_body: 'Walang account. Walang cloud. Gumagana kahit naka-airplane mode.',
  privacy_mlkit:
    'Ang pagbasa ng teksto ay gamit ang Google ML Kit, na tumatakbo sa phone na ito. Hindi lumalabas ang dokumento mo. Kapag online ang phone, maaaring magpadala ang ML Kit sa Google ng usage statistics (impormasyon ng device at app, error codes) — hindi kailanman ang teksto ng dokumento.',
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
  home_not_ready: 'Kailangang i-check offline',
  home_install_ios: 'I-install ang SkimCare: i-tap ang Share, tapos Add to Home Screen. Bubukas na ito kahit offline.',
  home_install_dismiss: 'Sige',
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
  settings_storage_encrypted:
    'Naka-encrypt ang mga naka-save na review sa phone na ito at mananatili hanggang burahin mo.',
  settings_storage_unavailable:
    'Hindi pa maise-save ang mga review sa phone na ito ngayon. Mawawala ang mga ito pagsara mo ng app.',
  settings_storage_web: 'Sa web, nananatili lang ang mga review hanggang isara mo ang tab.',
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

/** Fills `{name}` placeholders, e.g. fmt(t('md_download'), { size: 380 }). */
export function fmt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
