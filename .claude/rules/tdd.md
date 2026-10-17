# TDD systématique

S'applique à tout le dépôt, IaC comprise.

- **Rouge, vert, refactor.** Le test qui échoue d'abord, puis le code minimal qui le fait passer,
  puis refactor. Aucun code de production sans un test qui le motive.
- **Correctifs inclus** : le test de non-régression s'écrit **avant** le fix, et on le voit échouer.
- **L'IaC aussi** : les modules d'infrastructure sont testés, assertions écrites d'abord
  (`terraform test`, voir [`infra/README.md`](../../infra/README.md)). La CI refuse un module ou un
  environnement sans test.
- **`domain` et `application` se testent sans infra.** Les adapters, eux, se testent **contre la
  vraie techno** : le Postgres et l'émulateur de bucket de `docker compose` (voir `CLAUDE.md`
  § Commandes), `pg_dump`/`pg_restore`/`psql` réels pour `tools/db-backup`.
- **Adapters de reconnaissance** : tests sur **réponses enregistrées**. La non-régression sur photos
  réelles est un test séparé et manuel (`yarn bench`, hors CI).

Le détail des règles propres aux fichiers de test est dans [`tests.md`](tests.md).
