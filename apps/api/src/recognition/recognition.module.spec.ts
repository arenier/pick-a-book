import { describe, expect, it } from 'vitest';

import { RecognitionModule } from './recognition.module';
import type { ShelfScanArchive } from './shelf-scan-archive.factory';

describe('RecognitionModule', () => {
  // Cloud Run stops an instance with SIGTERM: the Postgres pool is released, not dropped.
  it('closes the shelf scan archive when the application shuts down', async () => {
    let closed = false;
    const archive = {
      close: async () => {
        closed = true;
      },
    } satisfies Pick<ShelfScanArchive, 'close'>;

    await new RecognitionModule(archive).onApplicationShutdown();

    expect(closed).toBe(true);
  });
});
