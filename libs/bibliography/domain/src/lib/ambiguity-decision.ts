import type { CatalogRecordId } from './catalog-record-id.js';

/**
 * What the user decided on an ambiguous book: the work they recognise among the candidates, or
 * that none is it. Added beside the ambiguous attempt, never over it (FR-016).
 */
export type AmbiguityDecision =
  | { readonly kind: 'chosen'; readonly recordId: CatalogRecordId; readonly decidedAt: Date }
  | { readonly kind: 'rejected'; readonly decidedAt: Date };
