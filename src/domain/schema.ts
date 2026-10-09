/**
 * Domain model — PRD §12 (inference contract) and §13 (local data model).
 * Provenance graph: Document → DocumentPage → OcrBlock → EvidenceRef → Finding.
 * Every LLM output is parsed through these schemas before it can reach the UI.
 */
import { z } from 'zod';

export const DocumentType = z.enum(['service_agreement', 'installment_agreement', 'employment', 'lease', 'other']);
/** H1 fully supports only the first two families (PRD §02 coverage decision). */
export const FULLY_SUPPORTED_TYPES: readonly DocumentType[] = ['service_agreement', 'installment_agreement'];

export const ReviewStatus = z.enum(['needs_attention', 'needs_clarification', 'explained', 'unable_to_verify']);

export const FindingType = z.enum([
  'payment_condition',
  'payment_amount',
  'due_date',
  'late_fee',
  'deliverables',
  'revisions',
  'ownership',
  'termination',
  'notice_period',
  'party',
  'other',
]);

export const OcrBlock = z.object({
  id: z.string(), // e.g. "p3_b12"
  page: z.number().int().positive(),
  text: z.string(),
  /** Original OCR text, kept for audit when the user corrects a block. */
  originalText: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  /** True when the block contains money/date/party tokens that need user verification. */
  critical: z.boolean().default(false),
  correctedAt: z.string().optional(),
  /** Set when the user confirmed this block reads correctly (S08). */
  verifiedAt: z.string().optional(),
});

export const DocumentPage = z.object({
  number: z.number().int().positive(),
  uri: z.string().optional(),
  blocks: z.array(OcrBlock),
});

export const EvidenceRef = z.object({
  page: z.number().int().positive(),
  blockId: z.string(),
  quote: z.string().min(1),
});

export const Finding = z.object({
  id: z.string(),
  type: FindingType,
  title: z.string(),
  normalizedValue: z.string().optional(),
  evidence: EvidenceRef.optional(),
  explanation: z.string(),
  uncertainty: z.string().optional(),
  reviewStatus: ReviewStatus,
  questions: z.array(z.string()).default([]),
});

export const ExtractedFact = z.object({
  id: z.string(),
  key: z.enum(['installment_amount', 'due_day', 'late_fee_fixed', 'party_name', 'total_price', 'term_months']),
  value: z.union([z.number(), z.string()]),
  evidence: EvidenceRef,
  confirmedByUser: z.boolean().default(false),
});

export const ScenarioResult = z.object({
  id: z.string(),
  ruleId: z.string(),
  status: z.enum(['computed', 'insufficient_information']),
  inputs: z.array(z.object({ label: z.string(), value: z.string(), factId: z.string().optional() })),
  outputs: z.array(z.object({ label: z.string(), value: z.string() })),
  assumptions: z.array(z.string()),
  evidence: z.array(EvidenceRef),
});

export const ComprehensionItem = z.object({
  id: z.string(),
  prompt: z.string(),
  choices: z.array(z.object({ id: z.string(), label: z.string() })),
  supportedChoiceId: z.string().optional(),
  evidence: EvidenceRef,
  userChoiceId: z.string().optional(),
});

export const ClarificationQuestion = z.object({
  id: z.string(),
  text: z.string(),
  findingId: z.string().optional(),
  evidence: EvidenceRef.optional(),
  edited: z.boolean().default(false),
});

export const AnalysisRun = z.object({
  id: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  engine: z.object({
    kind: z.enum(['demo', 'local']),
    modelName: z.string(),
    modelChecksum: z.string().optional(),
    promptVersion: z.string(),
  }),
  sourceHash: z.string(),
  ocrRevision: z.number().int().nonnegative(),
  findings: z.array(Finding),
  facts: z.array(ExtractedFact),
  comprehension: z.array(ComprehensionItem),
  questions: z.array(ClarificationQuestion),
  /** Count of LLM outputs rejected by the evidence gate. */
  rejectedCount: z.number().int().nonnegative(),
  coverage: z.object({ pagesRead: z.number(), pagesTotal: z.number(), incomplete: z.boolean() }),
});

export const DocumentRecord = z.object({
  id: z.string(),
  title: z.string(),
  type: DocumentType,
  language: z.enum(['en', 'fil', 'mixed']),
  createdAt: z.string(),
  updatedAt: z.string(),
  pages: z.array(DocumentPage),
  ocrRevision: z.number().int().nonnegative(),
  analysis: AnalysisRun.optional(),
  /** Set when OCR was edited after analysis — dependent findings are stale (PRD §05). */
  analysisStale: z.boolean().default(false),
});

/* eslint-disable @typescript-eslint/no-redeclare -- Zod pattern: schema value and inferred type share a name */
export type DocumentType = z.infer<typeof DocumentType>;
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export type FindingType = z.infer<typeof FindingType>;
export type OcrBlock = z.infer<typeof OcrBlock>;
export type DocumentPage = z.infer<typeof DocumentPage>;
export type EvidenceRef = z.infer<typeof EvidenceRef>;
export type Finding = z.infer<typeof Finding>;
export type ExtractedFact = z.infer<typeof ExtractedFact>;
export type ScenarioResult = z.infer<typeof ScenarioResult>;
export type ComprehensionItem = z.infer<typeof ComprehensionItem>;
export type ClarificationQuestion = z.infer<typeof ClarificationQuestion>;
export type AnalysisRun = z.infer<typeof AnalysisRun>;
export type DocumentRecord = z.infer<typeof DocumentRecord>;

export const TYPE_LABELS: Record<DocumentType, string> = {
  service_agreement: 'Freelance / service agreement',
  installment_agreement: 'Installment agreement',
  employment: 'Employment contract',
  lease: 'Residential lease',
  other: 'Other agreement',
};
