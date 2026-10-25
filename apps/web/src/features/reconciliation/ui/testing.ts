import { vi } from 'vitest';

import type { DecisionAnswer, ReconciliationAnswer } from '../api/reconciliation-api';
import type { ReconciledBook } from '../model/reconciled-book';
import type { ReconciliationApi } from './use-reconciliation';

/**
 * Doubles for the specs of the list. Excluded from the app build (`tsconfig.app.json`).
 */

/** The API as a spec scripts it: what each call answers, and the calls it received. */
export function anApi(
  answers: {
    reconcile?: ReconciliationAnswer;
    read?: ReconciliationAnswer;
    decide?: DecisionAnswer;
  } = {},
) {
  const reconcile = vi.fn<ReconciliationApi['reconcile']>(
    async () => answers.reconcile ?? { status: 'books', books: [] },
  );
  const read = vi.fn<ReconciliationApi['read']>(
    async () => answers.read ?? { status: 'books', books: [] },
  );

  const decide = vi.fn<ReconciliationApi['decide']>(
    async () => answers.decide ?? { status: 'error', failure: 'unexpected' },
  );

  return { reconcile, read, decide } satisfies ReconciliationApi;
}

/** A call that answers when the spec lets it, to look at the screen in between. */
export function aPendingApi() {
  const resolvers: ((answer: ReconciliationAnswer) => void)[] = [];
  const reconcile = vi.fn<ReconciliationApi['reconcile']>(
    async () =>
      new Promise<ReconciliationAnswer>((resolve) => {
        resolvers.push(resolve);
      }),
  );
  const read = vi.fn<ReconciliationApi['read']>(async () => ({ status: 'books', books: [] }));
  const decide = vi.fn<ReconciliationApi['decide']>(async () => ({
    status: 'error',
    failure: 'unexpected',
  }));

  return {
    api: { reconcile, read, decide } satisfies ReconciliationApi,
    reconcile,
    answer: (answer: ReconciliationAnswer) => {
      for (const resolve of resolvers) {
        resolve(answer);
      }
    },
  };
}

export const books = (...list: readonly ReconciledBook[]): ReconciliationAnswer => ({
  status: 'books',
  books: list,
});

export const camus = { recordId: 'ark:/12148/cb1', title: 'La peste', authors: ['Albert Camus'] };

export const confirmed = (
  position: number,
  read: { title: string; author?: string },
  overrides: {
    titleOnly?: boolean;
    reference?: typeof camus;
    confirmedBy?: 'automatic' | 'user';
  } = {},
): ReconciledBook => ({
  position,
  read: { title: read.title, author: read.author },
  status: 'confirmed',
  confirmedBy: overrides.confirmedBy ?? 'automatic',
  titleOnly: overrides.titleOnly ?? false,
  reference: overrides.reference ?? camus,
});

export const withoutVerdict = (
  position: number,
  title: string,
  status: 'not_found' | 'not_verified' | 'pending',
  author?: string,
): ReconciledBook => ({ position, read: { title, author }, status });

export const ambiguous = (position: number, title: string): ReconciledBook => ({
  position,
  read: { title, author: undefined },
  status: 'ambiguous',
  candidates: [camus, { ...camus, recordId: 'ark:/12148/cb2', authors: ['Autre Auteur'] }],
});

/** The next `reconcile` of the API waits for the spec to answer it, to look at the screen meanwhile. */
export function holdNextReconcile(api: { reconcile: ReturnType<typeof anApi>['reconcile'] }) {
  const held: ((answer: ReconciliationAnswer) => void)[] = [];
  api.reconcile.mockImplementationOnce(
    async () =>
      new Promise<ReconciliationAnswer>((resolve) => {
        held.push(resolve);
      }),
  );

  return {
    answer: (answer: ReconciliationAnswer) => {
      for (const resolve of held) {
        resolve(answer);
      }
    },
  };
}
