import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';
import { InvalidEnvironment, loadEnvironment } from './config/environment';

async function bootstrap() {
  // Configuration is validated before anything is constructed: a missing required variable
  // stops the boot right here, with the list of what is missing.
  const environment = loadEnvironment();

  const app = await NestFactory.create(AppModule.withEnvironment(environment));
  await app.listen(environment.port, '0.0.0.0');

  Logger.log(`API listening on http://localhost:${environment.port} (${environment.nodeEnv})`);
  Logger.log(`Health: http://localhost:${environment.port}/health`);
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
