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
- **Oxc en lint/format n'entame pas le choix de transpileur du build.** L'[ADR 0007](0007-vite-et-vitest-outillage-unique.md)
  écarte Oxc pour le build de l'API parce qu'il n'émet pas `design:paramtypes` ; c'est SWC qui
  transpile. Lint et format sont un autre plan : adopter oxlint/oxfmt ne rouvre pas 0007.
- **oxfmt ne formate pas le Markdown** des ADR (`ignorePatterns`), qui restent enveloppés à la main
  à 100 colonnes. `sortPackageJson` est désactivé : un formateur trie les octets, pas les clés d'un
  manifeste — ce serait un diff sémantique déguisé en format.

## Question ouverte

**Activer le tri d'imports (`sortImports`) et de `package.json` (`sortPackageJson`) d'oxfmt ?** Tous
deux désactivés aujourd'hui pour une bascule iso-Prettier. Les activer donnerait un ordre canonique
stable, au prix d'un gros diff ponctuel — choix volatil, sans impact architectural, renvoyé au
README du repo le jour où la question se pose.
