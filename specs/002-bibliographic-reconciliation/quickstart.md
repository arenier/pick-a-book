# Quickstart : vérifier la réconciliation bibliographique

Scénarios de validation de bout en bout, sans clé ni réseau : scanner `stub`, référentiel `stub` ou
`offline` (research §12). Le contrat détaillé est dans [contracts/reconciliation-api.md](contracts/reconciliation-api.md),
les données dans [data-model.md](data-model.md).

## Prérequis

```bash
cp .env.example .env                       # SHELF_SCANNER_PROVIDER=stub, BIBLIOGRAPHIC_CATALOG_PROVIDER=stub
docker compose up -d db bucket             # Postgres + émulateur de bucket
yarn api                                   # applique les migrations des deux contextes au démarrage
yarn web                                   # http://localhost:4200
```

Au démarrage, le journal de l'API ne doit signaler aucune erreur de migration ; les tables
`reconciliation_attempts`, `reconciliation_candidates`, `reconciliation_decisions` et la table de
suivi `__drizzle_migrations_bibliography` existent :

```bash
docker compose exec db psql -U pick_a_book -c '\dt *reconciliation*'
```

## Scénario 1 — statuts après une analyse (US1)

Dans l'écran : choisir une photo quelconque, l'analyser. Attendu :

1. la liste des livres détectés s'affiche dès la fin de l'analyse, chaque livre marqué
   « vérification en cours » ;
2. puis, en quelques secondes, les statuts : Duras, Perec et Ernaux **confirmés** avec leur forme de
   référence ; « Titre peu lisible » **inconnu du référentiel** ; le livre sans auteur **ambigu** ;
3. aucun défilement horizontal à 360 px de large (SC-006).

En HTTP, avec l'`id` rendu par `POST /shelf-photos` :

```bash
ID=$(curl -s -F photo=@some-photo.jpg localhost:3000/shelf-photos | jq -r .id)
curl -s -X POST localhost:3000/shelf-photos/$ID/scan > /dev/null
curl -s -X POST localhost:3000/shelf-photos/$ID/reconciliation | jq '.books[] | {position, status}'
```

Rejouer le dernier appel rend exactement le même état, sans nouvelle tentative en base (FR-014).

## Scénario 2 — lever une ambiguïté (US2)

Dans l'écran : déplier le livre ambigu, choisir un candidat. Attendu : le livre passe **confirmé**
avec la notice choisie. Sur une autre analyse, choisir « aucun ne correspond » : le livre passe
**inconnu du référentiel**.

```bash
RECORD=$(curl -s -X POST localhost:3000/shelf-photos/$ID/reconciliation \
  | jq -r '.books[] | select(.status == "ambiguous") | .candidates[0].recordId')
POS=$(curl -s -X POST localhost:3000/shelf-photos/$ID/reconciliation \
  | jq '.books[] | select(.status == "ambiguous") | .position')
curl -s -X POST localhost:3000/shelf-photos/$ID/books/$POS/decision \
  -H 'content-type: application/json' -d "{\"choice\":\"candidate\",\"recordId\":\"$RECORD\"}" | jq
# → status "confirmed", confirmedBy "user". Rejouer la même requête : 409.
```

## Scénario 3 — référentiel indisponible, puis relance (US4, FR-008)

```bash
BIBLIOGRAPHIC_CATALOG_PROVIDER=offline yarn api
```

Analyser une photo : les livres s'affichent, tous **non vérifiés**, avec un bouton de relance ; pas
de message d'échec de l'analyse. Arrêter l'API, la relancer avec `stub`, puis, sans renvoyer la
photo ni recharger la page, relancer la vérification : les livres reçoivent leur statut définitif.

## Scénario 4 — faits conservés pour l'analyse des erreurs (US5)

Après les scénarios 1 à 3 :

```sql
select a.position, a.query_title, a.verdict, a.not_verified_cause, a.catalog,
       c.rank, c.title, c.title_score, c.author_score, c.score, c.retained, d.kind
from reconciliation_attempts a
left join reconciliation_candidates c on c.attempt_id = a.id
left join reconciliation_decisions d on d.attempt_id = a.id
order by a.scan_ref, a.position, a.attempted_at, c.rank;
```

Attendu : chaque livre y figure avec la lecture, le référentiel, les scores de ses notices retenues
et écartées ; le livre dont l'ambiguïté a été levée garde sa tentative `ambiguous` **et** la
décision ; les tentatives `not_verified` du scénario 3 restent, suivies de la tentative définitive.
Chaque ligne se range dans une catégorie de `data-model.md` §Catégories d'écart (SC-007).

## Vérifications automatiques

```bash
yarn check                                  # lint, format, typecheck, test, build, translations
yarn lint                                   # dont les frontières : bibliography n'importe pas recognition
```

## Après l'ADR #20 (référentiel choisi)

Avec l'adapter réel (`BIBLIOGRAPHIC_CATALOG_PROVIDER=<référentiel>`), mesurer SC-001 et SC-002 sur le
jeu de référence de photos réelles (#10) par le mode réconciliation du bench (`yarn bench`, voir
`tools/bench/README.md`) : ≥ 80 % des livres présents et bien lus confirmés, < 2 % de confirmations
ne correspondant à aucun livre de l'étagère.
