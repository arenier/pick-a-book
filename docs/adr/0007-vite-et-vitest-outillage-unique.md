# ADR 0007 — Vite et Vitest comme outillage unique de build et de test

Statut : accepté · Date : 2026-07-31 · Socle · Couplé à l'ADR [0001](0001-stack-et-monorepo-nx.md) (stack et monorepo)

## Contexte

Le scaffolding issu des générateurs Nx a livré **deux chaînes d'outils dans un même
monorepo** : `apps/api` construisait avec webpack et testait avec Jest ; `apps/web`
construisait avec Vite et testait avec Vitest ; les libs testaient avec Jest et
construisaient avec `tsc`. Trois configurations de test coexistaient (`jest.preset.js`,
`jest.config.cts` par projet, `.spec.swcrc` par projet, plus les fichiers Vite).

Le projet a un seul mainteneur ([0001](0001-stack-et-monorepo-nx.md)) et six projets Nx. Le
volume de code est faible ; ce qui coûte cher n'est pas la compilation, c'est le nombre de
choses à savoir pour intervenir dans un projet donné.

## Problématique

Où placer le coût : maintenir deux outillages qui font le même travail, ou payer une fois la
configuration d'un bundler moderne pour un backend NestJS, qui n'est pas son terrain
d'élection ?

Le corollaire est celui des générateurs : Nx génère du webpack ou de l'esbuild pour une app
Node. Choisir Vite pour l'API, c'est accepter d'écrire cette configuration à la main et de la
maintenir aux montées de version de Nx.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible · ⚪ à clarifier

| Critère | Poids | Motif |
|---|---|---|
| Uniformité de l'outillage | 🔴 | Un mainteneur unique : une seule syntaxe de configuration, un seul runner de tests, un seul modèle mental. |
| Coût de configuration NestJS | 🟠 | Les décorateurs et `emitDecoratorMetadata` ne sont pas gérés par tous les transpileurs. |
| Réversibilité | 🟠 | Le bundler doit pouvoir être remplacé sans toucher au domaine ni à l'application. |
| Vitesse de retour | 🟢 | À cette taille, tous les candidats sont sous la seconde. |

## Solutions proposées

**A — Statu quo : webpack + Jest côté API, Vite + Vitest côté front.**
- Pour : chemins générés par Nx, éprouvés, aucun travail à faire.
- Contre : deux syntaxes de configuration, deux runners, deux façons d'écrire un mock pour
  le même repo. Le coût est permanent et croît avec le nombre de projets.

**B — Vite + Vitest partout.**
- Pour : une configuration par projet, dans le même langage ; le runner de tests partage la
  résolution de modules du bundler ; outillage aligné sur l'écosystème actuel.
- Contre : le build Node de NestJS demande une configuration explicite (mode SSR, sortie
  CJS, transformation SWC pour les métadonnées de décorateurs). Vite reste un outil pensé
  d'abord pour le navigateur.

**C — webpack + Jest partout.** Écartée : uniformiser vers l'outillage le moins actif des
deux, et perdre le serveur de développement du front.

**D — esbuild (`@nx/esbuild`) côté API + Vitest partout.** Écartée : règle le problème des
tests mais laisse deux bundlers, donc ne traite pas le critère 🔴. esbuild ne gère pas non
plus `emitDecoratorMetadata`, le même travail de configuration serait à faire.

## Solution retenue

**Solution B**, sur l'ensemble du repo : `vite build` pour les deux apps, Vitest pour tous
les projets, `tsc` conservé pour la compilation des libs — une bibliothèque publiée par ses
types n'a pas besoin d'un bundler.

1. **Uniformité (🔴)** — une seule syntaxe de configuration dans tout le repo, et un seul
   runner. Un contributeur qui a compris `apps/web` a compris `libs/recognition/domain`.
2. **Uniformité (🔴)** — la suppression de Jest retire trois fichiers de configuration par
   projet (`jest.config.cts`, `.spec.swcrc`, et le preset racine) au profit d'un seul.
3. **Réversibilité (🟠)** — le bundler ne touche que `apps/api/vite.config.mts` et le
   `Dockerfile`. Le domaine et l'application n'en dépendent pas
   ([0002](0002-ddd-et-architecture-hexagonale.md)), ce qui est précisément ce qui rend ce
   choix peu coûteux à défaire.

### Conditions de bascule

Le déclencheur mesurable est **un échec de build ou d'exécution que la déclaration d'une
dépendance en `external` ne résout pas** — cas attendu le jour où la persistance SQLite
([0006](0006-persistance-postgres-neon.md)) amène une dépendance native. Dans ce cas,
l'API repasse à `@nx/esbuild` ou à une simple compilation `tsc`, sans que Vitest ni les
autres projets ne bougent.

> **Note (0006, 2026-08-14).** [0006](0006-persistance-postgres-neon.md) a finalement retenu Postgres
> (Neon) avec Drizzle, **en pur JavaScript** : l'exemple ci-dessus — une dépendance native amenée par
> SQLite — ne se matérialise pas par la persistance. La condition de bascule générique reste valable.

### Conséquences

- **`unplugin-swc` devient une dépendance structurante du build de l'API.** Ni esbuild ni
  Oxc n'émettent les métadonnées `design:paramtypes` dont NestJS a besoin pour l'injection
  par constructeur. Retirer ce plugin ne casse pas la compilation : ça casse l'injection **à
  l'exécution**. Le commentaire en tête de `apps/api/vite.config.mts` le dit ; il n'est pas
  décoratif.
- **Le bundle de l'API inline les libs du workspace** (`ssr.noExternal`) et laisse les
  dépendances npm externes. L'image d'exécution n'embarque donc que `dist` et
  `node_modules` : elle n'a plus besoin de `libs/*/dist`, dont l'ancienne image webpack
  dépendait sans le dire — les `require('@pick-a-book/…')` qu'elle laissait dans sa sortie
  pointaient vers des liens symboliques absents de l'étape d'exécution.
- Les générateurs Nx d'application Node continueront de proposer webpack ou esbuild. Un
  `nx g @nx/nest:app` futur réintroduira une configuration webpack : elle est à remplacer à
  la main, ce que rien n'empêche automatiquement.
- La sortie de l'API est en **CommonJS**. Un passage à ESM est possible mais n'apporte rien
  aujourd'hui, et ferait entrer les problèmes d'interopérabilité des paquets NestJS.
- Les tests des libs continuent de s'exécuter contre le `dist` de leurs dépendances, comme
  avec Jest : la cible `test` dépend de `^build`.

## Question ouverte

**L'API a-t-elle besoin d'un bundle en production ?** Les dépendances npm étant externes,
une compilation `tsc` produirait un résultat équivalent, avec une configuration plus courte.
Le bundle est conservé pour n'avoir qu'un fichier d'entrée à copier dans l'image et pour
garder le même outil des deux côtés. Une réponse par la négative simplifierait
`apps/api/vite.config.mts` sans rien changer au reste — ce qui la rend peu urgente.
