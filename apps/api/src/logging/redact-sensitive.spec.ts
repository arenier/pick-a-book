import { describe, expect, it } from 'vitest';

import { redactSensitive } from './redact-sensitive';

/** `value` wrapped in `levels` objects: `{ wrap: { wrap: … value } }`. */
function nested(levels: number, value: Record<string, unknown>): Record<string, unknown> {
  return Array.from({ length: levels }).reduce<Record<string, unknown>>(
    (inner) => ({ wrap: inner }),
    value,
  );
}

// The promise is "never, whatever the depth": pino's own `redact` lists one path per depth, so it
// always stops somewhere — and a secret logged one level below the stop goes through.
describe('redactSensitive, at any depth', () => {
  it.each([0, 1, 3, 4, 10, 50])('removes a key %i levels down', (levels) => {
    const line = nested(levels, { apiKey: 'SECRET', scanId: 'kept' });

    const text = JSON.stringify(redactSensitive(line));

    expect(text).not.toContain('SECRET');
    expect(text).toContain('kept');
  });

  it.each([
    'apiKey',
    'GEMINI_API_KEY',
    'OPENROUTER_API_KEY',
    'authorization',
    'cookie',
    'bytes',
    'buffer',
    'image',
  ])('removes %s', (key) => {
    const text = JSON.stringify(redactSensitive(nested(6, { [key]: 'SECRET' })));

    expect(text).not.toContain('SECRET');
  });

  it('removes the key itself, leaving no mask behind', () => {
    expect(redactSensitive({ provider: { apiKey: 'SECRET', name: 'gemini' } })).toStrictEqual({
      provider: { name: 'gemini' },
    });
  });

  it('removes a key inside an array of objects', () => {
    const line = { attempts: [{ apiKey: 'SECRET', n: 1 }, [{ authorization: 'SECRET' }]] };

    expect(redactSensitive(line)).toStrictEqual({ attempts: [{ n: 1 }, [{}]] });
  });

  it('keeps everything that is not sensitive, as it was', () => {
    const line = { scanId: '1f9c2e3a', photoSizeBytes: 2_345_678, tags: ['a', 'b'], ok: true };

    expect(redactSensitive(line)).toStrictEqual(line);
  });
});

describe('redactSensitive, for what it must not break', () => {
  // A logged object belongs to the caller: logging must not be what deletes its credentials.
  it('leaves the logged object as it found it', () => {
    const line = { provider: { apiKey: 'SECRET' } };

    redactSensitive(line);

    expect(line).toStrictEqual({ provider: { apiKey: 'SECRET' } });
  });

  it('survives a circular reference, and still removes the secret', () => {
    const line: Record<string, unknown> = { name: 'loop', apiKey: 'SECRET' };
    line['self'] = line;

    const text = JSON.stringify(redactSensitive(line));

    expect(text).not.toContain('SECRET');
    expect(text).toContain('[Circular]');
  });

  // The same object reached twice is not a cycle: it is logged twice, in full.
  it('does not mistake a shared reference for a cycle', () => {
    const shared = { n: 1 };

    expect(redactSensitive({ a: shared, b: shared })).toStrictEqual({ a: { n: 1 }, b: { n: 1 } });
  });

  // An Error is serialised by pino as an error — stack included — from the instance itself:
  // rebuilding it as a plain object would turn the stack into a bare property.
  it('leaves an Error instance an Error', () => {
    const failure = new Error('bucket unavailable');

    const { err } = redactSensitive({ err: failure });

    expect(err).toBe(failure);
  });
});
