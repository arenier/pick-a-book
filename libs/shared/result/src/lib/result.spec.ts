import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, map, ok, unwrap } from './result.js';

describe('Result', () => {
  it('carries the value on success', () => {
    const result = ok(42);

    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe(42);
  });

  it('carries the error on failure', () => {
    const result = err('breakdown');

    expect(isErr(result)).toBe(true);
    expect(() => unwrap(result)).toThrow('breakdown');
  });

  it('applies map to a success only', () => {
    expect(map(ok(2), (n: number) => n * 2)).toStrictEqual(ok(4));
    expect(map(err<string>('breakdown'), (n: number) => n * 2)).toStrictEqual(err('breakdown'));
  });
});
