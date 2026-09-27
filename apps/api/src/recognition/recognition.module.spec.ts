import { APP_FILTER } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../config/environment';
import { RecognitionExceptionFilter } from './recognition-exception.filter';
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

  // Domain errors become HTTP statuses in one place, for every route of the context.
  it('registers the recognition exception filter', () => {
    const environment = loadEnvironment({
      DATABASE_URL: 'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book',
      BUCKET_NAME: 'pick-a-book-photos',
    });

    const { providers } = RecognitionModule.withEnvironment(environment);

    expect(providers).toContainEqual({ provide: APP_FILTER, useClass: RecognitionExceptionFilter });
  });
});
