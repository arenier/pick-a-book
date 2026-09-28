import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ENVIRONMENT, type Environment } from '../config/environment';
import { HealthController } from '../health/health.controller';
import { buildLoggerOptions } from '../logging/logger-options';
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
    return {
      module: AppModule,
      imports: [
        // Structured JSON logs for Cloud Logging, one line per request (issue #45).
        LoggerModule.forRoot({ pinoHttp: buildLoggerOptions(environment) }),
        RecognitionModule.withEnvironment(environment),
      ],
      controllers: [HealthController],
      providers: [{ provide: ENVIRONMENT, useValue: environment }],
    };
  }
}
