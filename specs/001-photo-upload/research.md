# Research: Upload d'une photo d'étagère

Toutes les inconnues techniques listées dans le Technical Context du plan sont résolues ici.
Aucune ne restait déjà tranchée par un ADR ou par le code existant sans y être documentée.

## 1. Où vit la feature côté frontend

**Decision**: dossier `apps/web/src/features/photo-upload/`, pas une lib Nx séparée.

**Rationale**: ADR 0002 prescrit un découpage feature-slice au front sans imposer le mécanisme
(dossier applicatif vs projet Nx dédié). `apps/web` ne contient aujourd'hui aucune slice — c'est
la première. Créer une lib Nx (`libs/web/photo-upload`) ajouterait un `package.json`, des tags, et
un `vitest.config.mts` pour une seule feature qui n'est consommée que par une seule app : coût de
cérémonie sans bénéfice tant qu'aucune deuxième app ou un besoin de réutilisation ne se présente.

**Alternatives considered**: lib Nx dédiée sous `libs/web/*` — rejetée pour l'instant (YAGNI) ;
reconsidérée le jour où une deuxième slice a besoin d'importer du code de celle-ci (l'ADR 0002
interdit justement l'import slice-à-slice, ce qui forcerait alors l'extraction).

## 2. Comment le frontend joint l'API (origines séparées)

**Decision**: deux ajustements, un de chaque côté du contrat HTTP existant (`POST /scan`) :

- Côté API (`apps/api`) : activer CORS (`app.enableCors`) pour une origine configurable via une
  nouvelle variable d'environnement optionnelle `WEB_ORIGIN` (défaut `http://localhost:4200`, le
  port par défaut de `yarn web`). Suit le style déjà en place dans
  `apps/api/src/config/environment.ts` (variable lue et validée à `loadEnvironment`), mais reste
  optionnelle : une valeur absente ne fait pas échouer le démarrage, contrairement à `DATABASE_URL`.
- Côté web (`apps/web`) : une variable Vite `VITE_API_BASE_URL`, lue via `import.meta.env`, qui
  donne l'origine complète de l'API (`http://localhost:3000` par défaut en dev). Vite l'inline au
  build, ce qui convient à la production : `apps/web` est servi comme fichiers statiques depuis un
  bucket (ADR 0004), sans serveur Node capable de proxyfier une requête à l'exécution.

**Rationale**: `docker/web.Dockerfile` et le commentaire de `docker-compose.yml` confirment que
production et développement local ont déjà des origines distinctes pour `web` (4200) et `api`
(3000) — aucune configuration CORS n'existe encore, donc tout appel `fetch` échouerait
silencieusement (erreur CORS dans la console, pas une erreur métier) sans cet ajustement. Le choix
d'une URL absolue configurée au build plutôt qu'un chemin relatif est le seul qui fonctionne
identiquement en local et une fois `apps/web` déployé comme fichiers statiques.

**Alternatives considered**:
- Proxy du serveur de dev Vite vers l'API — rejeté : ne fonctionne qu'en dev (`vite dev`), pas en
  production où il n'y a plus de serveur Vite, ce qui aurait exigé un deuxième mécanisme pour la
  prod.
- Rendre `apps/web` et `apps/api` same-origin (un seul service, l'API servant aussi les fichiers
  statiques) — rejeté : contredit ADR 0004 (bucket pour le front, Cloud Run pour l'API), rouvrirait
  une décision actée pour cette seule feature.

## 3. Client HTTP

**Decision**: `fetch` natif du navigateur, deux appels séquentiels (research.md §7 : upload puis
scan), le premier en `multipart/form-data` (`FormData` avec un champ `photo`), le second sans
corps. Pas de bibliothèque HTTP ajoutée. Le module `api/scan-shelf-photo.ts` enchaîne les deux et
n'expose qu'une seule fonction à l'écran (`submitShelfPhoto`) : l'UI ignore qu'il y a deux requêtes.

**Rationale**: `ScanController` (devenu, avec le découpage de §7, un contrôleur en deux routes)
accepte déjà le multipart (`FileInterceptor('photo', …)`) — c'est le chemin le plus direct, et il
évite l'inflation ~33 % du repli JSON+base64 (`ScanRequestBody`, prévu pour d'autres appelants).
Deux requêtes vers deux endpoints ne justifient pas plus une dépendance HTTP dédiée (axios,
react-query) qu'une seule n'en justifiait : le projet n'en a aucune aujourd'hui, et
`require-await`/`promise-function-async` (ADR 0008) couvrent déjà la rigueur asynchrone que ces
bibliothèques apportent par ailleurs. Enchaîner deux `fetch` à la main reste plus simple que
d'introduire une lib pour gérer une séquence de deux appels sans état partagé au-delà d'un id.

**Alternatives considered**: `axios` — rejeté (dépendance non justifiée) ;
`@tanstack/react-query` — rejeté pour la même raison, et parce que cette feature n'a ni cache ni
requêtes concurrentes à coordonner (FR-007 : un envoi à la fois).

## 4. Gestion d'état

**Decision**: état local React (`useState`/`useReducer`) interne à la feature, un état explicite à
quatre issues (`idle | uploading | success | error`), pas de bibliothèque de gestion d'état globale.

**Rationale**: un seul écran, un seul flux, aucun état partagé entre features (il n'y en a pas
d'autre). Une lib d'état global serait une abstraction sans second consommateur.

## 5. Validation côté client du format et du poids

**Decision**: deux constantes et une fonction pure dans la feature (`model/photo-constraints.ts`),
qui reprennent exactement les mêmes valeurs que `ShelfPhoto`
(`libs/recognition/domain/src/lib/shelf-photo.ts`) : types acceptés
(`image/jpeg`, `image/png`, `image/webp`, `image/heic`) et poids maximal (20 Mo).

**Rationale**: `apps/web` (scope:web) ne peut pas importer `libs/recognition/domain` (scope:api) —
la règle `@nx/enforce-module-boundaries` l'interdit (`eslint.config.mjs`), et la contourner via une
lib partagée neuve pour deux constantes serait la dérive que l'ADR 0002 met en garde ( « `shared`
n'est légitime que sur un besoin constaté »). Dupliquer une contrainte aussi petite et stable coûte
moins cher que l'abstraction. Si un deuxième endpoint ou une deuxième app venait à partager cette
contrainte, l'extraction vers `libs/shared/*` redeviendrait justifiée — pas avant.

**Alternatives considered**: importer `ShelfPhoto` directement — bloqué par la frontière de scope ;
créer `libs/shared/photo-contract` dès maintenant — rejeté (YAGNI, un seul consommateur).

## 6. Simulation d'un envoi de fichier dans les tests

**Decision**: `fireEvent.change` de `@testing-library/dom` (déjà une dépendance) sur un `<input
type="file">`, avec un `File` construit à la main — pas de nouvelle dépendance de test.

**Rationale**: `@testing-library/user-event` n'est pas dans le projet aujourd'hui ; l'ajouter pour
une seule interaction (changement de fichier) que `fireEvent` couvre déjà irait à l'encontre de
« outillage unique, pas de choix locaux » (ADR 0008, constitution IV).

**Alternatives considered**: `@testing-library/user-event` — rejeté (dépendance non nécessaire pour
ce besoin précis).

---

Sections 7 à 9 ajoutées le 21/09/2026, à la demande du porteur du projet d'étendre le scope à la
persistance (US3 de `spec.md`). Décisions actées avec lui : conserver aussi en cas d'échec du
service de reconnaissance (502), aucune politique de rétention pour l'instant. Section 7 révisée
le même jour, deuxième échange : le porteur du projet a demandé de séparer l'envoi et l'analyse en
deux requêtes plutôt qu'une seule pour ne pas perdre la photo si le second appel (le plus long, le
plus faillible) échoue en réseau — proposition retenue, détaillée en §7.

## 7. Où et comment orchestrer la persistance côté backend — révisé le 21/09/2026 (deux endpoints)

**Première version (dépassée)** : un seul `ScanShelfUseCase` étendu, faisant stocker-puis-scanner
dans la même requête HTTP. Abandonnée : elle enchaînait, dans un seul aller-retour réseau mobile, un
envoi multipart (poids : jusqu'à 20 Mo) et un appel VLM synchrone dont la latence mesurée est de
l'ordre de 27 s (`docs/decisions/0001`). Sur un réseau de ressourcerie instable, la moindre coupure
pendant les 27 s d'analyse fait échouer une requête qui avait pourtant déjà livré la photo au
serveur — or FR-011 veut justement que cette photo ne soit pas reperdue.

**Decision** : séparer l'envoi de la photo et le déclenchement de l'analyse en deux requêtes HTTP
distinctes, donc deux use cases dans `libs/recognition/application` :

1. `StoreShelfPhotoUseCase.execute({ bytes, mediaType })` — valide (`ShelfPhoto.of`, inchangé),
   génère un identifiant (`crypto.randomUUID()`), stocke la photo dans le bucket sous
   `shelf-photos/{id}`, crée un `ShelfScanRecord` de statut `pending`, renvoie `{ id }`. Aussi
   rapide qu'un envoi de fichier peut l'être — pas d'appel VLM sur ce chemin.
2. `ScanStoredShelfPhotoUseCase.execute({ id })` — relit l'enregistrement (404 si absent), refuse
   si son statut n'est plus `pending` (409 — voir plus bas), relit la photo depuis le bucket (pas de
   fichier en mémoire entre les deux requêtes : Cloud Run est sans état entre requêtes, ADR 0004),
   appelle `ShelfScannerPort.scan`, marque l'enregistrement `completed` (avec les livres, y compris
   liste vide) ou `failed`, renvoie le DTO comme avant.

Le frontend enchaîne les deux appels lui-même (research.md §3), en une seule action perçue par
l'utilisateur (US1 inchangée) : le découpage est un détail de transport, pas une nouvelle étape
visible à l'écran.

**Nouveau port** : `ShelfPhotoStoragePort` gagne `retrieve(bucketKey, mediaType): Promise<ShelfPhoto>`
en plus de `store`. `ShelfScanHistoryPort` devient `ShelfScanRepositoryPort` (lecture + écriture,
ce n'est plus un simple journal d'ajout) : `createPending`, `get`, `markCompleted`, `markFailed`
(data-model.md#ShelfScanRecord).

**Rationale** : conserver la photo **avant** de risquer l'appel le plus long et le plus faillible
de toute la chaîne (le VLM) rend la panne partagée par les deux requêtes sans en payer le prix deux
fois — si la deuxième requête échoue en réseau, la photo est déjà en sécurité, contrairement à un
schéma en un temps où la même coupure aurait aussi perdu la photo. Ça satisfait FR-011 plus
directement qu'un `try/catch` unique : la conservation ne dépend plus de la survie de la requête
qui contient l'appel VLM. Ça découple aussi deux profils de risque très différents — un transfert de
données sensible au débit montant du mobile, un calcul distant sensible à la latence et à la
disponibilité du fournisseur — ce que ADR 0005 traite déjà comme deux préoccupations séparées
(la latence VLM est déjà nommée comme un point de vigilance à part, `docs/decisions/0001`).

Aucune frontière de bounded context n'est franchie : les deux use cases restent des concepts
propres à `recognition`. Un orchestrateur `apps/api` (ADR 0003) n'a de raison d'être que pour
croiser plusieurs contextes ; il n'y a ici qu'un seul contexte, en deux étapes.

Le 409 sur un enregistrement déjà `completed`/`failed` empêche un second appel accidentel (double
clic, requête réseau rejouée) de relancer un appel VLM déjà payé et déjà répondu — pas une
fonctionnalité de nouvelle tentative (voir FR-014 plus bas, qui documente uniquement la garantie de
non-perte, pas une UX de retry explicite, hors scope de cette feature).

**Alternatives considered**:
- Un seul endpoint synchrone (version précédente) — rejeté pour la raison ci-dessus.
- Un troisième endpoint asynchrone avec file d'attente et statut interrogé par polling (`GET
  /shelf-photos/{id}`) — rejeté : sur-ingénierie à 20–200 photos/mois, un seul utilisateur ; les
  deux appels synchrones suffisent et restent dans le budget de latence déjà accepté (ADR 0005).
  Reste une extension possible si le volume ou la latence VLM l'exigeaient un jour.
- Idempotence complète du deuxième appel (rejouer un scan déjà `completed` renverrait le même
  résultat plutôt qu'un 409) — rejeté : aucune UX de retry n'est demandée par cette feature, et le
  409 est le comportement le plus sûr par défaut (ne jamais relancer un appel VLM sans qu'on l'ait
  demandé). Documenté comme limitation connue plutôt que résolu par anticipation.

## 8. Forme de l'enregistrement conservé

**Decision**: une seule table Postgres, `shelf_scans` :

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid`, clé primaire | Généré par l'application (`crypto.randomUUID()`) dans `StoreShelfPhotoUseCase`, sert aussi de nom d'objet dans le bucket et d'identifiant renvoyé au frontend (research.md §7) — un seul identifiant pour la photo, son enregistrement, et la ressource HTTP `/shelf-photos/{id}`. |
| `photo_bucket_key` | `text` | Clé de l'objet dans le bucket (research.md §9). |
| `photo_media_type` | `text` | Un des quatre types acceptés par `ShelfPhoto`. |
| `status` | `text` (`pending` \| `completed` \| `failed`) | `pending` dès la création par `StoreShelfPhotoUseCase` (photo stockée, analyse pas encore lancée) ; `completed`/`failed` posés par `ScanStoredShelfPhotoUseCase` une fois le scanner appelé. Un enregistrement ne revient jamais en arrière (`ScanStoredShelfPhotoUseCase` refuse — 409 — si le statut n'est déjà plus `pending`, research.md §7). |
| `detected_books` | `jsonb`, nullable | Peuplé seulement si `status = completed` ; `null` si `pending` ou `failed`. Tableau de `{ author?, title, confidence }`, la forme même de `DetectedBookDto` — dénormalisé, pas une table par livre. |
| `created_at` | `timestamptz`, défaut `now()` | Horodatage de la création de l'enregistrement, donc du **stockage de la photo** — pas de l'issue de l'analyse, qui peut arriver plus tard ou jamais si la deuxième requête n'arrive pas (Edge case de `spec.md`). |

**Rationale**: les livres détectés ne sont pas encore des entités stables — ils n'ont pas traversé
la réconciliation (`bibliography`, pas encore fondé) qui leur donnerait une identité propre. Les
dénormaliser en `jsonb` évite de construire un schéma relationnel (table `books`, clé étrangère)
pour une donnée qui sera de toute façon retraitée par un contexte qui n'existe pas encore — cette
normalisation-là, si elle a lieu, sera le travail de `bibliography`, pas de cette feature
(convention « pas d'abstraction prématurée »). `status` en union fermée plutôt que
`detected_books` seul avec `null` implicite comme signal d'échec : un `null` ambigu (échec ? liste
non encore peuplée ?) est exactement ce que la Constitution (III, « typage prouvé ») demande
d'éviter.

**Alternatives considered**: table `books` séparée avec clé étrangère vers `shelf_scans` — rejetée
(prématuré, aucun besoin de requêter les livres indépendamment d'un scan pour l'instant) ; un champ
`error_message` sur échec — rejeté, `ShelfScanFailed` ne garantit pas un message stable ou utile à
conserver, et US3 ne demande qu'un statut, pas un diagnostic.

## 9. Stockage du fichier et émulation locale

**Decision**: `@google-cloud/storage` (SDK officiel) derrière `ShelfPhotoStoragePort` — `store`
pour `StoreShelfPhotoUseCase`, `retrieve` pour `ScanStoredShelfPhotoUseCase` (research.md §7) —,
clé d'objet `shelf-photos/{id}` (le même `id` que la ligne `shelf_scans`, sans extension — le type
MIME est posé comme métadonnée de l'objet à l'écriture, et refourni tel quel par `retrieve` : pas
déduit d'une extension). En local et en CI,
`fsouza/fake-gcs-server` ajouté comme service `bucket` dans `docker-compose.yml` — c'est
l'émulateur que `CLAUDE.md` mentionne déjà dans la description de la stack (`docker compose up
--build # API + front + Postgres + émulateur de bucket`), pas encore présent dans le fichier
réel : cette feature comble cet écart plutôt que d'en introduire un nouveau. Le client GCS pointe
vers l'émulateur via une variable d'environnement optionnelle (`STORAGE_EMULATOR_HOST`, absente en
production — le SDK s'adresse alors à la vraie API GCS).

**Rationale**: `@google-cloud/storage` est le SDK officiel du fournisseur déjà choisi (ADR 0004),
pas un nouvel arbitrage. `fake-gcs-server` est le même choix de catégorie que `db` dans le
`docker-compose.yml` existant (« développer contre le même moteur que la prod » — ici, la même API
S3-like GCS plutôt qu'un mock en mémoire) et évite un aller-retour réseau vers un vrai bucket
pendant les tests d'adapter, qui doivent rester exécutables sans clé ni compte GCP (cohérent avec
`SHELF_SCANNER_PROVIDER=stub` qui permet déjà de développer sans clé de fournisseur VLM).

**Alternatives considered**: mock du SDK GCS en mémoire — rejeté, contredit la convention « les
adapters se testent contre la vraie techno » ; un vrai bucket GCP même en dev/CI — rejeté (clé de
service à distribuer, coût et latence réseau pour une simple boucle de test).
