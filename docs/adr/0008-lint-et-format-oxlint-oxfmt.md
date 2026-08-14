# ADR 0008 — Lint et format : oxlint + oxfmt, ESLint réduit aux frontières

Statut : accepté · Date : 2026-08-14 · Socle · Couplé aux ADR [0002](0002-ddd-et-architecture-hexagonale.md) (frontières) et [0007](0007-vite-et-vitest-outillage-unique.md) (outillage)

## Contexte

Le scaffolding Nx a livré deux outils pour la qualité de forme : **ESLint** (config plate, plugins
`@nx/*` et `typescript-eslint`) pour le lint, **Prettier** pour le format. ESLint ne fait pas
qu'attraper des erreurs : c'est lui qui héberge `@nx/enforce-module-boundaries`, le mécanisme qui
rend exécutables les frontières hexagonales de l'[ADR 0002](0002-ddd-et-architecture-hexagonale.md).
Sans cette règle, l'architecture n'est qu'un document.

L'écosystème **Oxc** (Rust) propose depuis deux outils qui recouvrent ce périmètre : **oxlint**
(linter, stable, 1.x) et **oxfmt** (formateur compatible Prettier, ~30× plus rapide). Un seul
mainteneur ([0001](0001-stack-et-monorepo-nx.md)), peu de code : ce qui coûte n'est pas la vitesse
d'exécution — tout est déjà sous la seconde — mais le nombre de choses à connaître.

Deux faits contraignent le choix, vérifiés à la mise en place :

- **oxlint ne sait pas faire tourner `@nx/enforce-module-boundaries`.** C'est un plugin ESLint qui
  s'appuie sur le graphe de projets Nx et les `tags` ; oxlint n'a pas d'équivalent, et le support
  d'oxlint côté Nx est une question ouverte, pas une capacité existante. Idem pour
  `@nx/dependency-checks`.
- **oxfmt est en beta (0.x).** Compatible Prettier sur les réglages usuels, mais pré-1.0 sur un repo
  socle.

## Problématique

Où placer l'arbitrage : renoncer à un écosystème unique pour garder le garde-fou d'architecture, ou
tout basculer sur Oxc et réexprimer les frontières avec des moyens plus faibles ? Le corollaire
tient à la maturité : accepter un formateur 0.x suppose une porte de sortie triviale.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible · ⚪ à clarifier

| Critère | Poids | Motif |
|---|---|---|
| Préservation des frontières | 🔴 | `@nx/enforce-module-boundaries` par `tags` est le mécanisme de l'ADR 0002. Le perdre, c'est perdre l'architecture, pas une règle de style. |
| Uniformité de l'outillage | 🟠 | Un mainteneur unique : moins d'outils, moins de modèles mentaux. |
| Réversibilité | 🟠 | oxfmt est en 0.x : la bascule vers/depuis Prettier doit rester triviale. |
| Sévérité applicable | 🟠 | La demande est explicite : des règles strictes, appliquées, pas seulement écrites. |
| Vitesse de retour | 🟢 | À cette taille, tous les candidats sont sous la seconde. |

## Solutions proposées

**A — Statu quo : ESLint + Prettier.**
- Pour : chemins générés par Nx, éprouvés ; les frontières marchent déjà.
- Contre : deux écosystèmes, et un linter lent qui le deviendra plus avec le code. Ne répond pas à
  la demande d'outillage Oxc.

**B — oxlint + oxfmt seuls, ESLint supprimé.** Les frontières sont réapproximées avec les règles
d'import d'oxlint (restriction par chemin). Écartée : ces règles ignorent le graphe de projets et
les `tags` Nx — elles ne distinguent pas `type:domain` de `type:app`, ne suivent pas les
`allowedExternalImports`, et se contournent en changeant un chemin. C'est une régression directe
sur le critère 🔴 et sur l'ADR 0002.

**C — Hybride : oxlint principal + ESLint réduit aux règles de graphe Nx + oxfmt.** oxlint devient
le linter de référence (correctness, TypeScript, React, imports, unicorn…), en catégories strictes.
ESLint est conservé pour les **seules** règles qu'oxlint ne peut pas exprimer, toutes deux fondées
sur le graphe Nx : `@nx/enforce-module-boundaries` et `@nx/dependency-checks`. `eslint-plugin-oxlint`
désactive côté ESLint tout ce qu'oxlint couvre déjà, pour qu'aucune erreur ne soit reportée deux
fois. oxfmt remplace Prettier avec les mêmes réglages (`singleQuote`, `printWidth: 100`).

## Solution retenue

**Solution C**, sur l'ensemble du repo. `yarn lint` enchaîne `oxlint` puis `nx run-many -t lint`
(ESLint, frontières) ; `yarn format` appelle `oxfmt`.

1. **Frontières (🔴)** — l'enforcement par `tags` de l'ADR 0002 est conservé à l'identique : ESLint
   garde `@nx/enforce-module-boundaries` et `@nx/dependency-checks`, rien de plus. Vérifié à la mise
   en place : un import `domain → infrastructure` fait toujours échouer `yarn lint`.
2. **Uniformité (🟠)** — oxlint et oxfmt partagent l'écosystème Oxc ; ESLint n'a plus de règle métier
   à comprendre, c'est un exécuteur de deux règles Nx dont le pourquoi vit ici et dans l'ADR 0002.
3. **Réversibilité (🟠)** — oxfmt étant configuré comme Prettier, le code passe sans reformatage
   (zéro fichier modifié à l'adoption) : revenir à Prettier ne toucherait aucun `.ts`.
4. **Sévérité (🟠)** — catégories `correctness`, `suspicious`, `perf` et `pedantic` en erreur ; la
   convention « pas de `as` » migre en `typescript/consistent-type-assertions` (`assertionStyle:
   never`). L'adoption a corrigé 25 points réels dans le code du scaffolding.

### Conditions de bascule

- **Retrait complet d'ESLint** le jour où oxlint (ou un plugin) sait exprimer les frontières par
  `tags` Nx en suivant le graphe de projets. Le déclencheur est une capacité, pas une date : tant
  qu'elle n'existe pas, ESLint reste — c'est son unique raison d'être ici.
- **Retour à Prettier** si oxfmt (0.x) bloque ou régresse. Le style étant identique, la bascule est
  un changement de deux scripts et d'une dépendance, sans diff de code.

### Conséquences

- **ESLint reste une dépendance, réduite à deux règles.** `eslint-plugin-oxlint` doit rester **en
  dernier** dans `eslint.config.mjs` : c'est lui qui éteint les doublons. Déplacé plus haut, les
  deux linters reportent les mêmes erreurs.
- **Des règles strictes sont désactivées ou tempérées quand elles heurtent un choix acté**, chacune
  pour une raison, pas par confort :
  - `react/react-in-jsx-scope` → off : React 19, runtime JSX automatique, pas d'`import React`.
  - `unicorn/prefer-top-level-await` → off : la sortie de l'API est **CommonJS**
    ([0007](0007-vite-et-vitest-outillage-unique.md)) — le top-level await n'y existe pas.
  - `typescript/no-extraneous-class` → `allowWithDecorator: true` : les modules NestJS sont des
    classes décorées, parfois vides, par construction.
  - `unicorn/prefer-query-selector` → off : `getElementById` est volontaire au point de montage,
    mieux typé, et déjà gardé par une vérification explicite plutôt qu'un `as`.
  - Deux autres, venues avec le type-aware, sont motivées dans l'extension ci-dessous :
    `typescript/prefer-readonly-parameter-types` et `require-await`.
- **Oxc en lint/format n'entame pas le choix de transpileur du build.** L'[ADR 0007](0007-vite-et-vitest-outillage-unique.md)
  écarte Oxc pour le build de l'API parce qu'il n'émet pas `design:paramtypes` ; c'est SWC qui
  transpile. Lint et format sont un autre plan : adopter oxlint/oxfmt ne rouvre pas 0007.
- **oxfmt ne formate pas le Markdown** des ADR (`ignorePatterns`), qui restent enveloppés à la main
  à 100 colonnes. `sortPackageJson` est désactivé : un formateur trie les octets, pas les clés d'un
  manifeste — ce serait un diff sémantique déguisé en format.

## Extension — lint type-aware (`oxlint-tsgolint`), 2026-08-14

Ajout au corps de la décision, pas révision : la sévérité voulue au critère 🟠 supposait le pan
type-aware, laissé de côté à la bascule. oxlint le met derrière deux verrous — le flag
**`--type-aware`** et le paquet **`oxlint-tsgolint`** (moteur `tsgolint`, type-checker Go). Les
deux sont désormais en place ; `oxlint-tsgolint` est une **dépendance structurante du lint**, au
même titre qu'oxlint : sans elle, `yarn lint` s'arrête sur `Failed to find tsgolint executable`.
Elle est épinglée à l'exact (`7.0.2001`) et se distribue comme oxlint, par paquets natifs par
plateforme en `optionalDependencies` — donc sans script d'installation, ce que réclame le
`enableScripts: false` du `.yarnrc.yml`.

### Mesurer avant de choisir

La liste de règles n'est pas reprise d'un preset : les 21 règles candidates ont été activées **en
erreur toutes ensemble** sur l'ensemble du repo, et la liste finale calée sur ce relevé.

| Règle | Violations | Sort |
|---|---|---|
| `prefer-readonly-parameter-types` | 27 | Écartée |
| `promise-function-async` | 2 | Retenue, corrigées |
| `no-deprecated` | 2 | Retenue, corrigées |
| Les 20 autres candidates | 0 | Retenues |

Un relevé à zéro ne prouve rien s'il vient d'un moteur muet : deux vérifications l'écartent. Un
fichier sonde déposé dans **chacun des six projets** déclenche bien les règles type-aware — les
`tsconfig` par projet et le `tsconfig.base` sont donc tous résolus. Une sonde par règle confirme
que chacune des 21 est réellement implémentée par tsgolint et se déclenche. Le zéro est donc du
signal : c'est l'effet des conventions déjà en vigueur — interdiction du `as`, `strict`, value
objects validant à la construction — qui ferme d'avance les trous que ces règles surveillent.

### Règles écartées, chacune pour une raison

- **`prefer-readonly-parameter-types` → off.** Elle n'était pas candidate : elle arrive avec la
  catégorie `pedantic` dès que le type-aware s'allume. Elle exige des paramètres *profondément*
  readonly. Or `ShelfPhoto` porte ses octets en **`Uint8Array`**, type mutable dont TypeScript n'a
  pas de variante readonly ; l'impossibilité se propage à tout ce qui traverse une photo — le port,
  le use case, l'adapter. Idem pour `NodeJS.ProcessEnv` dans `apps/api/src/config/environment.ts`,
  type externe. Même en `treatMethodsAsReadonly: true` — sans quoi tout value object doté d'une
  méthode est compté mutable — il reste 12 violations, toutes structurellement insatisfiables sans
  inventer de faux types. Une règle qu'on ne peut pas satisfaire n'apprend rien.
- **`require-await` → off** (la règle `eslint` et sa jumelle `typescript`). Elle **contredit
  frontalement `promise-function-async`**, retenue : l'une réclame `async` sur toute fonction qui
  rend une `Promise`, l'autre l'interdit faute d'`await` dans le corps. Les deux ne peuvent pas
  tenir. On garde celle qui prévient un bug : sans `async`, une fonction déclarée `Promise<T>` qui
  échoue **jette de façon synchrone** au lieu de rejeter, et le `.catch` de l'appelant ne la voit
  pas. C'est exactement ce que promet `ShelfScannerPort`. `require-await`, elle, ne signale qu'une
  gêne de style, sur une prémisse fausse ici : l'`async` n'est pas décoratif quand le contrat de
  la fonction est une promesse.

`no-unnecessary-type-assertion` et `non-nullable-type-assertion-style` sont retenues bien que
quasi inatteignables — `consistent-type-assertions: never` interdit déjà le `as` qu'elles
surveillent. Elles ne coûtent rien et tiennent la seconde ligne.

`strict-boolean-expressions` est retenue **à ses réglages par défaut** (`allowString` et
`allowNumber` à `true`) : zéro violation en l'état. La durcir dépasse ce que le relevé justifie.

### Corrections appliquées

- `StubShelfScannerAdapter.scan` et le double de port de `scan-shelf.use-case.spec.ts` passent
  `async` (`promise-function-async`). Aucun changement de comportement observable aujourd'hui :
  les deux corps sont sans échec possible. Ce que la correction achète est le contrat — le jour où
  le corps peut jeter, il rejettera.
- `apps/api/vite.config.mts` : `rollupOptions` → `rolldownOptions`, Vite 8 bundlant avec Rolldown.
  Vérifié : la sortie `dist/` est **identique octet pour octet** avant et après.
- `apps/web/vite.config.mts` : `commonjsOptions` retiré, sans effet depuis Vite 8.

### Coût

`--type-aware` fait passer le lint de **142 ms à 770 ms** sur ce repo (binaire seul, moyenne de 5
exécutions ; ~690 ms → ~1,3 s à travers `yarn`). Le surcoût — sous la seconde — ne justifie ni un
job de CI séparé ni une restriction à `nx affected` : le flag est ajouté au step `Checks`
existant, et aux scripts `lint` et `check`. La condition de bascule est là : le jour où ce
surcoût devient sensible, le type-aware devient un job à part avant d'être rogné.

## Question ouverte

**Activer le tri d'imports (`sortImports`) et de `package.json` (`sortPackageJson`) d'oxfmt ?** Tous
deux désactivés aujourd'hui pour une bascule iso-Prettier. Les activer donnerait un ordre canonique
stable, au prix d'un gros diff ponctuel — choix volatil, sans impact architectural, renvoyé au
README du repo le jour où la question se pose.
