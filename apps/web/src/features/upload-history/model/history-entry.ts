/**
 * One upload of the history, as the screen reads it (specs/002-upload-history, data-model.md).
 *
 * A local copy of the API contract, on purpose: `apps/web` may not import the `scope:api` libs,
 * and a slice does not import another (research.md §11). `model/` and `api/` carry no text — an
 * outcome is a kind, which the interface words from its catalog (ADR 0011).
 */

/** The four outcomes a user can tell apart (FR-005). */
export type HistoryOutcome =
  | { readonly kind: 'books'; readonly count: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'notStarted' };

export interface HistoryEntry {
  /** Builds `#/historique/{id}` and the URLs of the images. */
  readonly id: string;
  /** When the photo was sent, to be shown in the user's own date and time. */
  readonly sentAt: Date;
  readonly outcome: HistoryOutcome;
  /** `false`: a neutral indicator, with no request for an image that is not there (FR-008). */
  readonly hasThumbnail: boolean;
}

/** An item of `GET /shelf-photos`, as it travels (contracts §1). */
export interface WireSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly outcome: 'completed' | 'failed' | 'pending';
  /** Present when the analysis completed — 0 meaning « no book detected ». */
  readonly bookCount?: number;
  readonly hasThumbnail: boolean;
}

export const OUTCOMES: readonly WireSummary['outcome'][] = ['completed', 'failed', 'pending'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isOutcome(value: unknown): value is WireSummary['outcome'] {
  return OUTCOMES.some((outcome) => outcome === value);
}

/** An ISO date the browser can read: what the API says a date is. */
export function isDateText(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

/**
 * Whether a parsed JSON value is a summary of the contract. A completed analysis without its book
 * count cannot be shown, so it is refused with the rest: the body is trusted whole or not at all.
 */
export function isWireSummary(value: unknown): value is WireSummary {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    !isDateText(value['createdAt']) ||
    !isOutcome(value['outcome']) ||
    typeof value['hasThumbnail'] !== 'boolean'
  ) {
    return false;
  }

  return value['outcome'] !== 'completed' || isCount(value['bookCount']);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function toHistoryEntry(summary: WireSummary): HistoryEntry {
  return {
    id: summary.id,
    sentAt: new Date(summary.createdAt),
    outcome: outcomeOf(summary),
    hasThumbnail: summary.hasThumbnail,
  };
}

function outcomeOf(summary: WireSummary): HistoryOutcome {
  switch (summary.outcome) {
    case 'completed': {
      const count = summary.bookCount ?? 0;

      return count > 0 ? { kind: 'books', count } : { kind: 'none' };
    }
    case 'failed': {
      return { kind: 'failed' };
    }
    case 'pending': {
      return { kind: 'notStarted' };
    }
    default: {
      const unhandled: never = summary.outcome;

      return unhandled;
    }
  }
}
