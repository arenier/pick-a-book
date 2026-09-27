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

1. `StoreShelfPhotoUseCase.execute({ bytes, mediaType, originalFilename })` — valide
   (`ShelfPhoto.of`, inchangé), génère un identifiant (`crypto.randomUUID()`), stocke la photo dans
   le bucket sous `{owner_id}/shelf_photo/{id}` (research.md §8, §10), crée un `ShelfScanRecord` de
   statut `pending`, renvoie `{ id }`. Aussi rapide qu'un envoi de fichier peut l'être — pas d'appel
   VLM sur ce chemin.
2. `ScanStoredShelfPhotoUseCase.execute({ id })` — relit l'enregistrement (404 si absent), refuse
   si son statut n'est plus `pending` (409 — voir plus bas), relit la photo depuis le bucket (pas de
   fichier en mémoire entre les deux requêtes : Cloud Run est sans état entre requêtes, ADR 0004),
   appelle `ShelfScannerPort.scan`, marque l'enregistrement `completed` (avec les livres, y compris
   liste vide) ou `failed`, renvoie le DTO comme avant.

Le frontend enchaîne les deux appels lui-même (research.md §3), en une seule action perçue par
l'utilisateur (US1 inchangée) : le découpage est un détail de transport, pas une nouvelle étape
visible à l'écran.

**Nouveau port** : `ShelfPhotoStoragePort` expose `store(photo, key): Promise<void>` et
`retrieve(key, mediaType): Promise<ShelfPhoto>` — `store` reçoit la clé plutôt que d'en générer une
(research.md §10 : c'est `StoreShelfPhotoUseCase`, pas le port, qui sait construire
`{owner_id}/shelf_photo/{id}`). `ShelfScanHistoryPort` devient `ShelfScanRepositoryPort` (lecture +
écriture, ce n'est plus un simple journal d'ajout) : `createPending`, `get`, `markCompleted`,
`markFailed` (data-model.md#ShelfScanRecord) — tous keyés par l'identifiant de l'upload (research.md
§8 : `ShelfScanId` correspond à `uploads.id`, pas au `id` propre de la ligne `shelf_scans`).

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

## 8. Forme de l'enregistrement conservé — révisé le 21/09/2026 (quatrième échange : table `uploads` générique)

**Première version (dépassée)** : une seule table `shelf_scans` portant à la fois les attributs du
fichier (emplacement, type, poids, nom d'origine) et l'état du scan. Le porteur du projet a demandé
de séparer les deux : une table `uploads` générique, avec un discriminant `type`, référencée par
`shelf_scans` via une clé étrangère — plutôt que de dupliquer les colonnes « fichier » si un
deuxième type d'upload apparaît un jour (`bibliography` référençant une couverture enrichie, par
exemple).

**Decision**: deux tables Postgres.

**`uploads`** — la référence générique de tout fichier déposé dans le bucket, quel que soit le
contexte qui l'a écrit :

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid`, clé primaire | Généré par l'application (`crypto.randomUUID()`), sert aussi de nom d'objet dans le bucket (research.md §9). |
| `owner_id` | `text` | Segment « utilisateur » du chemin dans le bucket (research.md §10) — une valeur fixe pour l'instant, jamais un compte réel. |
| `type` | `text` | Discriminant du genre d'upload — `'shelf_photo'` pour tout ce qu'écrit cette feature, texte libre plutôt qu'un type Postgres `enum` pour rester extensible sans migration de type à chaque nouveau genre (cohérent avec `shelf_scans.status`, déjà en texte). |
| `bucket_key` | `text` | `{owner_id}/{type}/{id}` — le segment `type` remplace le `shelf-photos/` fixe de la version précédente, désormais dérivé de la colonne du même nom. |
| `media_type` | `text` | Un des quatre types acceptés par `ShelfPhoto` pour `type = 'shelf_photo'` ; pas de contrainte fixée ici pour un genre d'upload qui n'existe pas encore. |
| `size_bytes` | `integer` | Poids du fichier en octets (`bytes.byteLength`, ≤ 20 Mo déjà garanti par `ShelfPhoto` pour ce genre). |
| `original_filename` | `text` | Le nom de fichier tel que fourni par le navigateur (`file.name` côté web, `file.originalname` côté multer) — **jamais** utilisé pour nommer l'objet stocké (research.md §10), gardé uniquement à des fins de référence (FR-015). |
| `created_at` | `timestamptz`, défaut `now()` | Horodatage du **stockage du fichier** — canonique pour toute la ligne, y compris pour `shelf_scans` qui n'a plus son propre horodatage. |

**`shelf_scans`** — l'état du scan associé à un upload de type `shelf_photo`, et seulement ça :

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid`, clé primaire | Identité propre de l'enregistrement de scan — distincte de `upload_id`, pour ne pas figer la relation à « un scan = un upload » au niveau du type de la clé elle-même, même si c'est le cas aujourd'hui. |
| `upload_id` | `uuid`, clé étrangère vers `uploads.id`, `NOT NULL`, `UNIQUE` | Un upload correspond à au plus un scan pour cette feature (`UNIQUE` l'impose plutôt que de le laisser à la seule discipline applicative). Identifiant renvoyé au frontend (`/shelf-photos/{id}/scan`, research.md §7) — c'est en réalité `upload_id` qui circule côté HTTP, `shelf_scans.id` reste un détail interne au schéma (voir Rationale). |
| `status` | `text` (`pending` \| `completed` \| `failed`) | Inchangé (research.md §7). |
| `detected_books` | `jsonb`, nullable | Inchangé — dénormalisé, pas une table par livre (voir Rationale ci-dessous, reprise de la version précédente). |

**Rationale** (table `uploads`) : le porteur du projet anticipe un deuxième genre d'upload
(couverture enrichie pour `bibliography`, par exemple) — une seule table de référence évite de
recopier `bucket_key`/`media_type`/`size_bytes`/`original_filename` dans chaque nouvelle table
métier qui a besoin de référencer un fichier du bucket. Rester dans `recognition-infrastructure`
pour l'instant plutôt que dans une lib partagée (`libs/shared/*`) : `recognition` est le seul
contexte fondé en code aujourd'hui (`bibliography`/`curation` n'existent pas encore), et l'ADR 0002
prévient justement contre une lib `shared` ouverte par anticipation plutôt que sur un besoin
constaté — promouvoir `uploads` en schéma partagé redevient une décision légitime le jour où un
second contexte écrit réellement dans le bucket, pas avant.

**Rationale** (FK `shelf_scans.upload_id`, `id` propre plutôt que clé partagée) : une clé primaire
partagée (`shelf_scans.id = uploads.id`) aurait évité la colonne `upload_id`, mais aurait aussi fait
porter à `shelf_scans` une contrainte de son voisin (« mon identifiant est en réalité celui d'un
upload ») au lieu de l'exprimer comme une relation explicite. Une FK ordinaire dit directement ce
qu'elle est : un scan **porte sur** un upload, il ne **s'y substitue** pas.

**Rationale** (`detected_books` en `jsonb`, reprise de la version précédente) : les livres détectés
ne sont pas encore des entités stables — ils n'ont pas traversé la réconciliation (`bibliography`,
pas encore fondé) qui leur donnerait une identité propre. Les dénormaliser évite de construire un
schéma relationnel pour une donnée qui sera de toute façon retraitée par un contexte qui n'existe
pas encore (convention « pas d'abstraction prématurée »). `status` en union fermée plutôt qu'un
`null` implicite comme signal d'échec : la Constitution (III, « typage prouvé ») demande d'éviter
l'ambiguïté qu'un `null` porterait (échec ? liste non encore peuplée ?).

**Étanchéité avec le domaine** : ce découpage en deux tables est entièrement un détail
d'`infrastructure` (convention « le SQL, le schéma et les migrations restent dans infrastructure »)
— `ShelfScanRecord` (`data-model.md`), le type que `ShelfScanRepositoryPort` manipule, garde
exactement la même forme qu'avant (`ownerId`, `photoBucketKey`, `photoMediaType`, `photoSizeBytes`,
`originalFilename`, `status`, `detectedBooks`) : c'est l'adaptateur Drizzle qui fait le
join/l'écriture transactionnelle entre les deux tables pour reconstruire ou peupler cette forme
unique. Ni `domain` ni `application` n'ont connaissance de l'existence de deux tables.

**Alternatives considered**: rester sur une seule table `shelf_scans` (version précédente) —
rejetée à la demande du porteur du projet, qui anticipe un second genre d'upload ; un champ
`error_message` sur échec — toujours rejeté (`ShelfScanFailed` ne garantit pas un message stable) ;
promouvoir `uploads` en schéma `libs/shared/*` dès maintenant — rejetée (YAGNI, un seul contexte
fondé) ; clé primaire partagée entre `uploads` et `shelf_scans` plutôt qu'une FK — rejetée (voir
Rationale).

## 9. Stockage du fichier et émulation locale

**Decision**: `@google-cloud/storage` (SDK officiel) derrière `ShelfPhotoStoragePort` — `store`
pour `StoreShelfPhotoUseCase`, `retrieve` pour `ScanStoredShelfPhotoUseCase` (research.md §7) —,
clé d'objet `{owner_id}/shelf_photo/{id}` (le même `id` que la ligne `uploads`, sans extension —
le type MIME est posé comme métadonnée de l'objet à l'écriture, et refourni tel quel par
`retrieve` : pas déduit d'une extension). Le segment `owner_id` et le choix de ne jamais y faire
apparaître le nom de fichier d'origine sont détaillés en research.md §10 ; le segment `shelf_photo`
reprend la colonne `type` de la table `uploads`, research.md §8. En local et en CI,
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

---

Section 10 ajoutée le 21/09/2026, troisième échange : le porteur du projet a demandé (1) une
référence Postgres complète pour chaque fichier du bucket (emplacement, type, **poids** — déjà
couvert pour les deux premiers, complété en §8), (2) un sous-dossier par utilisateur dans le
bucket, et (3) que le nom de fichier d'origine n'apparaisse jamais tel quel dans le stockage, tout
en restant retrouvable en base. Décidé avec lui : le sous-dossier utilisateur utilise un
identifiant fixe pour l'instant, aucune authentification n'est introduite par cette feature.

## 10. Isolation par utilisateur et anonymisation du nom de fichier

**Decision**:
- Clé d'objet : `{owner_id}/shelf_photo/{id}` (research.md §9), où `owner_id` vient d'une
  nouvelle variable d'environnement optionnelle `OWNER_ID` (défaut `"default"`), lue par
  `environment.ts` au même titre que `WEB_ORIGIN`. `StoreShelfPhotoUseCase` la reçoit à la
  construction (composition root, `recognition.module.ts`) et l'utilise pour construire la clé
  complète, qu'il transmet à `ShelfPhotoStoragePort.store(photo, key)` — le port ne décide plus du
  nom de l'objet, il stocke sous le nom qu'on lui donne (léger changement de signature par rapport
  à research.md §7 : `store` ne renvoie plus de clé générée, il en reçoit une).
- `id` reste l'identifiant `uuid` généré par l'application (research.md §7, §8) : c'est lui, et
  seulement lui, qui nomme l'objet dans le bucket. Le nom de fichier d'origine (`file.name` côté
  web, capturé côté serveur par multer sous `file.originalname`) est reçu par
  `StoreShelfPhotoUseCase` et écrit dans la colonne `original_filename` de la table **`uploads`**
  (§8, révisée depuis : cette colonne vivait initialement sur `shelf_scans`, avant l'introduction
  de la table générique) — jamais utilisé pour construire la clé, jamais renvoyé dans une réponse
  HTTP
  (`contracts/scan-api.md`, inchangé : aucun endpoint n'expose `original_filename`).

**Rationale**: un identifiant fixe (`OWNER_ID`, une valeur de configuration comme
`SHELF_SCANNER_PROVIDER`) donne au bucket une disposition déjà compatible avec de vrais comptes
utilisateurs plus tard — passer d'un `owner_id` constant à un `owner_id` par compte ne change ni le
schéma ni la disposition du bucket, seulement la source de la valeur — sans que cette feature n'ait
à construire la moindre notion d'authentification, hors de son scope (`spec.md`, Assumptions :
« usage mono-utilisateur, sans compte »). Ne jamais nommer l'objet d'après le fichier d'origine
évite deux problèmes propres à un nom de fichier de téléphone : il peut entrer en collision avec un
autre envoi (deux photos nommées `IMG_0001.jpg` par deux appareils, ou par le même après une
réinitialisation de compteur), et il peut porter une information qu'on ne veut pas voir apparaître
dans une clé d'objet ou une URL (un nom de fichier reste, par construction, un texte libre fourni
par un tiers). Le conserver en base répond au besoin réel derrière la demande (retrouver, au besoin,
sous quel nom l'utilisateur connaissait sa photo) sans lui faire porter aucun rôle technique.

**Alternatives considered**: dériver `owner_id` de l'adresse IP ou d'un cookie de session — rejeté,
introduirait une notion de session sans qu'elle soit demandée, pour un bénéfice nul tant qu'un seul
« utilisateur » existe ; laisser le port `ShelfPhotoStoragePort` générer lui-même la clé complète
(y compris `owner_id`) plutôt que de la recevoir déjà construite — rejeté, ça lui ferait porter une
connaissance (la configuration `OWNER_ID`) qui n'est pas la sienne : construire la clé est une
décision de `StoreShelfPhotoUseCase`, le stockage à cette clé est celle du port.
