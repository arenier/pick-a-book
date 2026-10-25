import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ENVIRONMENT, type Environment } from '../config/environment';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from '../health/health.controller';
import { RateLimitingModule } from '../http/rate-limiting.module';
import { buildLoggerOptions } from '../logging/logger-options';
import { BibliographyModule } from '../bibliography/bibliography.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { RecognitionModule } from '../recognition/recognition.module';

/**
 * Root module. It assembles; it carries no business rule (ADR 0003).
 *
 * Configuration is validated before the module is built and injected as is: no provider
 * reads `process.env` again.
 */
@Module({})
export class AppModule {
  static withEnvironment(environment: Environment) {
    const recognition = RecognitionModule.withEnvironment(environment);
    const bibliography = BibliographyModule.withEnvironment(environment);

    return {
      module: AppModule,
      imports: [
        // Structured JSON logs for Cloud Logging, one line per request (issue #45).
        LoggerModule.forRoot({ pinoHttp: buildLoggerOptions(environment) }),
        // The limit by source (specs/002-upload-history, FR-014).
        RateLimitingModule,
        // The one Postgres pool, opened and migrated before any context serves a request.
        DatabaseModule.withEnvironment(environment),
        recognition,
        bibliography,
        // The one place that knows more than one context (ADR 0003).
        OrchestrationModule.withContexts(recognition, bibliography),
      ],
      controllers: [HealthController],
      providers: [{ provide: ENVIRONMENT, useValue: environment }],
    };
  }
}
