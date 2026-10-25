import type { AuthorityId } from './authority-id.js';
import type { CatalogRecord } from './catalog-record.js';
import type { MatchScore } from './match-score.js';

/** A record examined by the matching rule, with the marks it earned. */
export interface ScoredRecord {
  readonly record: CatalogRecord;
  readonly titleScore: MatchScore;
  /** Absent when no author was read. */
  readonly authorScore: MatchScore | undefined;
  /** The combined score (research §5.6). */
  readonly score: MatchScore;
  /** 1 is the best; retained records come first, examined ones follow without a gap. */
  readonly rank: number;
  /** A candidate, or the record a confirmed verdict rests on. */
  readonly retained: boolean;
}

/**
 * A record whose title matched but whose author did not, with the authorities of its authors: the
 * application may fetch their rejected forms before the record is discarded (research §5.4).
 */
export interface AuthorityCheck {
  readonly record: CatalogRecord;
  readonly authorityIds: readonly AuthorityId[];
}

interface Examination {
  /** The records examined and **not** retained, best first, a few of them (research §9). */
  readonly examined: readonly ScoredRecord[];
  readonly needsAuthorityCheck: readonly AuthorityCheck[];
}

/** What `matchBook` decides about one book against a page of records. */
export type MatchOutcome = Examination &
  (
    | {
        readonly verdict: 'confirmed';
        /** The representative record of the single work (research §5.7). */
        readonly retained: ScoredRecord;
      }
    | {
        readonly verdict: 'ambiguous';
        /** One record per work, best first. */
        readonly candidates: readonly ScoredRecord[];
        /** True when the doubt comes from a segment of the title the record does not explain. */
        readonly partial: boolean;
      }
    | { readonly verdict: 'not_found' }
  );
