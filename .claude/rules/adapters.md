---
paths:
  - "libs/*/infrastructure/**"
  - "apps/api/src/**"
---

# Adapters et composition root

Pourquoi : [ADR 0002](../../docs/adr/0002-ddd-et-architecture-hexagonale.md),
[ADR 0005](../../docs/adr/0005-reconnaissance-livres-photo-etagere.md) (reconnaissance),
[ADR 0006](../../docs/adr/0006-persistance-postgres-neon.md) (Postgres),
[ADR 0013](../../docs/adr/0013-politique-d-erreur-result-aux-frontieres.md) (erreurs). Modèle à
suivre : [`libs/recognition/infrastructure/README.md`](../../libs/recognition/infrastructure/README.md).

## Écrire un adapter

- `<techno>-<port>.adapter.ts`, une classe qui `implements` le port. Elle **rend l'`Err` que le
  port déclare** pour ses échecs attendus, et rejette librement pour le reste
  ([`error-policy.md`](error-policy.md)).
- **Toute réponse externe se valide par un schéma `zod`**, jamais par un `as`
  ([`typescript.md`](typescript.md)). Le schéma est **étroit** : il ne décrit que les champs dont
  l'adapter dépend, pour qu'un ajout côté fournisseur ne casse rien.
- **Tout ou rien** : une réponse qui ne se prouve pas entièrement est refusée en bloc. Garder la
  partie valide livrerait un résultat silencieusement tronqué.
- **Le transport est injecté** (`fetch` en paramètre du constructeur, défaut `globalThis.fetch`),
  pour que les tests rejouent sans réseau.
- Ce qui bouge chez le fournisseur (modèle, `baseUrl`) est **surchargeable par configuration**, avec
  une valeur par défaut dans l'adapter.
- Deux adapters d'un même port partagent le **même prompt** et la **même validation** : sinon on
  compare les prompts autant que les fournisseurs.

## Tester un adapter

- **Fournisseur payant ou distant** (VLM, API bibliographique) : réponses enregistrées dans
  `src/lib/recorded/`, dont le `README.md` donne la **provenance** de chaque fixture (appel réel
  daté, ou écrite à la main — et alors ce que cela ne prouve pas). Jamais d'appel réel en CI.
- **Postgres et bucket** : contre la vraie techno, les services `db` et `bucket` de
  `docker compose`, jamais contre des doubles.
- L'émulateur de bucket se désigne par **`BUCKET_EMULATOR_HOST`**, jamais `STORAGE_EMULATOR_HOST` :
  le SDK lit cette dernière de lui-même et en dérive des URL fausses.

## Persistance

- Le schéma Drizzle vit dans `src/lib/drizzle/schema.ts` de l'`infrastructure` du contexte.
- **Les migrations sont générées par `yarn db:generate`, jamais écrites ni retouchées à la main.**
  Elles sont commitées avec le changement de schéma qui les produit.
- L'API les applique au démarrage, sous verrou consultatif : une révision ne sert jamais une
  requête contre un schéma qu'elle ne connaît pas.

## Composition root (`apps/api`)

- **Seul `apps/api` importe une lib `infrastructure`.** Chaque contexte y a son module
  (`apps/api/src/<contexte>/<contexte>.module.ts`) qui lie chaque port à son adapter par son jeton.
- Le choix d'un adapter vient de la **configuration validée** (`src/config/environment.ts`), par
  une fabrique `<port>.factory.ts` dont la spec vérifie la liaison de chaque valeur par son nom.
- **Une variable requise manquante fait échouer le démarrage**, avec la liste de ce qui manque.
  Toute nouvelle variable passe par `environment.ts` (et sa spec) et s'ajoute à `.env.example` ;
  dans `apps/api`, personne d'autre ne lit `process.env`.
- Un contrôleur lit le `Result` du use case et traduit l'`Err` par le `switch` exhaustif sur `kind`
  de `<contexte>-http-error.ts`. Le filtre global de `src/http/` ne traduit aucune erreur de
  domaine.
