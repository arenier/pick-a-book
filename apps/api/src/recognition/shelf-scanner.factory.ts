import type { ShelfScannerPort } from '@pick-a-book/recognition-domain';
import {
  GeminiShelfScannerAdapter,
  QwenShelfScannerAdapter,
  StubShelfScannerAdapter,
} from '@pick-a-book/recognition-infrastructure';

import type { ShelfScannerConfiguration } from '../config/environment';

/**
 * Turns the validated configuration into the adapter that answers scans.
 *
 * Lives in the composition root, the only place allowed to know
 * `recognition-infrastructure` (ADR 0002). The use case never sees any of this: it is handed
 * a `ShelfScannerPort` and cannot tell which provider is behind it.
 *
 * Written as guards ending on the stub rather than as an exhaustive `switch`: the rule set
 * asks a switch to list every case *and* asks every function to return on every path, and
 * the two cannot both be satisfied here. The cost is that a new provider left out of this
 * function falls back to the stub instead of failing to compile — which is why
 * `shelf-scanner.factory.spec.ts` asserts the binding of each provider by name.
 */
export function createShelfScanner(configuration: ShelfScannerConfiguration): ShelfScannerPort {
  if (configuration.provider === 'gemini') {
    return new GeminiShelfScannerAdapter({ apiKey: configuration.apiKey });
  }

  if (configuration.provider === 'qwen') {
    return new QwenShelfScannerAdapter({ apiKey: configuration.apiKey });
  }

  return new StubShelfScannerAdapter();
}
