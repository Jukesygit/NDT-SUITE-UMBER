/**
 * Tests for competency multi-document pure helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeCompetencyDocuments,
  documentsRequireReview,
  toDocumentInputs,
  isMissingCompetencyDocumentsRelationship,
  type NormalizableCompetency,
} from '../competency-documents';
import type { CompetencyDocument } from '../../hooks/queries/usePersonnel';

const childDoc = (
  overrides: Partial<CompetencyDocument> & Pick<CompetencyDocument, 'document_url'>
): CompetencyDocument => ({
  id: `doc-${overrides.document_url}`,
  employee_competency_id: 'ec-1',
  document_name: overrides.document_url,
  position: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// normalizeCompetencyDocuments
// ---------------------------------------------------------------------------
describe('normalizeCompetencyDocuments', () => {
  it('returns an empty list when there is no document at all', () => {
    const competency: NormalizableCompetency = { id: 'ec-1' };
    expect(normalizeCompetencyDocuments(competency)).toEqual([]);
  });

  it('synthesizes a single position-0 doc from legacy scalars when child rows are absent', () => {
    const competency: NormalizableCompetency = {
      id: 'ec-42',
      document_url: 'competency-documents/u1/cert_1.pdf',
      document_name: 'Cert.pdf',
    };
    expect(normalizeCompetencyDocuments(competency)).toEqual([
      {
        id: 'legacy-ec-42',
        employee_competency_id: 'ec-42',
        document_url: 'competency-documents/u1/cert_1.pdf',
        document_name: 'Cert.pdf',
        position: 0,
      },
    ]);
  });

  it('falls back to the url as the name when the legacy name is missing', () => {
    const competency: NormalizableCompetency = {
      id: 'ec-7',
      document_url: 'competency-documents/u1/scan.png',
    };
    const [doc] = normalizeCompetencyDocuments(competency);
    expect(doc.document_name).toBe('competency-documents/u1/scan.png');
  });

  it('returns child rows sorted by position when present', () => {
    const competency: NormalizableCompetency = {
      id: 'ec-1',
      // legacy scalar is ignored once child rows exist
      document_url: 'competency-documents/u1/legacy.pdf',
      documents: [
        childDoc({ document_url: 'b.pdf', position: 2 }),
        childDoc({ document_url: 'a.pdf', position: 0 }),
        childDoc({ document_url: 'c.pdf', position: 1 }),
      ],
    };
    expect(normalizeCompetencyDocuments(competency).map((d) => d.document_url)).toEqual([
      'a.pdf',
      'c.pdf',
      'b.pdf',
    ]);
  });

  it('does not mutate the input documents array', () => {
    const documents = [
      childDoc({ document_url: 'b.pdf', position: 1 }),
      childDoc({ document_url: 'a.pdf', position: 0 }),
    ];
    normalizeCompetencyDocuments({ id: 'ec-1', documents });
    expect(documents.map((d) => d.document_url)).toEqual(['b.pdf', 'a.pdf']);
  });
});

// ---------------------------------------------------------------------------
// toDocumentInputs
// ---------------------------------------------------------------------------
describe('toDocumentInputs', () => {
  it('maps child rows to page-ordered {document_url, document_name} inputs', () => {
    const competency: NormalizableCompetency = {
      id: 'ec-1',
      documents: [
        childDoc({ document_url: 'b.pdf', document_name: 'Back', position: 1 }),
        childDoc({ document_url: 'a.pdf', document_name: 'Front', position: 0 }),
      ],
    };
    expect(toDocumentInputs(competency)).toEqual([
      { document_url: 'a.pdf', document_name: 'Front' },
      { document_url: 'b.pdf', document_name: 'Back' },
    ]);
  });

  it('synthesizes a single input from legacy scalars', () => {
    expect(
      toDocumentInputs({ id: 'ec-2', document_url: 'u/cert.pdf', document_name: 'Cert.pdf' })
    ).toEqual([{ document_url: 'u/cert.pdf', document_name: 'Cert.pdf' }]);
  });

  it('returns an empty array when there is no document', () => {
    expect(toDocumentInputs({ id: 'ec-3' })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// documentsRequireReview
// ---------------------------------------------------------------------------
describe('documentsRequireReview', () => {
  const d = (url: string) => ({ document_url: url });

  it('requires review when a document is added', () => {
    expect(documentsRequireReview([d('a')], [d('a'), d('b')])).toBe(true);
  });

  it('requires review when a document is removed but some remain', () => {
    expect(documentsRequireReview([d('a'), d('b')], [d('a')])).toBe(true);
  });

  it('requires review when the set is replaced', () => {
    expect(documentsRequireReview([d('a'), d('b')], [d('c'), d('d')])).toBe(true);
  });

  it('requires review when adding the first document', () => {
    expect(documentsRequireReview([], [d('a')])).toBe(true);
  });

  it('does not require review for an identical set', () => {
    expect(documentsRequireReview([d('a'), d('b')], [d('a'), d('b')])).toBe(false);
  });

  it('does not require review for a reorder only', () => {
    expect(documentsRequireReview([d('a'), d('b')], [d('b'), d('a')])).toBe(false);
  });

  it('does not require review when all documents are removed (empty next)', () => {
    expect(documentsRequireReview([d('a'), d('b')], [])).toBe(false);
  });

  it('does not require review when both sides are empty', () => {
    expect(documentsRequireReview([], [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMissingCompetencyDocumentsRelationship
// ---------------------------------------------------------------------------
describe('isMissingCompetencyDocumentsRelationship', () => {
  it('is true for the PGRST200 error naming competency_documents', () => {
    expect(
      isMissingCompetencyDocumentsRelationship({
        code: 'PGRST200',
        message:
          "Could not find a relationship between 'employee_competencies' and 'competency_documents' in the schema cache",
      })
    ).toBe(true);
  });

  it('is false when the code is not PGRST200', () => {
    expect(
      isMissingCompetencyDocumentsRelationship({
        code: 'PGRST201',
        message: "mentions 'competency_documents' but wrong code",
      })
    ).toBe(false);
  });

  it('is false when the message names a different relationship', () => {
    expect(
      isMissingCompetencyDocumentsRelationship({
        code: 'PGRST200',
        message:
          "Could not find a relationship between 'employee_competencies' and 'competency_categories' in the schema cache",
      })
    ).toBe(false);
  });

  it('is false when the message is missing or not a string', () => {
    expect(isMissingCompetencyDocumentsRelationship({ code: 'PGRST200' })).toBe(false);
    expect(isMissingCompetencyDocumentsRelationship({ code: 'PGRST200', message: 123 })).toBe(
      false
    );
  });

  it('is false for null, undefined, and non-object inputs', () => {
    expect(isMissingCompetencyDocumentsRelationship(null)).toBe(false);
    expect(isMissingCompetencyDocumentsRelationship(undefined)).toBe(false);
    expect(isMissingCompetencyDocumentsRelationship('PGRST200')).toBe(false);
    expect(isMissingCompetencyDocumentsRelationship(42)).toBe(false);
  });
});
