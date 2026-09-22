import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';
import { InvalidEnvironment, loadEnvironment } from './config/environment';

async function bootstrap() {
  // Configuration is validated before anything is constructed: a missing required variable
  // stops the boot right here, with the list of what is missing.
  const environment = loadEnvironment();

  const app = await NestFactory.create(AppModule.withEnvironment(environment));
  // The frontend is served from a bucket and the API from Cloud Run (ADR 0004), so the two
  // never share an origin: without this, every browser call fails in the console rather
  // than in the application.
  app.enableCors({ origin: environment.webOrigin });
  await app.listen(environment.port, '0.0.0.0');

  Logger.log(`API listening on http://localhost:${environment.port} (${environment.nodeEnv})`);
  Logger.log(`Health: http://localhost:${environment.port}/health`);
  Logger.log(`Accepting browser calls from ${environment.webOrigin}`);
}

bootstrap().catch((error: unknown) => {
  if (error instanceof InvalidEnvironment) {
    // No stack trace: the message is the useful part.
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
