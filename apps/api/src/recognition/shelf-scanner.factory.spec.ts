import {
  GeminiShelfScannerAdapter,
  QwenShelfScannerAdapter,
  StubShelfScannerAdapter,
} from '@pick-a-book/recognition-infrastructure';
import { describe, expect, it } from 'vitest';

import { createShelfScanner } from './shelf-scanner.factory';

describe('createShelfScanner', () => {
  it('binds the stub when no provider is selected', () => {
    expect(createShelfScanner({ provider: 'stub' })).toBeInstanceOf(StubShelfScannerAdapter);
  });

  it('binds the Gemini adapter', () => {
    expect(createShelfScanner({ provider: 'gemini', apiKey: 'k' })).toBeInstanceOf(
      GeminiShelfScannerAdapter,
    );
  });

  it('binds the Qwen adapter', () => {
    expect(createShelfScanner({ provider: 'qwen', apiKey: 'k' })).toBeInstanceOf(
      QwenShelfScannerAdapter,
    );
  });
});
