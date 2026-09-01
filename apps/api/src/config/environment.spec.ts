import { describe, expect, it } from 'vitest';

import { InvalidEnvironment, loadEnvironment } from './environment';

const complete = {
  DATABASE_URL: 'postgresql://user:secret@db.example.com/neondb?sslmode=require',
  STORAGE_BUCKET: 'pick-a-book-photos',
} satisfies NodeJS.ProcessEnv;

/** Loads a complete environment, with `overrides` applied on top. */
const load = (overrides: NodeJS.ProcessEnv = {}) => loadEnvironment({ ...complete, ...overrides });

describe('loadEnvironment', () => {
  it('applies the default values', () => {
    const env = load();

    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(3000);
    expect(env.shelfScanner).toStrictEqual({ provider: 'stub' });
  });

  it('exposes the connection string, under either Postgres scheme', () => {
    expect(loadEnvironment({ ...complete }).databaseUrl).toBe(complete.DATABASE_URL);
    expect(
      loadEnvironment({ ...complete, DATABASE_URL: 'postgres://user@host:5432/db' }).databaseUrl,
    ).toBe('postgres://user@host:5432/db');
  });

  it('fails when a required variable is missing', () => {
    expect(() => loadEnvironment({ STORAGE_BUCKET: 'photos' })).toThrow(InvalidEnvironment);
  });

  it('lists every missing variable at once', () => {
    expect(() => loadEnvironment({})).toThrow(/DATABASE_URL[\s\S]*STORAGE_BUCKET/u);
  });

  it('treats an empty variable as absent', () => {
    expect(() => loadEnvironment({ ...complete, DATABASE_URL: '   ' })).toThrow(/DATABASE_URL/u);
  });

  // The filesystem path of the previous persistence is the regression that matters here.
  it('rejects a DATABASE_URL that is not a Postgres connection string', () => {
    const reject = (url: string) => () => loadEnvironment({ ...complete, DATABASE_URL: url });

    expect(reject('/mnt/pick-a-book.sqlite')).toThrow(/DATABASE_URL/u);
    expect(reject('mysql://user@host/db')).toThrow(/DATABASE_URL/u);
  });

  it('rejects a PORT outside its bounds', () => {
    expect(() => loadEnvironment({ ...complete, PORT: '70000' })).toThrow(/PORT/u);
    expect(() => loadEnvironment({ ...complete, PORT: 'eight-thousand' })).toThrow(/PORT/u);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnvironment({ ...complete, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/u);
  });
});

describe('loadEnvironment, shelf scanner selection (ADR 0005)', () => {
  const keys = { GEMINI_API_KEY: 'gemini-key', OPENROUTER_API_KEY: 'openrouter-key' };

  it('defaults to the stub, so the API boots without any provider key', () => {
    expect(load().shelfScanner).toStrictEqual({ provider: 'stub' });
  });

  it('carries the key of the selected provider, and only that one', () => {
    expect(load({ ...keys, SHELF_SCANNER_PROVIDER: 'gemini' }).shelfScanner).toStrictEqual({
      provider: 'gemini',
      apiKey: 'gemini-key',
    });

    expect(load({ ...keys, SHELF_SCANNER_PROVIDER: 'qwen' }).shelfScanner).toStrictEqual({
      provider: 'qwen',
      apiKey: 'openrouter-key',
    });
  });

  // The point of the whole mechanism: a provider selected without its key fails the boot,
  // rather than the first request that reaches the VLM.
  it('fails when the selected provider has no key', () => {
    expect(() => load({ SHELF_SCANNER_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/u);
    expect(() => load({ SHELF_SCANNER_PROVIDER: 'qwen' })).toThrow(/OPENROUTER_API_KEY/u);
  });

  it('does not require a provider key the selection does not use', () => {
    expect(() => load({ SHELF_SCANNER_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).not.toThrow();
  });

  it('rejects an unknown provider, naming the ones it accepts', () => {
    expect(() => load({ SHELF_SCANNER_PROVIDER: 'claude' })).toThrow(
      /SHELF_SCANNER_PROVIDER[\s\S]*gemini[\s\S]*qwen[\s\S]*stub/u,
    );
  });

  // Regression: the generic key predates the per-provider ones and named no provider, so a
  // leftover value would silently select nothing.
  it('ignores the retired generic key', () => {
    expect(load({ SHELF_SCANNER_API_KEY: 'leftover' }).shelfScanner).toStrictEqual({
      provider: 'stub',
    });
  });
});
