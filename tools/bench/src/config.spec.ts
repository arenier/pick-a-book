import { afterEach, describe, expect, it, vi } from 'vitest';

import { env, mediaTypeOf, requireEnv, selectedProviders } from './config.js';

describe('mediaTypeOf', () => {
  it('maps known image extensions, case-insensitively', () => {
    expect(mediaTypeOf('shelf-fixture-1.jpg')).toBe('image/jpeg');
    expect(mediaTypeOf('shelf.JPEG')).toBe('image/jpeg');
    expect(mediaTypeOf('shelf.png')).toBe('image/png');
  });

  it('returns undefined for anything else, so non-images are skipped', () => {
    expect(mediaTypeOf('ground-truth.yaml')).toBeUndefined();
    expect(mediaTypeOf('README')).toBeUndefined();
  });
});

describe('env / requireEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('trims a set value and treats blank as absent', () => {
    vi.stubEnv('BENCH_X', '  value  ');
    expect(env('BENCH_X')).toBe('value');

    vi.stubEnv('BENCH_X', '   ');
    expect(env('BENCH_X')).toBeUndefined();
  });

  it('requireEnv throws, naming the missing variable', () => {
    vi.stubEnv('BENCH_MISSING', '');
    expect(() => requireEnv('BENCH_MISSING')).toThrow(/BENCH_MISSING/u);
  });
});

describe('selectedProviders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds the two default providers with their pinned models', () => {
    vi.stubEnv('BENCH_PROVIDERS', 'gemini,qwen');
    vi.stubEnv('GEMINI_MODEL', '');
    vi.stubEnv('QWEN_MODEL', '');

    const specs = selectedProviders();

    expect(specs.map((spec) => spec.name)).toStrictEqual(['gemini', 'qwen']);
    expect(specs.map((spec) => spec.model)).toStrictEqual([
      'gemini-3.6-flash',
      'qwen/qwen2.5-vl-72b-instruct',
    ]);
  });

  it('honours a model override without touching the code', () => {
    vi.stubEnv('BENCH_PROVIDERS', 'qwen');
    vi.stubEnv('QWEN_MODEL', 'qwen/qwen3-vl-32b-instruct');

    expect(selectedProviders()[0]?.model).toBe('qwen/qwen3-vl-32b-instruct');
  });

  it('refuses an unknown provider rather than falling back silently', () => {
    vi.stubEnv('BENCH_PROVIDERS', 'stub');

    expect(() => selectedProviders()).toThrow(/Unknown provider "stub"/u);
  });
});
