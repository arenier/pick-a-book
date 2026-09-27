# db-backup

Le job de sauvegarde de la base (ADR 0006, amendement du 2026-09-27 ; issue #22) : un `pg_dump`
hebdomadaire de Postgres vers le bucket de sauvegardes. Il tourne en Cloud Run Job ; l'exploitation
(mise en service, alerte, restauration) est dans [`infra/README.md`](../../infra/README.md#sauvegarde-de-la-base--pg_dump-hebdomadaire-adr-0006-issue-22).

## Ce que fait une exécution

1. `pg_dump --format=custom` de `DATABASE_URL`, la connexion **directe** : `pg_dump` ne passe pas
   par PgBouncer en mode transaction.
2. **Preuve** du fichier : `pg_restore --list` doit le lire, et il doit contenir les données d'au
   moins une table. Un fichier vide, ou le dump d'une base vide, fait échouer l'exécution.
3. Envoi dans `BACKUP_BUCKET` sous `postgres/AAAAMMJJTHHMMSSZ.dump`, **sans jamais écraser** un
   objet existant.
4. **Puis seulement**, élagage : il ne reste que les `BACKUP_GENERATIONS` snapshots les plus récents.
   Seuls les noms donnés par le job sont concernés, une copie manuelle déposée dans `postgres/`
   n'est jamais supprimée.

Chaque étape n'a lieu que si la précédente a réussi : une exécution qui échoue laisse le bucket tel
qu'elle l'a trouvé. Une ligne de log JSON par issue (`severity` compris, pour Cloud Logging), et un
code de sortie non nul en cas d'échec : c'est ce que compte l'alerte de fraîcheur.

Les messages d'erreur sont construits à partir du seul `stderr` des outils, mot de passe masqué :
l'erreur native de Node recopierait la ligne de commande, donc l'URL de la base.

## Configuration

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | URL Postgres **directe** (non poolée). En prod, alimentée par le secret `DATABASE_URL_DIRECT`. |
| `BACKUP_BUCKET` | Bucket de destination. |
| `BACKUP_GENERATIONS` | Nombre de snapshots conservés après une exécution réussie (8 en prod). |
| `BUCKET_EMULATOR_HOST` | Local et specs seulement : l'émulateur GCS. |

## Lancer en local

```bash
docker compose up db bucket
yarn nx build db-backup
DATABASE_URL=postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book \
BACKUP_BUCKET=local-backups BACKUP_GENERATIONS=8 BUCKET_EMULATOR_HOST=http://localhost:4443 \
  node tools/db-backup/dist/main.js
```

Le bucket doit exister dans l'émulateur
(`curl -X POST -H 'content-type: application/json' -d '{"name":"local-backups"}' http://localhost:4443/storage/v1/b`).

## Tests

Contre les vraies technologies (`CLAUDE.md`) : `pg_dump`, `pg_restore` et `psql` du `PATH`, le
Postgres et l'émulateur de bucket de docker-compose. Deux conséquences :

- **il faut les outils client Postgres 18 ou plus** : `pg_dump` refuse un serveur d'une majeure plus
  récente que la sienne (`brew install libpq` sur macOS, paquets `postgresql-client-18` du dépôt
  PGDG sous Debian/Ubuntu ; la CI installe ces derniers) ;
- les specs **n'utilisent pas `DATABASE_URL`**, qui peut très bien désigner une vraie base dans le
  shell qui les lance, alors qu'elles créent et suppriment des bases. Elles visent le Postgres de
  docker-compose, ou `DB_BACKUP_TEST_DATABASE_URL` si on veut en viser un autre.

## Image

[`docker/db-backup.Dockerfile`](../../docker/db-backup.Dockerfile) part de l'image officielle
`postgres:18.6-bookworm`, qui fournit `pg_dump` exactement à la version épinglée, et y copie Node.
`yarn deploy:db-backup` la construit avec Cloud Build et fait pointer le job dessus.
