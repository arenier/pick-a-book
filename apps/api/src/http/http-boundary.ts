import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { Environment } from '../config/environment';
import { GlobalExceptionFilter } from './global-exception.filter';

/**
 * Hardens the HTTP boundary of the API: what holds for every route, and so belongs to no
 * controller (ADR 0003: the app assembles, it carries no rule).
 *
 * - CORS — the front is served from its own origin, a second Cloud Run service (ADR 0004):
 *   without this, every call it makes fails in the browser as an opaque CORS error. The
 *   origin comes from the validated configuration, never from `process.env` read again;
 * - the global exception filter, the net for anything a route did not answer itself;
 * - `trust proxy`, so that a request's source is the client Cloud Run saw and not Cloud Run: the
 *   limit by source counts it (specs/002-upload-history, research.md §9).
 *
 * Its own function rather than lines of `main.ts`, so that the specs boot the very wiring
 * production boots.
 */
export function applyHttpBoundary(
  app: NestExpressApplication,
  environment: Pick<Environment, 'webOrigin'>,
): void {
  // A list, even of one: `cors` names an origin in its answer only when the request comes from
  // one of them, where a bare string would be echoed to every caller — and a preflight from
  // elsewhere then gets no `Access-Control-Allow-Origin` at all, which is a refusal.
  app.enableCors({ origin: [environment.webOrigin] });
  // One hop: Cloud Run's front end appends the address it saw as the LAST entry of
  // `X-Forwarded-For`, which a client cannot forge — it only writes the entries on the left.
  // Trusting more hops would let a forged entry become the source. Without a proxy (local, the
  // specs), the source is the address of the socket. To confirm on a deployed revision.
  app.set('trust proxy', 1);
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(HttpAdapterHost)));
}
