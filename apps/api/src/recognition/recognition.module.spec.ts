import { GetShelfScanUseCase } from '@pick-a-book/recognition-application';
import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../config/environment';
import { RecognitionModule } from './recognition.module';

const environment = loadEnvironment({
  DATABASE_URL: 'postgresql://user:secret@localhost:5433/db',
  BUCKET_NAME: 'pick-a-book-photos',
});

describe('RecognitionModule', () => {
  // The orchestrator of the API reads the detail of an analysis to reconcile its books
  // (specs/003, T038): the use case is the context's way out, not a table.
  it('exports the use case that reads the detail of an analysis', () => {
    expect(RecognitionModule.withEnvironment(environment).exports).toContain(GetShelfScanUseCase);
  });

  it('exports nothing else', () => {
    expect(RecognitionModule.withEnvironment(environment).exports).toStrictEqual([
      GetShelfScanUseCase,
    ]);
  });
});
