import {
  GeminiShelfScannerAdapter,
  QwenShelfScannerAdapter,
  StubShelfScannerAdapter,
} from '@pick-a-book/recognition-infrastructure';
import { describe, expect, it } from 'vitest';

import { createShelfScanner, describeShelfScanner } from './shelf-scanner.factory';

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

describe('describeShelfScanner', () => {
  it('warns that the stub answers every scan with the same sample books', () => {
    expect(describeShelfScanner({ provider: 'stub' })).toStrictEqual({
      level: 'warn',
      message:
        'Shelf scanner: stub — every scan answers the same sample books, whatever the photo. ' +
        'Set SHELF_SCANNER_PROVIDER=gemini and GEMINI_API_KEY to read real photos.',
    });
  });

  it('names the real provider that answers scans', () => {
    expect(describeShelfScanner({ provider: 'gemini', apiKey: 'k' })).toStrictEqual({
      level: 'log',
      message: 'Shelf scanner: gemini',
    });
  });

  it('never reveals the API key', () => {
    expect(describeShelfScanner({ provider: 'qwen', apiKey: 'secret-key' }).message).not.toContain(
      'secret-key',
    );
  });
});
