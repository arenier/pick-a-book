# Research: Réconciliation bibliographique des livres détectés

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-09-28

Chaque section suit le format Décision / Raison / Alternatives écartées. Les points qui dépendent
de l'ADR d'enrichissement bibliographique (#20) sont signalés comme **provisoires** : le plan les
tranche assez pour construire et tester, l'ADR les confirme ou les remplace.

## 1. Le référentiel n'est pas choisi : construire sans l'attendre

**Décision** : concevoir tout ce qui ne dépend pas du référentiel — domaine, règles de
correspondance, conservation, orchestration, HTTP, écran — derrière un port
`BibliographicCatalogPort`, livré avec deux adapters sans réseau (`stub`, `offline`, §12). L'adapter
du vrai référentiel est une tâche **bloquée par l'ADR #20** : elle ne démarre qu'une fois l'ADR
accepté, et c'est elle qui rend SC-001 et SC-002 mesurables.

**Raison** : la spec est agnostique du référentiel (Assumptions) et l'issue #20 exige une mesure de
couverture sur le jeu de référence avant de choisir — une mesure qui a elle-même besoin d'un
appariement pour compter les résolutions. Construire le cœur d'abord donne à l'ADR l'outil de sa
mesure : il suffira d'écrire un adapter par candidat et de les passer au bench (§13).

**Alternatives écartées** :
- *Écrire l'ADR #20 avant le plan* — bloque tout le travail sur une décision qui n'en touche qu'un
  adapter ; l'hexagonal existe précisément pour isoler ce choix (ADR 0002).
- *Choisir un référentiel dans le plan* (OpenLibrary, plus simple à interroger) — ce serait trancher
  à la place de l'ADR, ce que la constitution interdit (§ Articulation avec les ADR).

## 2. Où vit quoi

**Décision** :
- **`bibliography`** est fondé par cette feature : `libs/bibliography/{domain,application,infrastructure}`,
  tags `context:bibliography`, `scope:api`. Il porte toute la réconciliation — règles de
  correspondance, statuts, décision de l'utilisateur, conservation.
- **`recognition`** gagne un use case de lecture, `GetDetectedBooksUseCase`, qui rend les livres
  détectés d'une analyse en DTO de frontière, et une erreur `ShelfScanNotCompleted` (on ne réconcilie
  pas une analyse en attente ou en échec).
- **`apps/api`** gagne le **premier orchestrateur** du projet (ADR 0003),
  `ReconcileShelfPhotoUseCase` : il lit les livres détectés côté `recognition`, les passe à
  `bibliography`, rend le résultat. Il séquence et traduit, il ne décide rien.
- La levée d'ambiguïté (US2) ne touche que `bibliography` : son contrôleur appelle directement le
  use case du contexte, sans orchestrateur.

**Raison** : ADR 0010 place réconciliation et enrichissement dans `bibliography` et prévoit que la
lib arrive « avec la première implémentation » — c'est celle-ci. Le seul croisement de contextes est
la lecture des livres détectés, d'où un orchestrateur minimal. La règle « seule une analyse aboutie a
des livres » appartient à `recognition` (c'est l'invariant de `ShelfScanRecord`), pas à
l'orchestrateur.

**Alternatives écartées** :
- *Le front renvoie les livres détectés à réconcilier* — le serveur réconcilierait ce que le client
  lui dit avoir lu, sans preuve que c'est ce qui est conservé ; et FR-013 exige que la lecture reste
  celle de la reconnaissance.
- *`bibliography` lit la table `shelf_scans`* — un contexte qui lit le stockage d'un autre, c'est
  l'import interdit par ADR 0002, contourné par SQL.
- *Réconcilier dans `ScanStoredShelfPhotoUseCase`* — mettrait `bibliography` dans `recognition`.

## 3. Déroulé : une requête de plus après l'analyse, rejouable

**Décision** : la réconciliation est une requête distincte, **`POST /shelf-photos/{id}/reconciliation`**,
que le front envoie dès que la liste des livres détectés est affichée. Elle est **idempotente et
rejouable** : chaque appel ne réconcilie que les livres sans résultat ou « non vérifiés », et rend
l'état de tous les livres. Le même appel sert donc à la première réconciliation et à la relance
(US4, FR-014). Traitement synchrone dans la requête (ADR 0003).

**Raison** :
- La spec veut la liste affichée dès la réponse de la reconnaissance, les statuts la complétant
  ensuite (Assumptions) : chaîner la réconciliation dans `POST …/scan` retarderait la liste de toute
  la durée de la réconciliation.
- La relance tombe gratuitement : « ne traiter que ce qui n'a pas de statut définitif » est la même
  règle au premier appel et au suivant.
- Synchrone reste dans le cadre d'ADR 0003 : ≤ 20 s pour 30 livres (SC-003, §7), du même ordre que
  l'analyse (~27 s) qui l'est déjà. Un travail en arrière-plan imposerait un nouvel ADR.

Deux appels simultanés sur la même analyse (l'écran monté deux fois par `StrictMode` en
développement, un double appui sur « relancer ») ne sont pas une erreur : l'index unique partiel
(§8) refuse la seconde tentative définitive, et le use case relit alors l'état et le rend — les deux
appels répondent 200. L'écran, de son côté, n'envoie qu'un appel par analyse.

**Alternatives écartées** :
- *Réconcilier dans la même requête que l'analyse* — voir ci-dessus ; et un échec du référentiel se
  mêlerait à la réponse de la reconnaissance.
- *Un endpoint de relance séparé* — deux routes pour une seule règle.
- *Une requête par livre depuis le front* — 30 allers-retours depuis un téléphone en ressourcerie,
  et la politique de parallélisme (§7) dispersée dans le client.

## 4. Désigner un livre détecté à travers la frontière

**Décision** : un livre détecté est désigné par **(identifiant de l'analyse, position)** — l'`id`
déjà exposé par `POST /shelf-photos`, et l'index du livre dans la liste rendue par la reconnaissance.
`bibliography` le conserve comme une **référence opaque** (`ShelfBookRef`), sans clé étrangère vers
les tables de `recognition`.

**Raison** : la liste d'une analyse est figée — une analyse ne se refait pas (409,
spec 001 research §7) — donc la position est stable. Pas de clé étrangère inter-contextes : elle
couplerait deux schémas qu'ADR 0010 veut séparés ; la cohérence est garantie par l'orchestrateur,
qui ne transmet que des livres lus dans `recognition`.

**Alternatives écartées** :
- *Donner un identifiant à chaque livre détecté dans `recognition`* — changement de schéma et de
  contrat de la spec 001 pour un gain nul tant que la liste est immuable.
- *Désigner par (titre, auteur)* — deux tranches peuvent porter le même titre (Edge Cases).

## 5. Stratégie d'appariement — provisoire, confirmée par l'ADR #20

**Décision** : une fonction pure du domaine, `matchBook(requête, notices, réglages)`, qui rend un
résultat (confirmé, ambigu, non trouvé). Réglages initiaux, à calibrer sur le jeu de référence (#10) :

1. **Normalisation** : `normalizeText` de `libs/shared/text-match` (casse, accents, ponctuation,
   espaces — déjà la règle du bench), plus, propre à la réconciliation : suppression de l'article
   initial (le, la, les, l', un, une, des, the, a, an) et comparaison aussi au **titre principal**
   de la notice (avant `:`, ` - `, `/`), un référentiel ajoutant souvent un sous-titre ou la
   mention de responsabilité (« La peste / Albert Camus »).
2. **Score titre** : `similarity` (Levenshtein rapporté à la longueur), maximum sur les formes
   ci-dessus. Seuil **0,85** — le seuil par défaut de `text-match`, qui laisse passer une ou deux
   lettres mal lues (FR-003).
3. **Score auteur** (seulement si un auteur a été lu) : comparaison à chaque auteur de la notice,
   indépendante de l'ordre (« Camus, Albert » = « Albert Camus »), les dates entre parenthèses
   retirées ; une forme abrégée compatible (« A. Camus », « Camus ») compte comme une
   correspondance (score 0,9). Seuil **0,85**. Un auteur lu qui ne correspond pas **écarte** la
   notice, même si le titre correspond (FR-003, Edge Cases).
4. **Regroupement par œuvre** : les notices retenues sont regroupées par `workKey` (§6) ; le score
   d'une œuvre est celui de sa meilleure notice, qui devient la notice représentative (FR-007).
5. **Marge de vraisemblance** : ne restent candidates que les œuvres dont le score est à moins de
   **0,1** de la meilleure. Une œuvre nettement moins ressemblante n'est pas une ambiguïté.
6. **Verdict** : 0 œuvre → non trouvé ; 1 → confirmé ; ≥ 2 → ambigu, candidats classés par score
   décroissant, **5 au plus** (FR-010, écran de téléphone).

Score combiné d'une notice : score titre seul si aucun auteur n'a été lu, sinon moyenne pondérée
0,7 × titre + 0,3 × auteur (le titre est l'identifiant irréductible, ADR 0005).

**Raison** : la spec fixe les tolérances en termes observables ; `text-match` existe pour ce geste
(son README l'annonce) ; des réglages chiffrés sont nécessaires pour tester. L'ADR #20 doit trancher
« normalisation, seuils, traitement des candidats ambigus » : les réglages sont un objet de
configuration du domaine (`MatchingSettings`), pas des constantes dispersées, pour qu'il les change
sans toucher aux règles.

**Alternatives écartées** :
- *Faire confiance au classement du référentiel* — chaque référentiel classe à sa façon ; SC-002
  exige que la confirmation repose sur une règle à nous, stable d'un référentiel à l'autre.
- *Lever automatiquement l'ambiguïté au-dessus d'un écart de score* — c'est « lever d'office »,
  exclu par la spec (FR-010) ; la marge (5.) ne fait qu'écarter ce qui n'est pas plausible.
- *Recherche phonétique ou par embeddings* — sans mesure qui la justifie, et hors du budget de
  maintenance ; à reconsidérer si le bench montre un plafond.

## 6. Contrat du port `BibliographicCatalogPort`

**Décision** :

```ts
interface BibliographicCatalogPort {
  readonly name: CatalogName;                  // conservé avec chaque tentative (FR-017)
  search(query: BookQuery, signal: AbortSignal): Promise<CatalogRecord[]>;
}
```

`CatalogRecord` = identifiant stable de la notice, `workKey`, titre, auteurs. L'adapter rend au
plus **20 notices** par recherche, cherche par titre et, quand il est lu, par auteur, et rejette
avec `CatalogUnavailable` (cause : `unavailable`, `invalid_response`) quand il ne peut pas répondre.
Rendre une liste vide n'est pas une erreur : c'est « rien trouvé ».

`workKey` est **calculé par l'adapter** : ce qui identifie une œuvre dépend du référentiel
(OpenLibrary expose directement un identifiant d'œuvre ; le catalogue général de la BnF décrit des
éditions, l'adapter dérivera la clé — par exemple de l'auteur et du titre uniforme normalisés). Le
domaine, lui, porte la règle « plusieurs éditions d'une même œuvre ne font pas une ambiguïté »
(FR-007).

**Raison** : c'est l'intersection de ce qu'offrent les deux finalistes de l'issue #20 d'après leur
documentation (OpenLibrary : `search.json` rend `key` d'œuvre, `title`, `author_name` ; BnF SRU :
notices Dublin Core avec identifiant ARK, `dc:title`, `dc:creator` en « Nom, Prénom (dates) »). La
vérification sur réponses réelles fait partie de la mesure de l'ADR #20 — l'accès réseau sortant de
cet environnement ne permet pas de la faire ici. Le signal d'annulation laisse l'application imposer
son délai (§7) sans que l'adapter lise une horloge.

**Alternatives écartées** :
- *Deux méthodes (`searchByTitle`, `searchByTitleAndAuthor`)* — une requête optionnellement enrichie
  suffit, et c'est l'adapter qui sait composer la requête de son référentiel.
- *Le port rend des œuvres déjà regroupées* — enfouirait FR-007 dans chaque adapter, sans test commun.

## 7. Délais et parallélisme

**Décision** : dans `ReconcileDetectedBooksUseCase`, **4 recherches en parallèle** au plus, **8 s**
par recherche (au-delà : « non vérifié », cause `timeout`), et une **échéance globale de 18 s** au-delà
de laquelle les recherches pas encore lancées sont marquées « non vérifié » (`timeout`) sans être
tentées. Un petit utilitaire local borne le parallélisme — pas de dépendance (`type:application`
n'autorise que `tslib`).

**Raison** : SC-003 (30 livres en 20 s) ; 30 recherches à 4 de front, à 1–2 s chacune, tiennent en
8–15 s. Les référentiels ouverts limitent le débit par comportement (OpenLibrary demande de la
retenue) : 4 est un compromis prudent. L'échéance globale garantit la réponse même si le référentiel
ralentit, et la relance (US4) rattrape les livres restés « non vérifiés ». Réglages rassemblés dans
un objet (`ReconciliationLimits`) injecté par la composition root, à ajuster après l'ADR #20.

**Alternatives écartées** :
- *Tout en parallèle* — 30 requêtes simultanées vers un service gratuit, c'est se faire limiter.
- *Séquentiel* — 30 × 1–2 s dépasse SC-003.

## 8. Persistance

**Décision** : trois tables dans le schéma Postgres existant, propres à `bibliography`, générées
par Drizzle dans `libs/bibliography/infrastructure/src/lib/drizzle/` (`data-model.md` §Stockage) :

- `reconciliation_attempts` — une ligne par tentative sur un livre : référence du livre, requête
  (titre, auteur lus), référentiel, verdict, cause d'un « non vérifié », date. **Index unique
  partiel** : au plus une tentative au verdict définitif par livre — deux réconciliations
  concurrentes ne peuvent pas en enregistrer deux.
- `reconciliation_candidates` — les notices examinées par une tentative, avec rang, scores, et un
  drapeau « retenue » (candidate ou notice confirmée) ; y compris les meilleures notices **écartées**
  (3 au plus), pour l'analyse des erreurs (§9).
- `reconciliation_decisions` — la décision de l'utilisateur sur une tentative ambiguë, **unique par
  tentative**, jamais une mise à jour de la tentative (FR-016).

Le statut courant d'un livre se déduit : dernière tentative, corrigée par une décision s'il y en a
une. Pas de clé étrangère vers `recognition` (§4).

Côté exploitation :
- **Migrations par contexte** : dossier propre à `bibliography`, table de suivi propre
  (`__drizzle_migrations_bibliography`) — Drizzle ordonne ses migrations par date dans une même table,
  deux dossiers la partageant se marcheraient dessus. `migrateDatabase` sort de
  `recognition-infrastructure` vers une lib partagée, `libs/shared/sql-migrations` (tags
  `type:shared`, `context:none`, `scope:api`), avec la table de suivi en paramètre — même verrou
  consultatif pour toutes, donc migrations sérialisées au démarrage.
- **Pourquoi une lib partagée ne contredit pas « le SQL, le schéma et les migrations restent dans
  `infrastructure` »** (`CLAUDE.md`) : ce qui reste dans chaque `infrastructure`, ce sont les
  fichiers de migration et le schéma — ce qui décrit les tables d'un contexte. Le lanceur ne
  connaît aucune table : il applique un dossier sous un verrou. Le dupliquer par contexte, ce
  serait deux copies du même verrou, qu'un oubli désynchroniserait. La lib est `scope:api` — le
  front n'en a pas l'usage —, nuance de « `libs/shared/*` est importable par tous » que `CLAUDE.md`
  précisera (tasks T063).
- **Un seul pool Postgres** pour l'API : un `DatabaseModule` de `apps/api` ouvre le pool et applique
  les migrations de chaque contexte avant de servir ; `createShelfScanArchive` reçoit le pool au lieu
  de l'ouvrir. Évite deux pools vers la même base Neon (ADR 0006).
- `yarn db:generate` génère les migrations des deux contextes ; le build de l'API copie les deux
  dossiers (`dist/migrations/recognition`, `dist/migrations/bibliography`).

**Raison** : ADR 0006 (Postgres, Drizzle, schéma en `infrastructure`) ; ADR 0010 (schéma propre à
chaque contexte). Des tentatives en lignes séparées plutôt qu'un statut mis à jour : c'est ce qui
garde l'historique voulu par US5 sans colonne « précédent statut ».

**Alternatives écartées** :
- *Une colonne JSONB par livre sur `shelf_scans`* — `bibliography` écrirait dans une table de
  `recognition`.
- *Un seul dossier de migrations pour tout le repo* — le schéma d'un contexte sortirait de son
  `infrastructure`.
- *Un schéma Postgres par contexte* (`bibliography.*`) — défendable, mais rien ne l'exige
  aujourd'hui et `recognition` n'en a pas ; à décider pour tous d'un coup s'il le faut.

## 9. Conserver pour l'analyse des erreurs (US5)

**Décision** : tout ce qu'exigent FR-015 à FR-017 tient dans les trois tables du §8, sans table
dédiée à l'analyse :

| Fait | Où |
|---|---|
| Ce qui a été lu (titre, auteur) | `reconciliation_attempts.query_*` (copie de la requête) |
| Notice retenue, candidats, leurs scores titre/auteur/combiné, leur rang | `reconciliation_candidates` (`retained = true`) |
| Meilleures notices écartées et leurs scores | `reconciliation_candidates` (`retained = false`) |
| Référentiel interrogé, date | `reconciliation_attempts.catalog`, `attempted_at` |
| Cause d'un « non vérifié » | `reconciliation_attempts.not_verified_cause` |
| Résultat automatique et décision de l'utilisateur | tentative + `reconciliation_decisions` |

Les catégories de SC-007 se déduisent par requête (`data-model.md` §Catégories d'écart). Aucune de
ces données n'est exposée par l'API (FR-018).

**Raison** : les requêtes sont copiées pour que l'analyse se suffise des tables de `bibliography`
(la reconnaissance ne relit pas une photo deux fois de la même façon). Les notices écartées
distinguent « le référentiel ne connaît rien d'approchant » de « la lecture était trop dégradée pour
passer le seuil » — la question même que l'ADR 0005 pose pour la bascule vers l'OCR.

**Alternatives écartées** :
- *Journal d'événements séparé* — double écriture, et ADR 0003 réserve la traçabilité à une
  journalisation explicite si le besoin devient un parcours, pas des faits métier.
- *Réponse brute du référentiel conservée* — volumineuse, propre à chaque référentiel, et inutile
  une fois les scores calculés.

## 10. Levée d'ambiguïté

**Décision** : `POST /shelf-photos/{id}/books/{position}/decision`, corps
`{ "choice": "candidate", "recordId": "…" }` ou `{ "choice": "none" }`. Autorisée **une fois**, sur un
livre dont le statut courant est « ambigu » ; `recordId` doit être l'un des candidats conservés.
Sinon 409 (pas ambigu, ou déjà décidé) ou 400 (candidat inconnu).

**Raison** : la spec n'autorise que choisir ou rejeter (FR-010) et veut l'automatique conservé à côté
(FR-016) : une décision unique par tentative ambiguë, c'est la contrainte la plus simple qui tienne
les deux. Revenir sur un choix n'est pas demandé : ajouté au parking.

**Alternatives écartées** : *`PUT` sur l'état du livre* — laisserait écrire n'importe quel statut,
alors que seules deux transitions existent.

## 11. Écran

**Décision** : une nouvelle slice `apps/web/src/features/reconciliation/` (`api/`, `model/`, `ui/`,
`i18n/`), que **le shell compose** avec `photo-upload` : l'écran d'envoi rend son résultat par une
prop de rendu fournie par `app.tsx`, qui y branche la liste réconciliée. `UploadState` en succès
porte désormais l'`id` de l'analyse.

La liste réconciliée affiche d'abord les livres détectés avec une mention « vérification en cours »,
puis le statut de chacun : forme de référence pour un confirmé (et la lecture en second quand elle
diffère), candidats dépliables avec « aucun ne correspond » pour un ambigu, « inconnu du
référentiel » pour un non trouvé, « non vérifié » avec un bouton de relance global. Un échec de
l'appel lui-même (réseau, 5xx) s'affiche comme si tous les livres étaient « non vérifiés » : les
livres restent visibles (FR-008). Styles en CSS modules, comme la slice existante ; les composants
de `libs/shared/ui` (ADR 0012) les remplaceront quand la lib existera.

**Raison** : une slice n'importe pas l'intérieur d'une autre (CLAUDE.md) ; la réconciliation a ses
propres appels, états, échecs et textes. Composer dans le shell évite une lib partagée pour un seul
usage.

**Alternatives écartées** :
- *Étendre `photo-upload`* — la slice mêlerait deux features et deux catalogues de messages.
- *Une lib partagée pour le type « livre détecté »* — un seul consommateur ; le type est redéclaré
  localement, comme la slice existante le fait déjà pour le contrat HTTP (spec 001 research §5).

## 12. Configuration et adapters sans réseau

**Décision** : `BIBLIOGRAPHIC_CATALOG_PROVIDER`, validée au démarrage comme
`SHELF_SCANNER_PROVIDER` : `stub` (défaut) ou `offline`, en attendant le vrai référentiel.
- `stub` : un petit catalogue en mémoire qui couvre tous les verdicts avec les livres du scanner
  stub — confirmés (Duras, Perec, Ernaux), non trouvé (« Titre peu lisible »), et un ambigu, pour
  lequel le scanner stub gagne **une détection sans auteur** dont le titre est porté par deux œuvres
  du catalogue stub.
- `offline` : rejette toujours avec `CatalogUnavailable` — de quoi voir « non vérifié » et la
  relance (US4) en redémarrant l'API.

**Raison** : même logique que le scanner stub (ADR 0005) : faire tourner la chaîne de bout en bout
sans clé ni réseau, et travailler l'écran avant l'ADR #20. La détection sans auteur ajoutée au stub
exerce au passage l'amendement de l'ADR 0005, jamais montré jusqu'ici par le stub.

## 13. Tests

**Décision** :
- **Domaine** : `matchBook` sur tables de cas (lecture exacte, une lettre de moins, article, sous-titre,
  « A. Camus », auteur contradictoire, titre seul unique/partagé, éditions multiples, marge) ;
  `BookReconciliation` (transitions, décision unique). Sans infra.
- **Application** : `ReconcileDetectedBooksUseCase` et `DecideAmbiguityUseCase` avec un référentiel
  factice et un dépôt en mémoire (`testing/`), délais testés avec les faux timers de Vitest.
- **Infrastructure** : dépôt Drizzle contre le Postgres du compose (convention) ; adapters `stub` et
  `offline` en unitaire ; l'adapter réel, après l'ADR #20, sur **réponses enregistrées**.
- **API** : orchestrateur avec des doubles de use cases ; routes en spec HTTP comme
  `shelf-photos.http.spec.ts`.
- **Web** : slice avec `fetch` injecté, comme `photo-upload`.
- **SC-001/SC-002** : mesurés par le bench (`tools/bench`), étendu d'un mode réconciliation une fois
  l'adapter réel écrit — manuel, hors CI, comme la non-régression de la reconnaissance.
