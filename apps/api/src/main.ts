import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';
import { InvalidEnvironment, loadEnvironment } from './config/environment';

async function bootstrap() {
  // La configuration est validee avant toute construction : une variable requise
  // manquante arrete le demarrage ici, avec la liste de ce qui manque.
  const environment = loadEnvironment();

  const app = await NestFactory.create(AppModule.withEnvironment(environment));
  await app.listen(environment.port, '0.0.0.0');

  Logger.log(`API en ecoute sur http://localhost:${environment.port} (${environment.nodeEnv})`);
  Logger.log(`Sante : http://localhost:${environment.port}/health`);
}

bootstrap().catch((error: unknown) => {
  if (error instanceof InvalidEnvironment) {
    // Pas de trace de pile : le message est l'information utile.
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
