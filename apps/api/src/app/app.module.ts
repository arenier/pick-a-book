import { Module } from '@nestjs/common';

import { ENVIRONMENT, type Environment } from '../config/environment';
import { HealthController } from '../health/health.controller';
import { RecognitionModule } from '../recognition/recognition.module';

/**
 * Module racine. Il assemble ; il ne porte aucune regle metier (ADR 0003).
 *
 * La configuration est validee avant la construction du module et injectee telle quelle :
 * aucun provider ne relit `process.env`.
 */
@Module({})
export class AppModule {
  static withEnvironment(environment: Environment) {
    return {
      module: AppModule,
      imports: [RecognitionModule],
      controllers: [HealthController],
      providers: [{ provide: ENVIRONMENT, useValue: environment }],
    };
  }
}
