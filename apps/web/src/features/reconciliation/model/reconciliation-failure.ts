/**
 * Why a reconciliation could not be asked for or read (specs/003, data-model.md): a kind, never a
 * sentence (ADR 0011). In every case the books stay visible, as « not verified » (FR-008).
 * `offline`: nothing answered. `rateLimited`: too many requests from this source.
 */
export const RECONCILIATION_FAILURES = ['offline', 'rateLimited', 'unexpected'] as const;

export type ReconciliationFailure = (typeof RECONCILIATION_FAILURES)[number];
