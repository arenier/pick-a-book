import { Module } from '@nestjs/common';

import { ENVIRONMENT, type Environment } from '../config/environment';
import { HealthController } from '../health/health.controller';
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
      imports: [RecognitionModule.withEnvironment(environment)],
      controllers: [HealthController],
      providers: [{ provide: ENVIRONMENT, useValue: environment }],
    };
  }
}
