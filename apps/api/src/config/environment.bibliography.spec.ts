import { describe, expect, it } from 'vitest';

import { loadEnvironment } from './environment';

const complete = {
  DATABASE_URL: 'postgresql://user:secret@db.example.com/neondb?sslmode=require',
  BUCKET_NAME: 'pick-a-book-photos',
} satisfies NodeJS.ProcessEnv;

const load = (overrides: NodeJS.ProcessEnv = {}) => loadEnvironment({ ...complete, ...overrides });

describe('loadEnvironment, bibliographic catalogue selection (specs/003, research §12)', () => {
  it('defaults to the stub, which needs no network', () => {
    expect(load().bibliographicCatalog).toStrictEqual({ provider: 'stub' });
  });

  it.each(['bnf', 'stub', 'offline'] as const)('selects %s', (provider) => {
    expect(load({ BIBLIOGRAPHIC_CATALOG_PROVIDER: provider }).bibliographicCatalog).toStrictEqual({
      provider,
    });
  });

  it('treats an empty value as absent', () => {
    expect(load({ BIBLIOGRAPHIC_CATALOG_PROVIDER: '  ' }).bibliographicCatalog.provider).toBe(
      'stub',
    );
  });

  it('lists the accepted values when the provider is unknown', () => {
    expect(() => load({ BIBLIOGRAPHIC_CATALOG_PROVIDER: 'google' })).toThrow(
      /BIBLIOGRAPHIC_CATALOG_PROVIDER[\s\S]*google[\s\S]*bnf[\s\S]*stub[\s\S]*offline/u,
    );
  });

  it('reports it with the other problems, in one error', () => {
    expect(() => loadEnvironment({ BIBLIOGRAPHIC_CATALOG_PROVIDER: 'google' })).toThrow(
      /DATABASE_URL[\s\S]*BIBLIOGRAPHIC_CATALOG_PROVIDER/u,
    );
  });
});
