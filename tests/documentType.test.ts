import { describe, expect, it } from '@jest/globals';
import { guessDocumentType } from '@/ai/localEngine';
import type { DocumentPage } from '@/domain/schema';
import { EVAL_CONTRACTS } from './fixtures/contracts';

/** Fictional sentences only — no real contract text. */
function doc(...lines: string[]): DocumentPage[] {
  return [
    {
      number: 1,
      blocks: lines.map((text, i) => ({
        id: `p1_b${i + 1}`,
        page: 1,
        text,
        originalText: text,
        confidence: 1,
        bbox: { x: 0, y: 0, w: 1, h: 0 },
        critical: false,
      })),
    },
  ];
}

describe('document type guess (keyword hit count)', () => {
  it('does not call a services contract "employment" because it says there is no employer-employee relationship', () => {
    const pages = doc(
      'CONSULTANCY SERVICES AGREEMENT',
      'This Agreement is between Habi Crafts Inc. ("Client") and Joel Ramos ("Consultant").',
      'The Consultant shall provide marketing services and submit the deliverables listed in Annex A.',
      'The Consultant is an independent contractor. There is no employer-employee relationship between the Client and the Consultant.',
      'The Consultant is not an employee of the Client and is not entitled to employee benefits.',
    );
    expect(guessDocumentType(pages).type).toBe('service_agreement');
  });

  it('still recognizes a real employment contract', () => {
    const pages = doc(
      'EMPLOYMENT CONTRACT',
      'Liwayway Foods Corp. ("Employer") hires Ana Reyes ("Employee") as a probationary cashier.',
      'The Employee shall receive a monthly salary of PHP 18,000.',
      'The Employer may end the employment for just cause after due process.',
    );
    expect(guessDocumentType(pages).type).toBe('employment');
  });

  it('counts every hit instead of taking the first type that matches', () => {
    // One stray "installment" word early on must not beat a document that is plainly a lease.
    const pages = doc(
      'The first installment of the security deposit is due on signing.',
      'CONTRACT OF LEASE',
      'The Lessor leases the unit to the Lessee for one (1) year.',
      'The Lessee shall pay rent of PHP 9,000 on the 5th of each month.',
      'The Lessee may not sublease the premises.',
    );
    expect(guessDocumentType(pages).type).toBe('lease');
  });

  it('returns "other" on a tie or when nothing matches', () => {
    expect(guessDocumentType(doc('The Lessee will pay by installment.')).type).toBe('other');
    expect(guessDocumentType(doc('Thank you for your purchase.'))).toEqual({ type: 'other', confidence: 0.3 });
  });

  it('never guesses a wrong specific type on the eval set ("other" means the user picks)', () => {
    const guesses = EVAL_CONTRACTS.map((c) => [c.id, c.type, guessDocumentType(c.pages).type] as const);
    expect(guesses.filter(([, want, got]) => got !== want && got !== 'other')).toEqual([]);
    expect(guesses.filter(([, want, got]) => got === want).length).toBeGreaterThanOrEqual(EVAL_CONTRACTS.length - 2);
  });
});
