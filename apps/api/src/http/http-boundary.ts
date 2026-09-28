import type { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import type { Environment } from '../config/environment';
import { GlobalExceptionFilter } from './global-exception.filter';

/**
 * Hardens the HTTP boundary of the API: what holds for every route, and so belongs to no
 * controller (ADR 0003: the app assembles, it carries no rule).
 *
 * - CORS — the front is served from its own origin, a second Cloud Run service (ADR 0004):
 *   without this, every call it makes fails in the browser as an opaque CORS error. The
 *   origin comes from the validated configuration, never from `process.env` read again;
 * - the global exception filter, the net for anything a route did not answer itself.
 *
 * Its own function rather than lines of `main.ts`, so that the specs boot the very wiring
 * production boots.
 */
export function applyHttpBoundary(
  app: INestApplication,
  environment: Pick<Environment, 'webOrigin'>,
): void {
  // A list, even of one: `cors` names an origin in its answer only when the request comes from
  // one of them, where a bare string would be echoed to every caller — and a preflight from
  // elsewhere then gets no `Access-Control-Allow-Origin` at all, which is a refusal.
  app.enableCors({ origin: [environment.webOrigin] });
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(HttpAdapterHost)));
}
