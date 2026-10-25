# shared-sql-migrations

Lanceur de migrations SQL générique, partagé par les contextes qui persistent dans Postgres.

`migrateDatabase(pool, { migrationsFolder, migrationsTable })` applique les migrations d'un dossier
sous verrou consultatif : plusieurs instances qui démarrent ensemble ne se marchent pas dessus.
Chaque contexte a son dossier et sa table de suivi (`__drizzle_migrations_<contexte>`).

Lib partagée au sens de l'ADR 0002 : technique, sans métier. Elle n'importe aucun contexte. Les
fichiers SQL et le schéma restent dans l'`infrastructure` de chaque contexte ; seul le lanceur est
commun. Elle ne sert que le back (`scope:api`).

## Commandes

```bash
yarn nx test shared-sql-migrations
yarn nx lint shared-sql-migrations
yarn nx build shared-sql-migrations
```
