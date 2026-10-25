/**
 * Why a reconciliation could not be asked for or read (specs/003, data-model.md): a kind, never a
 * sentence (ADR 0011). In every case the books stay visible, as « not verified » (FR-008).
 * `offline`: nothing answered. `rateLimited`: too many requests from this source.
 */
export const RECONCILIATION_FAILURES = ['offline', 'rateLimited', 'unexpected'] as const;

export type ReconciliationFailure = (typeof RECONCILIATION_FAILURES)[number];

/** Why a choice among candidates was not recorded: the book was no longer ambiguous (`conflict`), or a failure as above. */
export type DecisionFailure = ReconciliationFailure | 'conflict';

/** What the user chose for an ambiguous book. */
export type AmbiguityChoice =
  | { readonly choice: 'candidate'; readonly recordId: string }
  | { readonly choice: 'none' };
