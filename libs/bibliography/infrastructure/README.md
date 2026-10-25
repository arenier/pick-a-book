# bibliography-infrastructure

Adapters du bounded context `bibliography`. Personne ne dépend de cette lib hors de la composition
root d'`apps/api` (ADR 0002).

## Adapters disponibles

| Adapter | `BIBLIOGRAPHIC_CATALOG_PROVIDER` | Notes |
|---|---|---|
| `BnfSruCatalogAdapter` (+ `BnfAuthorityAdapter`) | `bnf` | Catalogue général de la BnF, API SRU, sans clé. Réponses validées par `zod`, tout ou rien. |
| `StubBibliographicCatalogAdapter` | `stub` *(défaut)* | N'appelle rien. Connaît les livres du scanner `stub`, dont deux œuvres « La chute ». |
| `OfflineBibliographicCatalogAdapter` | `offline` | Toujours indisponible : tous les livres sortent « non vérifiés ». |

## Persistance

`DrizzleBookReconciliationRepositoryAdapter` : trois tables (`reconciliation_attempts`,
`reconciliation_candidates`, `reconciliation_decisions`), migrations générées dans
`src/lib/drizzle/migrations/` par `yarn db:generate`, table de suivi propre au contexte. Le schéma
porte les règles que la base peut tenir : une seule tentative définitive par livre, un score si et
seulement si le catalogue a répondu.

## Tests

- Les adapters BnF se testent sur des **réponses enregistrées** (`src/lib/bnf/fixtures/`, la
  provenance et l'URL exacte de chacune sont dans `fixtures/README.md`), jamais contre la BnF vive.
- Le dépôt se teste contre le **vrai Postgres** de `docker compose` (`DATABASE_URL`, port 5433 par
  défaut), comme `recognition-infrastructure`.

## Commandes

```bash
yarn nx test bibliography-infrastructure
yarn nx lint bibliography-infrastructure
yarn nx build bibliography-infrastructure
```
