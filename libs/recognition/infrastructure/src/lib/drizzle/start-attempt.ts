import {
  DailyScanQuotaExceeded,
  ShelfScanAlreadyProcessed,
  ShelfScanInProgress,
  ShelfScanNotFound,
  type ScanAttemptPolicy,
  type ScanAttemptRefusal,
  type ShelfScanId,
} from '@pick-a-book/recognition-domain';
import { and, count, eq, gte, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { scanAttempts, shelfScans, uploads } from './schema.js';
import { SHELF_PHOTO } from './shelf-scan-mapping.js';

export type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/**
 * What stops an analysis from starting, in the order the port documents — or `undefined` when
 * nothing does. Reads only: the caller holds the advisory lock, so what is read here still
 * holds when the attempt is inserted.
 */
export async function refusalOf(
  tx: Transaction,
  id: ShelfScanId,
  policy: ScanAttemptPolicy,
): Promise<ScanAttemptRefusal | undefined> {
  const scan = (
    await tx
      .select({ ownerId: uploads.ownerId, status: shelfScans.status })
      .from(uploads)
      .innerJoin(shelfScans, eq(shelfScans.uploadId, uploads.id))
      .where(and(eq(uploads.id, id.value), eq(uploads.type, SHELF_PHOTO)))
  ).at(0);
  if (scan === undefined) {
    return new ShelfScanNotFound(id.value);
  }
  if (scan.status !== 'pending') {
    return new ShelfScanAlreadyProcessed(id);
  }
  if (await hasRunningAttempt(tx, id, policy.lease)) {
    return new ShelfScanInProgress(id);
  }
  if ((await attemptsToday(tx, scan.ownerId, policy.timeZone)) >= policy.dailyLimit) {
    return new DailyScanQuotaExceeded(policy.dailyLimit);
  }

  return undefined;
}

/** An attempt still open, started less than a lease ago. */
async function hasRunningAttempt(
  tx: Transaction,
  id: ShelfScanId,
  lease: number,
): Promise<boolean> {
  const running = await tx
    .select({ id: scanAttempts.id })
    .from(scanAttempts)
    .where(
      and(
        eq(scanAttempts.uploadId, id.value),
        isNull(scanAttempts.finishedAt),
        gte(scanAttempts.startedAt, sql`now() - make_interval(secs => ${lease / 1000})`),
      ),
    )
    .limit(1);

  return running.length > 0;
}

/** What the day's cap counts: the owner's attempts since midnight, « today » being the user's. */
async function attemptsToday(tx: Transaction, ownerId: string, timeZone: string): Promise<number> {
  const rows = await tx
    .select({ attempts: count() })
    .from(scanAttempts)
    .innerJoin(uploads, eq(uploads.id, scanAttempts.uploadId))
    .where(
      and(
        eq(uploads.ownerId, ownerId),
        gte(
          scanAttempts.startedAt,
          sql`date_trunc('day', now() at time zone ${timeZone}) at time zone ${timeZone}`,
        ),
      ),
    );

  return rows.at(0)?.attempts ?? 0;
}
