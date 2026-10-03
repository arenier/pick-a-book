import {
  ShelfScanId,
  type OwnerId,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';

/**
 * The scan an id names, if it is the owner's — or `undefined`, whatever the reason: the id is
 * not even a UUID, no scan has it, or it is someone else's. One answer for all three, so that
 * guessing another owner's id says nothing more than guessing a wrong one (FR-012).
 */
export async function findOwnedScan(
  repository: ShelfScanRepositoryPort,
  ownerId: OwnerId,
  rawId: string,
): Promise<ShelfScanRecord | undefined> {
  const id = ShelfScanId.of(rawId);
  const record = id.ok ? await repository.get(id.value) : undefined;

  return record?.ownerId.equals(ownerId) === true ? record : undefined;
}
