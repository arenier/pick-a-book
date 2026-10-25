import { Module, type DynamicModule } from '@nestjs/common';
import {
  GetShelfReconciliationUseCase,
  ReconcileDetectedBooksUseCase,
  DEFAULT_LIMITS,
} from '@pick-a-book/bibliography-application';
import {
  AUTHORITY_PORT,
  BIBLIOGRAPHIC_CATALOG_PORT,
  BOOK_RECONCILIATION_REPOSITORY_PORT,
  MatchingSettings,
  type AuthorityPort,
  type BibliographicCatalogPort,
  type BookReconciliationRepositoryPort,
} from '@pick-a-book/bibliography-domain';
import { DrizzleBookReconciliationRepositoryAdapter } from '@pick-a-book/bibliography-infrastructure';
import type { Pool } from 'pg';

import type { Environment } from '../config/environment';
import { DATABASE_POOL } from '../database/database.module';
import {
  createBibliographicCatalog,
  type BibliographicCatalogs,
} from './bibliographic-catalog.factory';

const BIBLIOGRAPHIC_CATALOGS = 'BibliographicCatalogs';

/**
 * Composition root of the bibliography context.
 *
 * The only place besides the other contexts' modules allowed to know
 * `bibliography-infrastructure` (ADR 0002): each port is bound to its adapter here, and the use
 * cases only ever see the ports. Which catalogue answers comes from the validated configuration
 * (`BIBLIOGRAPHIC_CATALOG_PROVIDER`). The database is the API's one pool (`DatabaseModule`).
 *
 * It exports its use cases and nothing else: the orchestrator of `apps/api` is the one place that
 * crosses this context with `recognition` (ADR 0003).
 */
@Module({})
export class BibliographyModule {
  static withEnvironment(environment: Environment): DynamicModule {
    return {
      module: BibliographyModule,
      providers: [
        {
          provide: BIBLIOGRAPHIC_CATALOGS,
          useFactory: () => createBibliographicCatalog(environment.bibliographicCatalog),
        },
        {
          provide: BIBLIOGRAPHIC_CATALOG_PORT,
          useFactory: (catalogs: BibliographicCatalogs) => catalogs.catalog,
          inject: [BIBLIOGRAPHIC_CATALOGS],
        },
        {
          provide: AUTHORITY_PORT,
          useFactory: (catalogs: BibliographicCatalogs) => catalogs.authorities,
          inject: [BIBLIOGRAPHIC_CATALOGS],
        },
        {
          provide: BOOK_RECONCILIATION_REPOSITORY_PORT,
          useFactory: (pool: Pool) => new DrizzleBookReconciliationRepositoryAdapter(pool),
          inject: [DATABASE_POOL],
        },
        {
          provide: ReconcileDetectedBooksUseCase,
          useFactory: (
            catalog: BibliographicCatalogPort,
            authorities: AuthorityPort,
            repository: BookReconciliationRepositoryPort,
          ) =>
            new ReconcileDetectedBooksUseCase(
              catalog,
              authorities,
              repository,
              MatchingSettings.defaults(),
              DEFAULT_LIMITS,
            ),
          inject: [BIBLIOGRAPHIC_CATALOG_PORT, AUTHORITY_PORT, BOOK_RECONCILIATION_REPOSITORY_PORT],
        },
        {
          provide: GetShelfReconciliationUseCase,
          useFactory: (repository: BookReconciliationRepositoryPort) =>
            new GetShelfReconciliationUseCase(repository),
          inject: [BOOK_RECONCILIATION_REPOSITORY_PORT],
        },
      ],
      exports: [ReconcileDetectedBooksUseCase, GetShelfReconciliationUseCase],
    };
  }
}
