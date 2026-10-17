# Quickstart : vérifier la réconciliation bibliographique

Scénarios de validation de bout en bout. Les scénarios 1 à 4 tournent sans réseau : scanner `stub`,
catalogue `stub` ou `offline` (research §12). Le scénario 5 interroge la BnF. Le contrat détaillé
est dans [contracts/reconciliation-api.md](contracts/reconciliation-api.md), les données dans
[data-model.md](data-model.md).

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

## Scénario 1 — statuts après une analyse, puis dans l'historique (US1)

Dans l'écran : choisir une photo quelconque, l'analyser. Attendu :

1. la liste des livres détectés s'affiche dès la fin de l'analyse, chaque livre marqué
   « vérification en cours » ;
2. puis, en quelques secondes, les statuts : Duras, Perec et Ernaux **confirmés** avec leur forme de
   référence ; « Titre peu lisible » **inconnu du catalogue** ; le livre sans auteur **ambigu** ; la
   mention de la BnF sous la liste ;
3. ouvrir l'historique (`#/historique`), puis cet envoi : les mêmes statuts s'affichent, **sans**
   « vérification en cours » ni nouvel appel au catalogue ;
4. aucun défilement horizontal à 360 px de large, sur les deux écrans (SC-006).

En HTTP, avec l'`id` rendu par `POST /shelf-photos` :

```bash
ID=$(curl -s -F photo=@some-photo.jpg localhost:3000/shelf-photos | jq -r .id)
curl -s -X POST localhost:3000/shelf-photos/$ID/scan > /dev/null
curl -s localhost:3000/shelf-photos/$ID/reconciliation | jq '.books[] | {position, status}'          # pending
curl -s -X POST localhost:3000/shelf-photos/$ID/reconciliation | jq '.books[] | {position, status}'
curl -s localhost:3000/shelf-photos/$ID/reconciliation | jq '.books[] | {position, status}'          # même état
```

Rejouer le `POST` rend exactement le même état, sans nouvelle tentative en base (FR-014).

## Scénario 2 — lever une ambiguïté (US2)

Dans l'écran : déplier le livre ambigu, choisir un candidat. Attendu : le livre passe **confirmé**
avec la notice choisie. Sur une autre analyse, depuis le **détail de l'envoi** dans l'historique,
choisir « aucun ne correspond » : le livre passe **inconnu du catalogue**.

```bash
BOOK=$(curl -s localhost:3000/shelf-photos/$ID/reconciliation | jq -c '.books[] | select(.status == "ambiguous")')
POS=$(jq '.position' <<< "$BOOK")
RECORD=$(jq -r '.candidates[0].recordId' <<< "$BOOK")
curl -s -X POST localhost:3000/shelf-photos/$ID/books/$POS/decision \
  -H 'content-type: application/json' -d "{\"choice\":\"candidate\",\"recordId\":\"$RECORD\"}" | jq
# → status "confirmed", confirmedBy "user". Rejouer la même requête : 409 BOOK_NOT_AMBIGUOUS.
```

## Scénario 3 — catalogue indisponible, puis relance (US4, FR-008)

```bash
BIBLIOGRAPHIC_CATALOG_PROVIDER=offline yarn api
```

Analyser une photo : les livres s'affichent, tous **non vérifiés**, avec un bouton de relance ; pas
de message d'échec de l'analyse. Arrêter l'API, la relancer avec `stub`, puis, sans renvoyer la
photo ni recharger la page, relancer la vérification : les livres reçoivent leur statut définitif.
Recommencer avec un autre envoi, en relançant cette fois depuis son détail dans l'historique.

## Scénario 4 — faits conservés pour l'analyse des erreurs (US5)

Après les scénarios 1 à 3 :

```sql
select a.position, a.query_title, a.verdict, a.cascade_step, a.reconciliation_score,
       a.not_verified_cause, a.catalog,
       c.rank, c.record_id, c.title, c.title_score, c.author_score, c.score, c.retained, d.kind
from reconciliation_attempts a
left join reconciliation_candidates c on c.attempt_id = a.id
left join reconciliation_decisions d on d.attempt_id = a.id
order by a.scan_ref, a.position, a.attempted_at, c.rank;
```

Attendu : chaque livre y figure avec la lecture, le catalogue, l'étape, le score, les scores de ses
notices retenues et écartées ; le livre dont l'ambiguïté a été levée garde sa tentative `ambiguous`
**et** la décision ; les tentatives `not_verified` du scénario 3 restent, suivies de la tentative
définitive. Chaque ligne se range dans une catégorie de `data-model.md` §Catégories d'écart
(SC-007).

## Scénario 5 — contre la BnF (US1, SC-003)

```bash
BIBLIOGRAPHIC_CATALOG_PROVIDER=bnf yarn api
```

Avec un scanner réel (`SHELF_SCANNER_PROVIDER=gemini` et sa clé) et une photo d'étagère de poches,
ou avec le scanner `stub` : les livres reçoivent leur statut en moins de 20 s après l'affichage de
la liste (SC-003), et la forme de référence d'un confirmé est celle de la notice BnF (ARK dans
`recordId`). Ne lancer ce scénario qu'à la main : il interroge un service public.

## Vérifications automatiques

```bash
yarn check                                  # lint, format, typecheck, test, build, translations
yarn lint                                   # dont les frontières : bibliography n'importe pas recognition
```

## Mesure sur le jeu de référence

Avec l'adapter BnF, mesurer SC-001 et SC-002 sur le jeu de référence de photos réelles (#10) par le
mode réconciliation du bench (`yarn bench`, voir `tools/bench/README.md`) : ≥ 80 % des livres
présents et bien lus confirmés, < 2 % de confirmations ne correspondant à aucun livre de l'étagère.
C'est la vérification des conditions de bascule de l'ADR 0014.
