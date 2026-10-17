import { and, count, eq, gte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { uploads } from './schema.js';
import { SHELF_PHOTO } from './shelf-scan-mapping.js';

/**
 * What the cap on uploads counts (specs/002-upload-history, FR-017): the owner's photos since
 * midnight, « today » being the user's. Thumbnails are other `uploads` rows, derived from a
 * photo — they are not uploads of their own, and are left out by the type.
 */
export async function uploadsToday(
  db: NodePgDatabase,
  ownerId: string,
  timeZone: string,
): Promise<number> {
  const rows = await db
    .select({ uploads: count() })
    .from(uploads)
    .where(
      and(
        eq(uploads.ownerId, ownerId),
        eq(uploads.type, SHELF_PHOTO),
        gte(
          uploads.createdAt,
          sql`date_trunc('day', now() at time zone ${timeZone}) at time zone ${timeZone}`,
        ),
      ),
    );

  return rows.at(0)?.uploads ?? 0;
}
