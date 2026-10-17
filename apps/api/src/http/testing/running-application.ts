import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { InMemoryShelfScanRepository } from '@pick-a-book/recognition-application/testing';
import { LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll } from 'vitest';

import { AppModule } from '../../app/app.module';
import { loadEnvironment } from '../../config/environment';
import { anInMemoryPhotoStorage } from '../../recognition/testing/in-memory-photo-storage';
import { applyHttpBoundary } from '../http-boundary';

/**
 * The real `AppModule`, with the archive replaced by the in-memory doubles: neither Postgres nor
 * the bucket is touched, and the migration never runs. Excluded from the app build
 * (`tsconfig.app.json`).
 */

/** A route with the default tier only — the reading routes of the history come with their own. */
@Controller('probe')
class ProbeController {
  @Get()
  read(): { readonly read: true } {
    return { read: true };
  }
}

const environment = loadEnvironment({
  DATABASE_URL: 'postgresql://user:secret@localhost:5433/db',
  BUCKET_NAME: 'pick-a-book-photos',
  NODE_ENV: 'test',
});

/** One application for the whole file: nestjs-pino keeps a single pino-http per process. */
export function aRunningApplication() {
  let app: NestExpressApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.withEnvironment(environment)],
      controllers: [ProbeController],
    })
      // Requests are not what these specs are about: 300 log lines would drown the report.
      .overrideModule(LoggerModule)
      .useModule(LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }))
      .overrideProvider('ShelfScanArchive')
      .useValue({
        storage: anInMemoryPhotoStorage(),
        repository: new InMemoryShelfScanRepository(),
        migrate: async (): Promise<void> => {
          // Nothing to migrate: there is no database.
        },
        close: async (): Promise<void> => {
          // Nothing to release.
        },
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    applyHttpBoundary(app, environment);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  /** A request as seen from `source`, the way Cloud Run says it: the client is the last entry. */
  const from = async (source: string, path: string, method = 'GET') =>
    fetch(`${baseUrl}${path}`, { method, headers: { 'x-forwarded-for': source } });

  return { from };
}
