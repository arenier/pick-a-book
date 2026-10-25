import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  GetShelfReconciliationUseCase,
  ReconcileDetectedBooksUseCase,
} from '@pick-a-book/bibliography-application';
import {
  AUTHORITY_PORT,
  BIBLIOGRAPHIC_CATALOG_PORT,
  BOOK_RECONCILIATION_REPOSITORY_PORT,
} from '@pick-a-book/bibliography-domain';
import {
  DrizzleBookReconciliationRepositoryAdapter,
  OfflineBibliographicCatalogAdapter,
  StubAuthorityAdapter,
  StubBibliographicCatalogAdapter,
} from '@pick-a-book/bibliography-infrastructure';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../config/environment';
import { DATABASE_POOL } from '../database/database.module';
import { BibliographyModule } from './bibliography.module';

const pool = new Pool({ connectionString: 'postgresql://user:secret@localhost:5433/db' });

/** The pool the root module would provide: never connected here, the adapters are lazy. */
@Global()
@Module({ providers: [{ provide: DATABASE_POOL, useValue: pool }], exports: [DATABASE_POOL] })
class FakeDatabaseModule {}

const environment = (provider: string) =>
  loadEnvironment({
    DATABASE_URL: 'postgresql://user:secret@localhost:5433/db',
    BUCKET_NAME: 'b',
    BIBLIOGRAPHIC_CATALOG_PROVIDER: provider,
  });

async function compiled(provider: string) {
  return Test.createTestingModule({
    imports: [FakeDatabaseModule, BibliographyModule.withEnvironment(environment(provider))],
  }).compile();
}

describe('BibliographyModule', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('binds each port to the adapter its configuration names', async () => {
    const moduleRef = await compiled('stub');

    expect(moduleRef.get(BIBLIOGRAPHIC_CATALOG_PORT)).toBeInstanceOf(
      StubBibliographicCatalogAdapter,
    );
    expect(moduleRef.get(AUTHORITY_PORT)).toBeInstanceOf(StubAuthorityAdapter);
    expect(moduleRef.get(BOOK_RECONCILIATION_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleBookReconciliationRepositoryAdapter,
    );
  });

  it('follows the configuration: offline binds the unavailable catalogue to both ports', async () => {
    const moduleRef = await compiled('offline');

    expect(moduleRef.get(BIBLIOGRAPHIC_CATALOG_PORT)).toBeInstanceOf(
      OfflineBibliographicCatalogAdapter,
    );
    expect(moduleRef.get(AUTHORITY_PORT)).toBeInstanceOf(OfflineBibliographicCatalogAdapter);
  });

  it('builds the use cases over the ports', async () => {
    const moduleRef = await compiled('stub');

    expect(moduleRef.get(ReconcileDetectedBooksUseCase)).toBeInstanceOf(
      ReconcileDetectedBooksUseCase,
    );
    expect(moduleRef.get(GetShelfReconciliationUseCase)).toBeInstanceOf(
      GetShelfReconciliationUseCase,
    );
  });
});
