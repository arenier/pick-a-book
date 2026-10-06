import { type ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { ENVIRONMENT, type Environment } from '../config/environment';
import { HealthController } from '../health/health.controller';
import { RateLimitGuard } from '../http/rate-limit.guard';
import { buildLoggerOptions } from '../logging/logger-options';
import { RecognitionModule } from '../recognition/recognition.module';

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
 * Root module. It assembles; it carries no business rule (ADR 0003).
 *
 * Configuration is validated before the module is built and injected as is: no provider
 * reads `process.env` again.
 */
@Module({})
export class AppModule {
  static withEnvironment(environment: Environment) {
    return {
      module: AppModule,
      imports: [
        // Structured JSON logs for Cloud Logging, one line per request (issue #45).
        LoggerModule.forRoot({ pinoHttp: buildLoggerOptions(environment) }),
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
        RecognitionModule.withEnvironment(environment),
      ],
      controllers: [HealthController],
      providers: [
        { provide: ENVIRONMENT, useValue: environment },
        { provide: APP_GUARD, useClass: RateLimitGuard },
      ],
    };
  }
}
