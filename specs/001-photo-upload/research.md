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

**Decision**: `fetch` natif du navigateur, envoi en `multipart/form-data` (`FormData` avec un
champ `photo`), pas de bibliothèque HTTP ajoutée.

**Rationale**: `ScanController` accepte déjà ce format exact
(`FileInterceptor('photo', …)`) — c'est le chemin le plus direct, et il évite l'inflation ~33 % du
repli JSON+base64 documenté dans le contrôleur (`ScanRequestBody`, prévu pour d'autres appelants).
Une seule requête vers un seul endpoint ne justifie pas une dépendance HTTP dédiée (axios,
react-query) : le projet n'en a aucune aujourd'hui, et `require-await`/`promise-function-async`
(ADR 0008) couvrent déjà la rigueur asynchrone que ces bibliothèques apportent par ailleurs.

**Alternatives considered**: `axios` — rejeté (dépendance non justifiée par un seul appel) ;
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
service de reconnaissance (502), aucune politique de rétention pour l'instant.

## 7. Où et comment orchestrer la persistance côté backend

**Decision**: étendre `ScanShelfUseCase` (`libs/recognition/application`) avec deux nouveaux ports
domain — `ShelfPhotoStoragePort.store(photo): Promise<StoredPhoto>` et
`ShelfScanHistoryPort.record(photo, outcome): Promise<void>` où `outcome` est
`{ status: 'completed'; books } | { status: 'failed' }`. Séquence : valider (`ShelfPhoto.of`,
inchangé) → stocker la photo → appeler `ShelfScannerPort.scan` → enregistrer l'issue (succès avec
livres, y compris liste vide, ou échec) → renvoyer le DTO comme avant. Le stockage de la photo a
lieu **avant** l'appel au scanner, pas après : c'est ce qui permet de la conserver même quand le
scanner échoue (US3, scénario 2).

**Rationale**: la persistance ne franchit aucune frontière de bounded context — elle porte
uniquement sur des concepts déjà propres à `recognition` (`ShelfPhoto`, `DetectedBook`). Un
orchestrateur `apps/api` (ADR 0003) n'a de raison d'être que pour croiser plusieurs contextes ; en
ajouter un ici pour une séquence interne à un seul contexte serait une indirection sans objet.
Regrouper « scanner » et « archiver » dans le même use case garde au composition root
(`recognition.module.ts`) une seule chose à construire et à appeler, plutôt que deux use cases dont
il devrait connaître l'ordre et la gestion d'erreur.

**Alternatives considered**: un second use case `ArchiveShelfScanUseCase` appelé par
`ScanController` après `ScanShelfUseCase` — rejeté : déplace vers la composition root (censée
ignorer la logique métier, ADR 0002) la décision de séquencement et la nécessité d'archiver même
sur échec, qui est une règle du contexte `recognition`, pas du contrôleur HTTP. Un événement de
domaine consommé ailleurs — rejeté d'emblée par l'ADR 0003 (pas d'event bus).

## 8. Forme de l'enregistrement conservé

**Decision**: une seule table Postgres, `shelf_scans` :

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid`, clé primaire | Généré par l'application (`crypto.randomUUID()`), sert aussi de nom d'objet dans le bucket — un seul identifiant pour la paire photo/enregistrement. |
| `photo_bucket_key` | `text` | Clé de l'objet dans le bucket (research.md §9). |
| `photo_media_type` | `text` | Un des quatre types acceptés par `ShelfPhoto`. |
| `status` | `text` (`completed` \| `failed`) | Reflète `ShelfScanOutcome`. |
| `detected_books` | `jsonb`, nullable | Peuplé seulement si `status = completed` ; `null` si `failed`. Tableau de `{ author?, title, confidence }`, la forme même de `DetectedBookDto` — dénormalisé, pas une table par livre. |
| `created_at` | `timestamptz`, défaut `now()` | Horodatage de l'analyse (FR-011, US3 scénario 1). |

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

**Decision**: `@google-cloud/storage` (SDK officiel) derrière `ShelfPhotoStoragePort`, clé d'objet
`shelf-photos/{id}` (le même `id` que la ligne `shelf_scans`, sans extension — le type MIME est
posé comme métadonnée de l'objet, pas déduit d'une extension). En local et en CI,
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
