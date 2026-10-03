import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { ShelfScanId } from './shelf-scan-id.js';
import { ShelfScanInProgress } from './shelf-scan-in-progress.error.js';

describe('ShelfScanInProgress', () => {
  const id = unwrap(ShelfScanId.of('1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b'));

  it('names the scan whose analysis is already running', () => {
    const error = new ShelfScanInProgress(id);

    expect(error.kind).toBe('shelf-scan-in-progress');
    expect(error.name).toBe('ShelfScanInProgress');
    expect(error.message).toBe(
      'Shelf scan already in progress: 1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b',
    );
  });
});
