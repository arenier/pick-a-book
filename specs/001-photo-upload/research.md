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
