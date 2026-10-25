import { type ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { RateLimitGuard } from './rate-limit.guard';

/** One minute, the window of both tiers of the limit by source. */
const RATE_LIMIT_WINDOW_MS = 60_000;

/** The methods that only read: the `write` tier never counts them. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Whether a request only reads — judged by its method, so that a route added tomorrow is in the
 * right tier without anyone remembering to say so.
 */
function readsOnly(context: ExecutionContext): boolean {
  const request: unknown = context.switchToHttp().getRequest();

  return (
    typeof request === 'object' &&
    request !== null &&
    'method' in request &&
    typeof request.method === 'string' &&
    SAFE_METHODS.has(request.method)
  );
}

/**
 * The limit on requests per source (specs/002-upload-history, FR-014, research.md §9), for the
 * whole API: the guard is global, so a route added tomorrow is limited without anyone saying so.
 */
@Module({
  imports: [
    // The limit by source (specs/002-upload-history, FR-014, research.md §9): in memory, per
    // instance — Cloud Run runs three at most, so the real limit is at most tripled. Every
    // request counts against `default`; the ones that change something also count against
    // `write`, the much tighter tier that bounds what is paid for.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: RATE_LIMIT_WINDOW_MS, limit: 300 },
        { name: 'write', ttl: RATE_LIMIT_WINDOW_MS, limit: 10, skipIf: readsOnly },
      ],
      // `RateLimitGuard` writes the one header the contract names.
      setHeaders: false,
      // A budget per tier and source, shared by every route: the package keys it on the
      // handler too, which would give each route a budget of its own.
      generateKey: (_context, tracker, throttlerName) => `${throttlerName}-${tracker}`,
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class RateLimitingModule {}
