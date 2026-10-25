import { MatchingSettings } from '@pick-a-book/bibliography-domain';
import { aRecord } from '@pick-a-book/bibliography-domain/testing';

import type { DetectedBookInput } from '../lib/reconciliation.dto.js';
import { ReconcileDetectedBooksUseCase } from '../lib/reconcile-detected-books.use-case.js';
import { DEFAULT_LIMITS, type ReconciliationLimits } from '../lib/run-with-limits.js';
import { FakeAuthority } from './fake-authority.js';
import { FakeBibliographicCatalog } from './fake-bibliographic-catalog.js';
import { InMemoryBookReconciliationRepository } from './in-memory-book-reconciliation-repository.js';

/** The analysis the specs of the use cases reconcile. */
export const A_SCAN = '0e1d6d5c-0b5e-4f5b-8f5b-3c8d3b7a9a11';

export function aDetectedBook(position: number, title: string, author?: string): DetectedBookInput {
  return author === undefined ? { position, title } : { position, title, author };
}

/** « La peste » by Albert Camus, as the catalogue would describe it. */
export const peste = aRecord({
  id: 'ark:/12148/peste',
  title: 'La peste',
  authors: [{ name: 'Camus, Albert (1913-1960)', role: 'main' }],
});

/**
 * A use case over the doubles, and the doubles themselves: the specs script the catalogue, then
 * read what it was asked and what was kept.
 */
export function aReconciler(
  options: { limits?: ReconciliationLimits; authorities?: FakeAuthority } = {},
) {
  const catalog = new FakeBibliographicCatalog();
  const authorities = options.authorities ?? new FakeAuthority();
  const repository = new InMemoryBookReconciliationRepository();
  const useCase = new ReconcileDetectedBooksUseCase(
    catalog,
    authorities,
    repository,
    MatchingSettings.defaults(),
    options.limits ?? DEFAULT_LIMITS,
  );

  return { useCase, catalog, authorities, repository };
}
