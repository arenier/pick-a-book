import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  BIBLIOGRAPHIC_CATALOG_PORT,
  type BibliographicCatalogPort,
} from '@pick-a-book/bibliography-domain';
import { SHELF_SCANNER_PORT, type ShelfScannerPort } from '@pick-a-book/recognition-domain';
import { LoggerModule } from 'nestjs-pino';
import type { Pool } from 'pg';

import { AppModule } from '../../app/app.module';
import { applyHttpBoundary } from '../../http/http-boundary';
import {
  inMemoryArchive,
  migratedPool,
  reconciliationEnvironment,
  type InMemoryShelfScanRepository,
} from './reconciliation-doubles';

export interface ReconciliationApiOptions {
  /** `stub` by default; `offline` makes every book « not verified ». */
  readonly catalogProvider?: 'stub' | 'offline';
  /** Replaces the catalogue the configuration names: a spec that scripts or counts its calls. */
  readonly catalog?: BibliographicCatalogPort;
  /** Replaces the scanner (the stub one by default). */
  readonly scanner?: ShelfScannerPort;
  readonly dailyScanLimit?: string;
}

/**
 * Starts the real `AppModule` on an ephemeral port: the Postgres of docker-compose for the
 * reconciliation, the recognition archive in memory.
 */
export async function startReconciliationApp(
  options: ReconciliationApiOptions,
  pool: Pool,
  scans: InMemoryShelfScanRepository,
) {
  const environment = reconciliationEnvironment(
    options.catalogProvider ?? 'stub',
    options.dailyScanLimit ?? '1000',
  );
  const database = migratedPool(pool);
  const archive = inMemoryArchive(scans);
  let builder = Test.createTestingModule({ imports: [AppModule.withEnvironment(environment)] })
    .overrideModule(LoggerModule)
    .useModule(LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }))
    .overrideProvider(database.token)
    .useFactory({ factory: database.factory })
    .overrideProvider(archive.token)
    .useValue(archive.value);
  if (options.catalog !== undefined) {
    builder = builder.overrideProvider(BIBLIOGRAPHIC_CATALOG_PORT).useValue(options.catalog);
  }
  if (options.scanner !== undefined) {
    builder = builder.overrideProvider(SHELF_SCANNER_PORT).useValue(options.scanner);
  }
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>();
  applyHttpBoundary(app, environment);
  await app.listen(0, '127.0.0.1');

  return { app, baseUrl: await app.getUrl() };
}
