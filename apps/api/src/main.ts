import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app/app.module';
import { InvalidEnvironment, loadEnvironment } from './config/environment';
import { applyHttpBoundary } from './http/http-boundary';

async function bootstrap() {
  // Configuration is validated before anything is constructed: a missing required variable
  // stops the boot right here, with the list of what is missing.
  const environment = loadEnvironment();

  // `bufferLogs` holds what the framework logs while the modules come up, so that it too goes
  // out through pino, as JSON, rather than as the text of Nest's default logger.
  const app = await NestFactory.create(AppModule.withEnvironment(environment), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // CORS and the global exception filter: what holds for every route.
  applyHttpBoundary(app, environment);
  // SIGTERM (how Cloud Run stops an instance) runs the shutdown hooks: the Postgres pool is
  // released instead of dropped.
  app.enableShutdownHooks();
  await app.listen(environment.port, '0.0.0.0');

  logger.log(`API listening on http://localhost:${environment.port} (${environment.nodeEnv})`);
  logger.log(`Health: http://localhost:${environment.port}/health`);
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
