import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { ScanAttemptId } from './scan-attempt-id.js';

describe('ScanAttemptId', () => {
  it('keeps a UUID, lower-cased', () => {
    const id = unwrap(ScanAttemptId.of('1F9C2E3A-4B5D-4E6F-8A7B-9C0D1E2F3A4B'));

    expect(id.value).toBe('1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b');
  });

  it('refuses what is not a UUID', () => {
    expect(ScanAttemptId.of('not-an-id').ok).toBe(false);
  });

  it('generates a different id each time', () => {
    expect(ScanAttemptId.generate().equals(ScanAttemptId.generate())).toBe(false);
  });

  it('is equal to the same id and to nothing else', () => {
    const raw = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';
    const first = unwrap(ScanAttemptId.of(raw));
    const second = unwrap(ScanAttemptId.of(raw));

    expect(first.equals(second)).toBe(true);
  });
});
