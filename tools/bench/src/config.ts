import { extname } from 'node:path';

import type { ShelfScannerPort } from '@pick-a-book/recognition-domain';
import {
  GeminiShelfScannerAdapter,
  QwenShelfScannerAdapter,
} from '@pick-a-book/recognition-infrastructure';

/**
 * Reads the bench configuration off the environment and turns it into the list of providers to
 * run. Kept apart from the live runner so it carries no network and no clock — the choices, not
 * the calls.
 */
export interface ProviderSpec {
  readonly name: string;
  readonly model: string;
  readonly adapter: (transport: typeof fetch) => ShelfScannerPort;
}

// The real production defaults, copied here on purpose: a bench pins the exact model it tested
// rather than inheriting whatever an adapter would fall back to, so the report names a truth.
const DEFAULT_MODELS: Partial<Record<string, string>> = {
  gemini: 'gemini-3.6-flash',
  qwen: 'qwen/qwen2.5-vl-72b-instruct',
};

const MEDIA_TYPES: Partial<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

export function mediaTypeOf(file: string): string | undefined {
  return MEDIA_TYPES[extname(file).toLowerCase()];
}

export function env(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (value === undefined) {
    throw new Error(`Bench needs ${name} in the environment`);
  }
  return value;
}

function modelFor(provider: string): string {
  return env(`${provider.toUpperCase()}_MODEL`) ?? DEFAULT_MODELS[provider] ?? 'unknown';
}

export function selectedProviders(): ProviderSpec[] {
  const requested = (env('BENCH_PROVIDERS') ?? 'gemini,qwen').split(',').map((name) => name.trim());
  return requested.map((name) => providerSpec(name));
}

function providerSpec(name: string): ProviderSpec {
  const model = modelFor(name);

  if (name === 'gemini') {
    return {
      name,
      model,
      adapter: (transport) =>
        new GeminiShelfScannerAdapter(
          { apiKey: requireEnv('GEMINI_API_KEY'), model, baseUrl: env('GEMINI_BASE_URL') },
          transport,
        ),
    };
  }
  if (name === 'qwen') {
    return {
      name,
      model,
      adapter: (transport) =>
        new QwenShelfScannerAdapter(
          { apiKey: requireEnv('OPENROUTER_API_KEY'), model, baseUrl: env('QWEN_BASE_URL') },
          transport,
        ),
    };
  }
  throw new Error(`Unknown provider "${name}" — expected gemini or qwen`);
}
