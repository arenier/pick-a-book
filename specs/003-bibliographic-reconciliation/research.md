# Research: Réconciliation bibliographique des livres détectés

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-09-28 · **Révisé**: 2026-10-17

Chaque section suit le format Décision / Raison / Alternatives écartées.

**Révision du 17/10/2026.** Deux changements de contexte depuis la première version :
- l'**ADR 0014** a choisi le référentiel (catalogue général de la BnF) et posé les principes
  d'appariement. Ses réglages mesurés (étude de l'issue #20) sont reportés ici, comme l'ADR le
  demande. Les sections 1, 5, 6, 7, 8, 12 et 13 changent ; la section 14 est nouvelle ;
- la **spec 002** (PR #82) a livré l'historique, le détail d'un envoi, la relance d'une analyse en
  échec, le propriétaire, les plafonds et la limite de requêtes par source. Les sections 2, 3, 4,
  10, 11 et 15 en tiennent compte.

## 1. Le référentiel : la BnF, derrière un port

**Décision** : le catalogue général de la BnF, interrogé par son API SRU et filtré sur les textes
imprimés (`bib.doctype any "a"`), est l'unique référentiel (ADR 0014). Il reste derrière un port,
`BibliographicCatalogPort`, avec deux adapters sans réseau pour le développement et les tests
(`stub`, `offline`, §12). L'adapter BnF n'est plus bloqué : il fait partie de la feature.

**Raison** : l'ADR a tranché sur mesure (84,8 % de confirmés sur une lecture parfaite, 0 titre
fabriqué confirmé avec un auteur lu, gratuit, sans clé). Le port garde le choix réversible :
OpenLibrary est le repli nommé par les conditions de bascule, et s'ajouterait comme second adapter.

**Alternatives écartées** : celles de l'ADR 0014 (OpenLibrary seul, Google Books comme juge,
ISBNdb).

## 2. Où vit quoi

**Décision** :
- **`bibliography`** est fondé par cette feature : `libs/bibliography/{domain,application,infrastructure}`,
  tags `context:bibliography`, `scope:api`. Il porte toute la réconciliation — cascade (dans
  `application`), règle d'appariement, verdict, regroupement par œuvre et score (dans `domain`),
  décision de l'utilisateur, conservation.
- **`recognition` ne change pas.** Le détail d'un envoi existe depuis la spec 002 :
  `GetShelfScanUseCase` rend, pour le propriétaire seulement, l'issue de l'analyse et, si elle a
  abouti, ses livres dans l'ordre. C'est la lecture dont l'orchestrateur a besoin : ni nouveau use
  case (`GetDetectedBooksUseCase`), ni nouvelle erreur dans `recognition`.
- **`apps/api`** gagne le **premier orchestrateur** du projet (ADR 0003),
  `ReconcileShelfPhotoUseCase` : il lit le détail par `GetShelfScanUseCase`, refuse une analyse qui
  n'a pas abouti, passe les livres à `bibliography` et rend le résultat. Il séquence et traduit, il
  ne décide rien.
- La lecture de l'état conservé (`GET`, §3) et la levée d'ambiguïté (US2) passent aussi par
  l'orchestrateur : seul lui sait vérifier que l'envoi appartient au propriétaire, ce que
  `bibliography` ignore (§15).

**Raison** : ADR 0010 place réconciliation et enrichissement dans `bibliography` et prévoit que la
lib arrive « avec la première implémentation » — c'est celle-ci. La règle « seule une analyse
aboutie a des livres » est déjà portée par `recognition` : le détail n'a de `books` qu'en
`completed`. L'orchestrateur la lit, il ne la réécrit pas.

**Alternatives écartées** :
- *Le front renvoie les livres détectés à réconcilier* — le serveur réconcilierait ce que le client
  lui dit avoir lu, sans preuve que c'est ce qui est conservé ; et FR-013 exige que la lecture reste
  celle de la reconnaissance.
- *`bibliography` lit la table `shelf_scans`* — un contexte qui lit le stockage d'un autre, c'est
  l'import interdit par ADR 0002, contourné par SQL.
- *Réconcilier dans `ScanStoredShelfPhotoUseCase`* — mettrait `bibliography` dans `recognition`.
- *Un `GetDetectedBooksUseCase` dédié* (première version de ce plan) — doublon de
  `GetShelfScanUseCase`, qui fait la même lecture et vérifie déjà le propriétaire.

## 3. Déroulé : une lecture, une requête rejouable

**Décision** :
- **`POST /shelf-photos/{id}/reconciliation`** réconcilie. Le front l'envoie dès que la liste des
  livres détectés est affichée : après un envoi (spec 001), et après une relance d'analyse qui
  aboutit dans le détail d'un envoi (spec 002, US3). L'appel est **idempotent et rejouable** :
  chaque appel ne réconcilie que les livres sans résultat ou « non vérifiés », et rend l'état de
  tous les livres. Le même appel sert donc à la première réconciliation et à la relance (US4,
  FR-014). Traitement synchrone dans la requête (ADR 0003).
- **`GET /shelf-photos/{id}/reconciliation`** rend l'état conservé, **sans jamais appeler le
  catalogue** (SC-005, ADR 0014 : « un livre déjà réconcilié ne rappelle personne »). Le détail d'un
  envoi l'appelle à l'ouverture. S'il reste des livres jamais tentés (envoi antérieur à la feature,
  écran quitté avant la réponse), il enchaîne le `POST` (FR-024).

**Raison** :
- La spec veut la liste affichée dès la réponse de la reconnaissance, les statuts la complétant
  ensuite (Assumptions) : chaîner la réconciliation dans `POST …/scan` retarderait la liste de toute
  la durée de la réconciliation.
- La relance tombe gratuitement : « ne traiter que ce qui n'a pas de statut définitif » est la même
  règle au premier appel et au suivant.
- Une lecture séparée garde l'historique hors de la limite des écritures (§15) : parcourir dix
  envois ne doit pas épuiser les dix requêtes d'écriture par minute de la spec 002.
- Synchrone reste dans le cadre d'ADR 0003 : ≤ 20 s pour 30 livres (SC-003, §7), du même ordre que
  l'analyse (~27 s) qui l'est déjà. Un travail en arrière-plan imposerait un nouvel ADR.

Deux appels simultanés sur la même analyse (l'écran monté deux fois par `StrictMode` en
développement, un double appui sur « relancer ») ne sont pas une erreur : l'index unique partiel
(§8) refuse la seconde tentative définitive, et le use case relit alors l'état et le rend — les deux
appels répondent 200. L'écran, de son côté, n'envoie qu'un appel par analyse.

**Alternatives écartées** :
- *Réconcilier dans la même requête que l'analyse* — voir ci-dessus ; et un échec du catalogue se
  mêlerait à la réponse de la reconnaissance.
- *Un endpoint de relance séparé* — deux routes pour une seule règle.
- *Un `POST` à chaque ouverture de détail* — chaque consultation compterait comme une écriture.
- *Ajouter les statuts au `GET /shelf-photos/{id}` de `recognition`* — `recognition` devrait
  connaître `bibliography`.
- *Une requête par livre depuis le front* — 30 allers-retours depuis un téléphone en ressourcerie,
  et la politique de parallélisme (§7) dispersée dans le client.

## 4. Désigner un livre détecté à travers la frontière

**Décision** : un livre détecté est désigné par **(identifiant de l'analyse, position)** — l'`id`
de l'envoi, et l'index du livre dans la liste `books` du détail (`GetShelfScanUseCase`), qui n'a
pas de champ de position. `bibliography` le conserve comme une **référence opaque**
(`ShelfBookRef`), sans clé étrangère vers les tables de `recognition`.

**Raison** : la liste d'une analyse aboutie est figée. La spec 002 permet de relancer une analyse
en échec ou jamais lancée, mais jamais une analyse aboutie (FR-011 : « une photo ne porte jamais
plus d'un résultat d'analyse abouti » ; `start-attempt.ts` le refuse en `ShelfScanAlreadyProcessed`).
Seule une analyse aboutie se réconcilie : la position est donc stable. Pas de clé étrangère
inter-contextes : elle couplerait deux schémas qu'ADR 0010 veut séparés ; la cohérence est garantie
par l'orchestrateur, qui ne transmet que des livres lus dans `recognition`.

**Alternatives écartées** :
- *Donner un identifiant à chaque livre détecté dans `recognition`* — changement de schéma et de
  contrat des specs 001 et 002 pour un gain nul tant que la liste est immuable.
- *Désigner par (titre, auteur)* — deux tranches peuvent porter le même titre (Edge Cases).

## 5. Appariement — principes de l'ADR 0014, réglages de l'issue #20

**Décision** : la règle d'appariement est du **domaine**, la cascade de requêtes est
d'**application**. Les réglages sont rassemblés dans un objet validé, `MatchingSettings`, pour que
le bench puisse les changer sans toucher aux règles. Valeurs initiales : celles mesurées dans
[l'étude de l'issue #20](https://github.com/arenier/pick-a-book/issues/20#issuecomment-5978322572).

### 5.1 Décomposer la lecture (`ReadBook`, domaine)

- **Titre** : mentions entre parenthèses retirées (« (Robert Laffont) », « (J2690) ») ; découpé en
  **segments** sur ` - `, ` : ` et ` / ` (« Percy Jackson - La Mer des Monstres » → deux segments).
- **Mention de tome** (« tome 3 », « T2 », « 2e », un nombre isolé) : extraite et **conservée**,
  comparée au numéro de la notice — jamais retirée. Le contrôle manuel de l'étude l'a montré :
  la retirer fait pointer « Éternels (tome 3) » vers le tome 1.
- **Auteurs** : un nom par nom lu, sur les séparateurs `-`, `/`, ` et `, `&` et `,`
  (« D. Pennac - J. Ferrandez » → deux noms).
- **Normalisation** : `normalizeText` de `libs/shared/text-match` des deux côtés, plus le retrait
  de l'article initial (le, la, les, l', un, une, des, the, a, an) — « Cuisine évasion » contre
  « La Cuisine évasion » tombait à 0,83, sous le seuil.

### 5.2 Lire la notice en entier (`CatalogRecord`, domaine)

- **Titre** : le titre propre, le titre avec son complément, et les formes coupées avant ` : ` ou
  ` / ` ; le score titre est le maximum sur ces formes.
- **Auteurs** : tous, principaux et secondaires (illustrateurs, traducteurs : 700–702 en UNIMARC),
  dans les deux ordres du nom ; le **nom de famille seul** vaut correspondance ; une forme abrégée
  compatible (« A. Camus ») aussi.
- **Contexte** : série, tome, collection et numéro, éditeur — de quoi expliquer un segment lu (5.5)
  et préférer le tome à la série (5.6).

### 5.3 Seuils

**0,85** sur le titre, et sur l'auteur quand un auteur est lu (`similarity` de `text-match`). C'est
le coude mesuré : 0,90 perd 9 points sur les titres fautés, 0,80 en gagne 3 mais double les titres
fabriqués confirmés sans auteur. Un auteur lu qui ne correspond à **aucun** auteur de la notice
l'écarte — après l'étape des formes rejetées (5.4).

### 5.4 Formes rejetées des autorités

Quand le titre d'une notice passe le seuil mais pas l'auteur lu, l'application demande au port
`AuthorityPort` les formes rejetées de la notice d'autorité BnF de chacun des auteurs de la notice,
par l'identifiant d'autorité porté par la notice. Ces formes (translittérations, pseudonymes,
variantes de prénom) sont comparées à l'auteur lu, au même seuil. La notice n'est écartée
qu'ensuite. L'appel n'a lieu que dans ce cas, et il est **mis en cache** (en mémoire, par instance :
une autorité change rarement, et une réponse perdue au redémarrage se redemande). Un échec de cet
appel n'est pas « non vérifié » : la notice est simplement écartée, comme avant l'ADR.

### 5.5 Rapprochement partiel : le segment expliqué

Quand seul un segment du titre lu correspond, les autres segments lus doivent se retrouver dans la
notice — série, collection, tome, éditeur. Sinon, le livre est **ambigu**, jamais confirmé
(FR-004). La règle coûte des fausses ambiguïtés (9 sur 30 au contrôle manuel), mais c'est elle qui
ramène les titres fabriqués confirmés de 7,5 % à 0 %.

### 5.6 Regroupement par œuvre et verdict

- **Regroupement par notre règle**, jamais d'après un identifiant du catalogue : deux notices
  décrivent la même œuvre si leurs titres appariés et leurs auteurs principaux se ressemblent à
  0,85 près, **et** si les nombres de leurs titres sont égaux (« 17 lunes » ≠ « 18 lunes » ; sans
  cette condition, 16 à 19 lunes fusionnent à 0,875) et leurs numéros de tome aussi.
- **Série contre tome** : quand une notice de tome nomme dans son contexte la série lue avec elle,
  c'est elle qui est retenue, et la notice de la série seule n'est pas une candidate de plus
  (FR-019). Premier gisement de confirmés au contrôle manuel : 8 ambigus sur 30.
- **Score combiné** d'une notice : score titre seul si aucun auteur n'a été lu, sinon
  0,7 × titre + 0,3 × auteur (le titre est l'identifiant irréductible, ADR 0005). Le score d'une
  œuvre est celui de sa meilleure notice.
- **Marge** : ne restent candidates que les œuvres dont le score combiné est à moins de **0,1** de
  la meilleure.
- **Verdict** : 0 œuvre → non trouvé ; 1 → confirmé ; ≥ 2 → ambigu, candidats classés par score
  décroissant, **5 au plus** (FR-010, écran de téléphone).

### 5.7 Notice représentative

Pour une œuvre, la notice représentative est, dans l'ordre : celle dont les **auteurs principaux**
sont ceux qui ont été lus (jamais une adaptation cosignée par un dessinateur quand la lecture
désigne l'original — « Le Mystère des pavots blancs ») ; puis la mieux notée ; puis le plus petit
ARK, pour un ordre stable. Jamais l'ordre de la réponse (FR-020).

### 5.8 Score de réconciliation (FR-021)

Calculé par le domaine, sur [0, 1], distinct de la confiance de lecture et jamais combiné avec
elle :

```text
score = combiné de la notice retenue × poids de l'étape × (auteur lu ? 1 : 0,8)
poids de l'étape : titre et auteur 1 · auteur seul 0,95 · titre seul 0,9 · segment 0,85
```

Un livre ambigu porte le score de son meilleur candidat, multiplié par 1 / nombre de candidats.
Les coefficients sont **initiaux** : le score n'est pas affiché (FR-018), seul le bench pourra les
calibrer, par la condition de bascule « filet » de l'ADR. La règle ferme est la pénalité sans
auteur, parce que l'ADR et le jeu de validation l'exigent : presque toutes les fausses confirmations
hors invention viennent de lectures sans auteur.

**Raison** : principes de l'ADR 0014, valeurs de l'étude. Un objet de réglages plutôt que des
constantes dispersées : la mesure par le bench sur sorties VLM réelles les fera bouger.

**Alternatives écartées** :
- *Faire confiance au classement ou à l'identifiant d'œuvre du référentiel* — mesuré : la clé
  d'œuvre du catalogue fabrique de fausses ambiguïtés (69,7 % de confirmés, contre 84,8 % avec
  notre regroupement).
- *Lever automatiquement l'ambiguïté au-dessus d'un écart de score* — c'est « lever d'office »,
  exclu par la spec (FR-010) ; la marge ne fait qu'écarter ce qui n'est pas plausible.
- *Recherche phonétique ou par embeddings* — sans mesure qui la justifie ; la cascade suffit.
- *Accepter un titre seulement contenu dans celui de la notice* — affaiblirait le filet (étude,
  rayon cuisine).

## 6. Ports : une requête à la fois

**Décision** :

```ts
interface BibliographicCatalogPort {
  readonly name: CatalogName;                                   // conservé avec chaque tentative (FR-017)
  search(query: CatalogQuery, signal: AbortSignal): Promise<Result<CatalogPage, CatalogUnavailable>>;
}

interface AuthorityPort {
  rejectedForms(id: AuthorityId, signal: AbortSignal): Promise<Result<readonly string[], CatalogUnavailable>>;
}
```

- `CatalogQuery` : `title?`, `author?` (au moins l'un des deux — l'étape « auteur seul » n'a pas de
  titre), `maxRecords` et `format` (`full` ou `light`). L'adapter n'exécute **qu'une** requête :
  la cascade est dans `application`, et c'est elle qui décide de s'arrêter (ADR 0014).
- `CatalogPage` : les notices (`CatalogRecord`, §5.2), avec pour chacune sa forme d'origine
  (`raw`, `format`) conservée au stockage (§8).
- `CatalogUnavailable` porte sa cause (`unavailable`, `invalid_response`). C'est un échec **attendu**
  du port, rendu en `Err` (ADR 0013) : l'adapter ne rejette pas sa promesse pour une panne de la
  BnF, il rend la valeur. Une liste vide n'est pas une erreur : c'est « rien trouvé ».
- La réponse SRU est validée par un schéma **`zod`**, tout ou rien (`adapters.md`) : une notice
  malformée rend toute la page `invalid_response`.
- `format: light` est le Dublin Core, pour l'étape « auteur seul » sur 100 notices : en UNIMARC,
  la même requête renvoie 322 Ko et prend 2,5 s en médiane, contre 91 Ko et 0,26 s.

**Raison** : la cascade dépend du verdict du domaine, qui doit être le même quel que soit le
référentiel et testable sans infrastructure : d'où un adapter qui n'exécute qu'une requête. Le
signal d'annulation laisse l'application imposer son délai (§7) sans que l'adapter lise une horloge.

**Alternatives écartées** :
- *Un adapter qui déroule la cascade* — enfouirait le verdict dans l'infrastructure (ADR 0014).
- *Le port rend des œuvres déjà regroupées, avec une `workKey` calculée par l'adapter* (première
  version de ce plan) — abandonné par l'ADR 0014 : la clé du catalogue fabrique de fausses
  ambiguïtés, et FR-007 se teste mieux dans le domaine.
- *Rejeter la promesse sur une panne* — contraire à ADR 0013 : la panne de la BnF est dans le
  vocabulaire (« non vérifié »).

## 7. Délais, nouvelles tentatives et parallélisme

**Décision** : dans `ReconcileDetectedBooksUseCase` :
- **4 requêtes en parallèle** au plus vers la BnF, toutes requêtes confondues (cascade et
  autorités) — un limiteur de requêtes, pas de livres ;
- **8 s par requête** ; **une nouvelle tentative** sur `unavailable` s'il reste du budget (l'appel à
  la BnF est critique, ADR 0014) ; jamais sur `invalid_response` ;
- **échéance globale de 18 s** : au-delà, les livres dont la cascade n'a pas abouti sont marqués
  « non vérifié » (`timeout`) sans nouvelle requête ;
- un livre dont une requête de la cascade reste en échec après sa nouvelle tentative est « non
  vérifié » (`unavailable` ou `invalid_response`), jamais « non trouvé » : une étape manquée pourrait
  être celle qui trouve.

Un petit utilitaire local borne le parallélisme — pas de dépendance (`type:application` n'autorise
que `tslib`). Réglages dans un objet (`ReconciliationLimits`) injecté par la composition root.

**Raison** : SC-003 (30 livres en 20 s). L'étude mesure 1,32 requête par livre en moyenne sur une
lecture parfaite (2,35 sur un titre fauté), une médiane de 0,41 s pour titre et auteur et de 1,1 s
pour l'auteur seul en Dublin Core ; la simulation à ces réglages réconcilie 30 livres en 8,0 s
médiane, 10,4 s au 90ᵉ centile, sans « non vérifié ». 4 en parallèle est l'usage poli d'un service
public que l'ADR fixe.

**Alternatives écartées** :
- *Tout en parallèle* — 30 requêtes simultanées vers un service public, c'est se faire limiter.
- *Séquentiel* — dépasse SC-003.
- *Plusieurs nouvelles tentatives* — le budget global n'en laisse qu'une utile.

## 8. Persistance

**Décision** : trois tables dans le schéma Postgres existant, propres à `bibliography`, générées
par Drizzle dans `libs/bibliography/infrastructure/src/lib/drizzle/` (`data-model.md` §Stockage) :

- `reconciliation_attempts` — une ligne par tentative sur un livre : référence du livre, requête
  (titre, auteur lus), catalogue, verdict, étape de la cascade qui a conclu, score de
  réconciliation, cause d'un « non vérifié », date de consultation. **Index unique partiel** : au
  plus une tentative au verdict définitif par livre — deux réconciliations concurrentes ne peuvent
  pas en enregistrer deux.
- `reconciliation_candidates` — les notices examinées par une tentative, avec rang, scores, un
  drapeau « retenue » (candidate ou notice confirmée), l'ARK, le titre, les auteurs avec leur rôle et
  leur autorité, le contexte, et la **notice telle que reçue** (`raw`, `format`) ; y compris les
  meilleures notices **écartées** (3 au plus), pour l'analyse des erreurs (§9).
- `reconciliation_decisions` — la décision de l'utilisateur sur une tentative ambiguë, **unique par
  tentative**, jamais une mise à jour de la tentative (FR-016).

Le statut courant d'un livre se déduit : dernière tentative, corrigée par une décision s'il y en a
une. Pas de clé étrangère vers `recognition` (§4).

Côté exploitation :
- **Migrations par contexte** : dossier propre à `bibliography`, table de suivi propre
  (`__drizzle_migrations_bibliography`) — Drizzle ordonne ses migrations par date dans une même table,
  deux dossiers la partageant se marcheraient dessus. `migrateDatabase` (aujourd'hui
  `libs/recognition/infrastructure/src/lib/persistence/migrate-database.ts`, qui reçoit déjà un
  `Pool`) sort de `recognition-infrastructure` vers une lib partagée, `libs/shared/sql-migrations`
  (tags `type:shared`, `context:none`, `scope:api`), avec la table de suivi en paramètre — même
  verrou consultatif pour toutes, donc migrations sérialisées au démarrage.
- **Pourquoi une lib partagée ne contredit pas « le SQL, le schéma et les migrations restent dans
  `infrastructure` »** (`adapters.md`) : ce qui reste dans chaque `infrastructure`, ce sont les
  fichiers de migration et le schéma — ce qui décrit les tables d'un contexte. Le lanceur ne
  connaît aucune table : il applique un dossier sous un verrou. Le dupliquer par contexte, ce
  serait deux copies du même verrou, qu'un oubli désynchroniserait. La lib est `scope:api` — le
  front n'en a pas l'usage —, nuance que `module-boundaries.md` précisera (tasks T063).
- **Un seul pool Postgres** pour l'API : aujourd'hui, `shelf-scan-archive.factory.ts` ouvre le pool
  et `recognition.module.ts` migre et le ferme. Un `DatabaseModule` d'`apps/api` reprend ce rôle,
  pour les deux contextes, et `createShelfScanArchive` reçoit le pool. Évite deux pools vers la
  même base Neon (ADR 0006).
- `yarn db:generate` génère les migrations des deux contextes ; le build de l'API copie les deux
  dossiers (`dist/migrations/recognition`, `dist/migrations/bibliography`).

**Raison** : ADR 0006 (Postgres, Drizzle, schéma en `infrastructure`) ; ADR 0010 (schéma propre à
chaque contexte) ; ADR 0014 (« le résultat de chaque appel est stocké », avec sa source, son
identifiant, sa date de consultation et le statut de l'appel). La notice telle que reçue est gardée
pour que l'enrichissement (spec 004) parte de la base : un livre déjà réconcilié ne rappelle
personne. Des tentatives en lignes séparées plutôt qu'un statut mis à jour : c'est ce qui garde
l'historique voulu par US5 sans colonne « précédent statut ».

**Alternatives écartées** :
- *Une colonne JSONB par livre sur `shelf_scans`* — `bibliography` écrirait dans une table de
  `recognition`.
- *Un seul dossier de migrations pour tout le repo* — le schéma d'un contexte sortirait de son
  `infrastructure`.
- *Un schéma Postgres par contexte* (`bibliography.*`) — défendable, mais rien ne l'exige
  aujourd'hui et `recognition` n'en a pas ; à décider pour tous d'un coup s'il le faut.
- *Ne garder que les champs extraits de la notice* (première version : « réponse brute inutile une
  fois les scores calculés ») — la spec 004 aurait à rappeler la BnF pour chaque livre déjà
  confirmé, contre l'ADR 0014.

## 9. Conserver pour l'analyse des erreurs (US5)

**Décision** : tout ce qu'exigent FR-015 à FR-017 tient dans les trois tables du §8, sans table
dédiée à l'analyse :

| Fait | Où |
|---|---|
| Ce qui a été lu (titre, auteur) | `reconciliation_attempts.query_*` (copie de la requête) |
| Étape de la cascade qui a conclu, score de réconciliation | `reconciliation_attempts.cascade_step`, `reconciliation_score` |
| Notice retenue, candidats, leurs scores titre/auteur/combiné, leur rang | `reconciliation_candidates` (`retained = true`) |
| Meilleures notices écartées et leurs scores | `reconciliation_candidates` (`retained = false`) |
| Catalogue interrogé, date de consultation | `reconciliation_attempts.catalog`, `attempted_at` |
| Cause d'un « non vérifié » | `reconciliation_attempts.not_verified_cause` |
| Résultat automatique et décision de l'utilisateur | tentative + `reconciliation_decisions` |

Les catégories de SC-007 se déduisent par requête (`data-model.md` §Catégories d'écart). Aucune de
ces données n'est exposée par l'API (FR-018).

**Raison** : les requêtes sont copiées pour que l'analyse se suffise des tables de `bibliography`
(la reconnaissance ne relit pas une photo deux fois de la même façon). Les notices écartées
distinguent « le catalogue ne connaît rien d'approchant » de « la lecture était trop dégradée pour
passer le seuil » — la question même que l'ADR 0005 pose pour la bascule vers l'OCR. L'étape de la
cascade est ce que la condition de bascule « filet » de l'ADR 0014 demande de lire : « retirer
d'abord l'étape de la cascade qui produit » les confirmés à tort.

**Alternatives écartées** :
- *Journal d'événements séparé* — double écriture, et ADR 0003 réserve la traçabilité à une
  journalisation explicite si le besoin devient un parcours, pas des faits métier.

## 10. Levée d'ambiguïté

**Décision** : `POST /shelf-photos/{id}/books/{position}/decision`, corps
`{ "choice": "candidate", "recordId": "…" }` ou `{ "choice": "none" }`. Autorisée **une fois**, sur un
livre dont le statut courant est « ambigu » ; `recordId` doit être l'un des candidats conservés.
Sinon 409 (pas ambigu, ou déjà décidé) ou 400 (candidat inconnu). Même route depuis l'écran de
résultat et depuis le détail d'un envoi (US2, scénario 5).

**Raison** : la spec n'autorise que choisir ou rejeter (FR-010) et veut l'automatique conservé à côté
(FR-016) : une décision unique par tentative ambiguë, c'est la contrainte la plus simple qui tienne
les deux. Revenir sur un choix n'est pas demandé : il est au parking.

**Alternatives écartées** : *`PUT` sur l'état du livre* — laisserait écrire n'importe quel statut,
alors que seules deux transitions existent.

## 11. Écrans : deux hôtes, une slice

**Décision** : une nouvelle slice `apps/web/src/features/reconciliation/` (`api/`, `model/`, `ui/`,
`i18n/`), que **le shell compose** avec les deux slices qui affichent des livres détectés :
- `photo-upload` : l'écran d'envoi rend son résultat par une prop de rendu fournie par `app.tsx`,
  qui y branche la liste réconciliée. `UploadState` en succès porte désormais l'`id` de l'envoi —
  ce qu'il ne fait pas aujourd'hui.
- `upload-history` : le détail d'un envoi (`LoadedEntry`) rend sa liste par la même sorte de prop,
  à la place de `DetectedBooksList`. Après une relance d'analyse qui aboutit (`useRescan`), la
  liste réconciliée se monte avec les nouveaux livres et réconcilie (§3).

La liste réconciliée affiche d'abord les livres détectés avec une mention « vérification en cours »,
puis le statut de chacun : forme de référence pour un confirmé (et la lecture en second quand elle
diffère), mention « confirmé sur le titre seul » quand aucun auteur n'avait été lu (FR-022),
candidats dépliables avec « aucun ne correspond » pour un ambigu, « inconnu du catalogue » pour un
non trouvé, « non vérifié » avec un bouton de relance global. Une mention « Source : catalogue
général de la BnF » accompagne la liste dès qu'une forme de référence ou un candidat s'affiche
(FR-023). Un échec de l'appel lui-même (réseau, 5xx) s'affiche comme si tous les livres étaient
« non vérifiés » : les livres restent visibles (FR-008) ; un 429 garde le message de la spec 002.
Composants de `libs/shared/ui` (ADR 0012 : `Button`, `Alert`, `Spinner`, `BookTitle`…) et classes
Tailwind ; un composant qui manque (un badge de statut, par exemple) s'ajoute à `libs/shared/ui`
selon la règle de l'ADR 0012 — sa spec d'abord.

**Raison** : une slice n'importe pas l'intérieur d'une autre (`module-boundaries.md`) ; la
réconciliation a ses propres appels, états, échecs et textes. Composer dans le shell évite une lib
partagée et garde `upload-history` ignorant de `bibliography`, comme son backend.

**Alternatives écartées** :
- *Étendre `photo-upload` ou `upload-history`* — chaque slice mêlerait deux features et deux
  catalogues de messages, et le code de statut serait écrit deux fois.
- *Une lib partagée pour le type « livre détecté »* — chaque slice redéclare localement le contrat
  HTTP qu'elle lit (spec 001 research §5), `upload-history` le fait déjà.
- *Une attribution renvoyée par l'API* (nom du catalogue dans le DTO) — FR-018 garde le catalogue
  hors de l'API, et il n'y en a qu'un ; la mention est un texte du catalogue i18n.

## 12. Configuration et adapters

**Décision** : `BIBLIOGRAPHIC_CATALOG_PROVIDER`, validée au démarrage comme
`SHELF_SCANNER_PROVIDER` : `bnf`, `stub` ou `offline`. Défaut `stub` en local (`.env.example`),
`bnf` en production, posé par `infra/envs/prod` (Terraform, test `plan` d'abord, `infra.md`).
- `bnf` : `BnfSruCatalogAdapter` et `BnfAuthorityAdapter`, `fetch` injecté, `User-Agent` qui
  identifie le projet (`pick-a-book (+https://github.com/arenier/pick-a-book)`), sans donnée
  personnelle. Aucune clé : la BnF n'en demande pas.
- `stub` : un petit catalogue en mémoire qui couvre tous les verdicts avec les livres du scanner
  stub — confirmés (Duras, Perec, Ernaux), non trouvé (« Titre peu lisible »), et un ambigu, pour
  lequel le scanner stub gagne **une détection sans auteur** dont le titre est porté par deux œuvres
  du catalogue stub. Ses autorités rendent une forme rejetée, pour exercer §5.4.
- `offline` : rend toujours `Err(CatalogUnavailable('unavailable'))` — de quoi voir « non vérifié »
  et la relance (US4) en redémarrant l'API.

**Raison** : même logique que le scanner stub (ADR 0005) : faire tourner la chaîne de bout en bout
sans réseau. La détection sans auteur ajoutée au stub exerce au passage l'amendement de l'ADR 0005,
jamais montré jusqu'ici par le stub. Aucune clé n'entre dans la configuration : celle de Google
Books arrivera avec la spec 004.

## 13. Tests

**Décision** :
- **Domaine** : `ReadBook` (segments, tome, noms), formes de titre et d'auteur, `matchBook` et le
  regroupement sur tables de cas, `BookReconciliation` (transitions, décision unique), score. Sans
  infra.
- **Application** : `ReconcileDetectedBooksUseCase` (cascade, arrêt au premier verdict, autorités,
  nouvelle tentative, délais) et `DecideAmbiguityUseCase` avec un catalogue factice et un dépôt en
  mémoire (`testing/`), délais testés avec les faux timers de Vitest.
- **Infrastructure** : dépôt Drizzle contre le Postgres du compose (convention) ; adapters `stub` et
  `offline` en unitaire ; adapters BnF sur **réponses SRU enregistrées**, avec leur provenance
  (`adapters.md`). Les cas de départ sont ceux de l'ADR 0014 : « Percy Jackson - La Mer des
  Monstres », « 17 lunes » / « 18 lunes », « Éternels (tome 3) », « Alaa El Aswany », « Le Mystère
  des pavots blancs », « D. Pennac - J. Ferrandez », « Exercices de style », un titre fauté, des
  témoins permutés et fabriqués. Les mêmes réponses nourrissent une spec d'appariement de bout en
  bout (adapter + domaine), qui protège les réglages de §5.
- **API** : orchestrateur avec des doubles de use cases ; routes en spec HTTP comme
  `shelf-photos.http.spec.ts`.
- **Web** : slice avec `fetch` injecté, comme `photo-upload` et `upload-history`.
- **SC-001/SC-002** : mesurés par le bench (`tools/bench`), étendu d'un mode réconciliation sur
  l'adapter BnF — manuel, hors CI, comme la non-régression de la reconnaissance. C'est aussi la
  vérification des conditions de bascule de l'ADR 0014.

## 14. Ce qui part dans la spec 004 (enrichissement)

**Décision** : cette feature s'arrête au verdict et à la conservation des notices (spec,
Assumptions). Relèvent de la spec 004 :
- l'extraction des champs d'enrichissement de la notice BnF conservée (éditeur, année, pages et
  format, collection, ISBN, prix, genre 686, RAMEAU, Dewey, résumé, langue d'origine, couverture,
  ISNI) ;
- le port d'enrichissement et l'adapter Google Books, appel toléré dont l'échec est un `Err` qui
  marque l'enrichissement **incomplet** (ADR 0013, `bibliography.md`), sa clé d'API en secret de
  configuration, et la relecture de ses conditions d'utilisation ;
- l'état de l'enrichissement par source, la règle « la BnF l'emporte sur un champ commun », et
  l'attribution de Google Books à l'affichage ;
- la question ouverte de l'ADR 0014 : quand compléter un enrichissement incomplet.

**Raison** : décision du porteur du projet du 17/10/2026. Deux features, deux rythmes : la
réconciliation est le filet du produit, l'enrichissement sert le tri. Le budget de 20 s de SC-003
devra accueillir les appels Google Books : la spec 004 le partagera, sans retarder les statuts.

## 15. Ce que la spec 002 impose aux routes

**Décision** :
- **Propriétaire** : les trois routes passent par l'orchestrateur, qui lit le détail par
  `GetShelfScanUseCase` avec l'`OWNER_ID` de la configuration. Un envoi d'un autre propriétaire, ou
  inconnu, est un 404 — même règle que l'historique (`findOwnedScan`).
- **Erreurs** : chaque use case rend un `Result` (ADR 0013) ; la traduction en HTTP est un `switch`
  exhaustif sur `kind`, avec des codes stables que le front lit, à la manière de
  `recognition-http-error.ts` (`orchestration-http-error.ts`, `bibliography-http-error.ts`). Pas de
  filtre d'exception par contexte : le filtre global d'`apps/api/src/http/` ne traduit aucune
  erreur de domaine.
- **Limite de requêtes** : `@nestjs/throttler` classe les requêtes par méthode — `GET` dans le palier
  par défaut (300 par minute), `POST` dans le palier des écritures (10 par minute, partagé par
  toutes les routes d'une même source). La réconciliation et la relance en consomment une chacune,
  chaque décision aussi. Lever plus de dix ambiguïtés en une minute fait répondre 429
  `TOO_MANY_REQUESTS` : l'écran le dit avec le message de la spec 002, et rien n'est perdu. Accepté :
  une décision se prend en regardant l'étagère, et le palier protège l'API publique (spec 002,
  FR-014). À revoir si l'usage montre des rafales légitimes.
- **Plafond du jour** : la réconciliation n'appelle pas le service de reconnaissance et ne passe pas
  par `scan_attempts` : elle ne compte pas dans `DAILY_SCAN_LIMIT` (FR-025).
- **Journalisation** : le `Logger` de Nest dans `apps/api`, jamais `console.*` ; `domain` et
  `application` de `bibliography` n'en ont pas.

**Raison** : spec 002 (FR-012, FR-014, FR-015), ADR 0013, `error-policy.md`, `CLAUDE.md`.
