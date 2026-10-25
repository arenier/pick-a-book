import { err, ok } from '@pick-a-book/shared-result';
import { OwnerId, ShelfScanFailed, ShelfScanId } from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { errorBodyOf } from '../http/testing/error-body';
import { reconciliationOf } from './testing/reconciliation-body';
import { aRunningReconciliationApi } from './testing/running-reconciliation-api';

const UNKNOWN = '5d6b8d7e-0f1a-4c2b-9e3d-7a8b9c0d1e2f';

describe('the reconciliation of an analysis that cannot be reconciled', () => {
  const api = aRunningReconciliationApi();

  it.each([
    ['an unknown id', UNKNOWN],
    ['an id that is not a UUID', 'not-a-uuid'],
  ])('answers 404 for %s, on both routes', async (_name, id) => {
    expect((await api.reconcile(id)).status).toBe(404);
    expect((await api.read(id)).status).toBe(404);
  });

  it('answers 404 for an upload of another owner, as for an unknown one', async () => {
    const id = ShelfScanId.generate();
    await api.scans.createPending({
      id,
      ownerId: unwrap(OwnerId.of('someone-else')),
      photoBucketKey: `someone-else/shelf_photo/${id.value}`,
      photoMediaType: 'image/jpeg',
      photoSizeBytes: 4,
      originalFilename: 'IMG_0002.jpg',
    });

    expect((await api.reconcile(id.value)).status).toBe(404);
    expect((await api.read(id.value)).status).toBe(404);
  });

  it('answers 409 SCAN_NOT_COMPLETED for an analysis that never started', async () => {
    const id = await api.uploadedPhoto();

    const response = await api.reconcile(id);

    expect(response.status).toBe(409);
    await expect(errorBodyOf(response)).resolves.toMatchObject({ code: 'SCAN_NOT_COMPLETED' });
    expect((await api.read(id)).status).toBe(409);
  });
});

describe('the reconciliation of an analysis that failed', () => {
  const api = aRunningReconciliationApi({
    scanner: { scan: async () => err(new ShelfScanFailed('provider down')) },
  });

  it('answers 409 SCAN_NOT_COMPLETED', async () => {
    const id = await api.completedScan();

    const response = await api.reconcile(id);

    expect(response.status).toBe(409);
    await expect(errorBodyOf(response)).resolves.toMatchObject({ code: 'SCAN_NOT_COMPLETED' });
  });
});

describe('the reconciliation of an analysis without any book', () => {
  const api = aRunningReconciliationApi({ scanner: { scan: async () => ok([]) } });

  it('answers 200 with no book', async () => {
    const id = await api.completedScan();

    const response = await api.reconcile(id);

    expect(response.status).toBe(200);
    await expect(reconciliationOf(response)).resolves.toStrictEqual({ books: [] });
  });
});
