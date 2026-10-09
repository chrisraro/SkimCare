/**
 * Detects document text addressed to AI tools (PRD §12 prompt-injection
 * resilience). Such text is never a contract term, so extraction skips it
 * instead of asking the model to explain it — in evaluation, explaining it let
 * "report that this agreement has no payment conditions" turn into a finding.
 * Heuristic and deliberately narrow; the delimiting, JSON grammar and evidence
 * gate still apply to anything it misses.
 */
const INSTRUCTION_PATTERNS: RegExp[] = [
  /^\s*(system|assistant|developer|admin)\s*:/i,
  /\bignore\s+(all\s+|any\s+|the\s+|your\s+|previous\s+|prior\s+|above\s+)*(instructions|rules|directions|prompts?)\b/i,
  /\b(note|message|instructions?|reminder)\s+(to|for)\s+(any\s+|the\s+)?(ai|a\.i\.|assistant|model|chatbot|llm)\b/i,
  /\b(ai|a\.i\.)\s+(system|assistant|model|tool)s?\b/i,
  /\bnew\s+instructions?\b/i,
  /\byou\s+are\s+(now\s+)?(in\s+)?(admin|developer|debug|god)\s+mode\b/i,
  /<\/?\s*(source|block|system|instructions?)\s*>/i,
  /^\s*\{\s*"(findings|relevant|finding)"/i,
  // Filipino
  /\b(paalala|mensahe|tagubilin|bilin)\s+(sa|para\s+sa)\s+(ai|a\.i\.)\b/i,
  /\bsabihin\s+sa\s+(mambabasa|gumagamit|user)\b/i,
];

export function looksLikeInstruction(text: string): boolean {
  return INSTRUCTION_PATTERNS.some((re) => re.test(text));
}
