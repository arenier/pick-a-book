# ADR 0012 — Design system de l'interface : shadcn/ui et Tailwind, dans `libs/shared/ui`

Statut : accepté · Date : 2026-09-27 · Phase 1 · Couplé aux ADR [0002](0002-ddd-et-architecture-hexagonale.md) (feature-slice), [0007](0007-vite-et-vitest-outillage-unique.md) (outillage), [0008](0008-lint-et-format-oxlint-oxfmt.md) (lint) et à l'ADR d'internationalisation de l'interface (#58)

## Contexte

`apps/web` n'a aucun design system. Le front compte aujourd'hui une slice,
`features/photo-upload` (#23, livrée par #55, `specs/001-photo-upload`), et le shell de l'app. Leur
interface repose sur des **éléments HTML natifs** stylés à la main :
- un `<input type="file">` pour choisir la photo, sans attribut `capture`, pour que le téléphone
  propose l'appareil photo comme la galerie ;
- des `<button>` pour envoyer et pour recommencer ;
- un `<output>` pour l'attente de l'analyse, d'environ 30 s ;
- un paragraphe `role="alert"` pour l'erreur ;
- une liste des livres détectés, avec leur titre et leur auteur.

#63 y a ajouté l'aperçu de la photo choisie. La confiance de chaque livre est reçue de l'API,
mais elle n'est pas affichée (`data-model.md`).

Le style tient en une feuille globale et deux CSS Modules :
- `styles.css` fixe une pile de polices `system-ui` ;
- `app.module.css` fixe la largeur du shell ;
- `photo-upload-screen.module.css` porte l'écran d'upload, avec des couleurs d'erreur écrites en
  dur (`#b3261e`, `#fdecea`, `#5f1410`).

Adopter un design system maintenant coûte la migration d'une slice, et chaque nouvelle slice en
ajoutera une. Le cadrage est dans l'issue #59. Plusieurs points y sont déjà fixés et ne sont pas
rediscutés ici :

- on **adopte** un design system publié et maintenu, on n'en conçoit pas un. Notre travail se
  limite à le thémer, à l'encapsuler et, pour un système copié, à le mettre aux normes du dépôt ;
- les **bibliothèques headless** sont **écartées** : elles apportent le comportement et
  l'accessibilité mais aucun style, et tout repasser par-dessus coûte trop cher pour un seul
  mainteneur ;
- le **DSFR** est écarté : son usage est réservé aux sites de l'État.

L'usage se fait au téléphone, en ressourcerie, sur un réseau quelconque (Safari iOS et Chrome
Android d'abord). L'écran doit rester utilisable dès 360 px sans défilement horizontal (SC-004).
Tout le texte affiché, textes d'accessibilité compris, passera par un catalogue typé en français et
en anglais (#58).

Le [README des ADR](README.md) range une « bibliothèque interchangeable » parmi ce qui ne mérite
pas d'ADR. Un design system n'est pas interchangeable : chaque composant de chaque slice en dépend,
il fixe la façon d'écrire le style, et il pèse sur l'accessibilité, l'i18n, les tests et le lint.

## Problématique

Où placer le coût de l'interface : dans une **bibliothèque complète**, qui livre des composants
finis mais impose son poids, son style et ses chaînes intégrées ? Ou dans des **composants copiés
dans le dépôt**, légers et entièrement à nous, mais qu'il faut alors maintenir, tester et mettre à
jour à la main ?

Le corollaire tient aux garde-fous. Le dépôt refuse les règles seulement écrites : une bibliothèque
qui impose des `as`, fait échouer le lint strict, casse les tests dans jsdom ou laisse fuir de
l'anglais dans les `aria-label` coûte à chaque écran, pas une seule fois.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible · ⚪ à clarifier

| Critère | Poids | Motif |
|---|---|---|
| Composants finis, prêts à l'emploi | 🔴 | C'est la raison d'écarter le headless. Alerte, fenêtre de dialogue, indicateur de chargement, badge et bouton de fichier sont fournis et stylés. |
| Accessibilité par défaut | 🔴 | Focus piégé dans les fenêtres de dialogue, fermeture par Échap, rôles et noms accessibles, contrastes WCAG 2.2 AA. C'est la bibliothèque qui doit les assurer, pas nous. |
| Compatibilité avec la chaîne | 🔴 | Vite 8, Vitest dans jsdom, Testing Library, oxlint strict type-aware, pas de `as` (ADR 0007, ADR 0008). Tout plugin de build ou polyfill de test ajouté est un coût. |
| Compatible avec l'i18n (#58) | 🔴 | Chaque chaîne intégrée (« Close », « Loading ») doit pouvoir être remplacée par une chaîne du catalogue. |
| Poids du bundle | 🟠 | Téléphone, réseau quelconque. |
| Typage des props | 🟠 | Une variante, une taille ou une couleur hors du thème échoue au typecheck. |
| Cibles tactiles | 🟠 | Au moins 24 px (WCAG 2.5.8, AA), 44 px visés pour les actions principales. |
| Nombre de dépendances | 🟢 | Surface de mise à jour et de chaîne d'approvisionnement. |
| Identité visuelle propre | 🟢 | `pick-a-book` n'a pas de charte. Pouvoir en poser une par les tokens, sans subir l'esthétique d'un éditeur, est un plus. |
| Mode sombre | 🟢 | Tous les candidats mesurés l'offrent : le critère ne départage personne. |

## Étude des candidats

Huit bibliothèques stylées ont implémenté **le même écran modèle**, construit d'après #23 avant
sa livraison, avec les versions
d'outils du repo. Pour chacune, on a mesuré :
- le poids gzip ;
- des sondes de typage ;
- le lint strict type-aware ;
- les specs Vitest dans jsdom ;
- dans Chromium à 360 px : axe-core, le comportement de la fenêtre de dialogue, les cibles
  tactiles et les chaînes injectées.

La méthode, les mesures et l'analyse de chaque candidat sont consignées dans l'issue **#59**. Cet
ADR n'en retient que ce qui fonde la décision.

## Solution retenue

**Solution A : shadcn/ui, sur Radix et Tailwind 4**, dont le code copié vit dans
`libs/shared/ui`.

1. **Composants finis (🔴)** : alerte, fenêtre de dialogue, indicateur de chargement, badge,
   carte et bouton arrivent stylés. On ne repasse pas le style par-dessus : les retouches mesurées
   tiennent en une vingtaine de lignes sur les quelque 440 copiées. Elles portent sur
   l'accessibilité et les chaînes, pas sur l'apparence.
2. **Accessibilité (🔴)** : le comportement vient de Radix (focus piégé, Échap, rôles). Après
   retouches : 0 violation axe, cibles de 44 px partout, focus rendu au déclencheur.
3. **Compatibilité avec la chaîne (🔴)** : un seul ajout, `@tailwindcss/vite`, qui est un plugin
   Vite. L'ADR 0007 n'est donc pas rouvert. Pas de polyfill jsdom, pas de config Vitest
   particulière, aucun `as`, 0 erreur de lint strict sur le code copié. Le build ne dépend pas du
   réseau.
4. **i18n (🔴)** : aucune chaîne n'est imposée par une bibliothèque. Chaque libellé que les
   composants exigent (croix de fermeture, par exemple) est une **prop obligatoire**, si bien
   qu'un oubli fait échouer le typecheck. C'est le même garde-fou que le catalogue de #58, et c'est
   plus strict qu'une bibliothèque dont le libellé par défaut retombe en silence sur l'anglais.
5. **Poids (🟠)** : +31,5 ko gzip, le plus léger des candidats mesurés.

**Alternative de repli : MUI 9.** Elle gagne sur un seul point, l'absence de code tiers à
maintenir. Ce coût a sa condition de bascule, plus bas.

### Trois points tranchés

**Le code copié et le TDD.** Aucune exemption à la convention : le code copié entre par un cycle
rouge/vert comme le reste.
- **Rouge** : avant de copier un composant, on écrit sa spec, qui fixe **notre contrat**. Elle
  vérifie le rôle, le nom accessible, les libellés obligatoires, la taille tactile, le clavier
  (Échap, retour du focus) et les variantes utilisées. Elle échoue, puisque le composant
  n'existe pas.
- **Vert** : on copie le composant par le CLI, puis on fait les retouches minimales qui font
  passer la spec (tailles, labels, tokens).
- **Refactor**, puis toute modification ultérieure : TDD habituel.

Ces specs portent sur notre contrat, pas sur l'implémentation de Radix. Ce sont elles qui
détectent une régression quand on reprend une nouvelle version d'un composant.

**Tailwind et les CSS Modules.** Tailwind devient la **seule** façon d'écrire le style dans
`apps/web` et `libs/shared/ui`, au lieu de s'ajouter à côté des CSS Modules : deux façons de faire,
c'est deux choses à connaître pour un seul mainteneur. `app.module.css` et
`photo-upload-screen.module.css` migrent quand `shared/ui` arrive, et aucun nouveau `*.module.css`
ne s'écrit. Les couleurs, rayons et espacements sont les variables CSS du thème (`--primary`,
`--destructive`, `--radius`…), déclarées une fois dans la feuille globale de `shared/ui`. Aucune
couleur en dur dans une classe arbitraire (`bg-[#…]`) : c'est à la revue d'y veiller, comme pour les
textes laissés à la revue par l'ADR d'i18n.

**`shadcn/tailwind.css` et le CLI.** La feuille est copiée dans `libs/shared/ui`, comme le reste
du code. Le paquet `shadcn` n'est **jamais une dépendance** du workspace. Le CLI s'utilise
ponctuellement, par `yarn dlx shadcn@<version exacte> add <composant>`, épinglé à l'exact comme le
reste de l'outillage, pour ajouter un composant ou comparer avec une nouvelle version. Le build et
la CI n'en dépendent pas, ce qui épargne 306 paquets.

### Retouches à l'import

Le code copié est le nôtre : chaque composant est mis aux normes du dépôt en entrant. Les retouches
suivantes ont été appliquées et mesurées sur l'écran modèle du banc (détail dans #59) :

- **Boutons à `h-11` (44 px)** au lieu de `h-9`, et boutons-icônes à `size-11`.
- **`Spinner` en `aria-hidden`** : c'est l'`<output>` qui l'entoure qui porte le texte. Plus de
  `role="status"` ni d'`aria-label="Loading"` en dur.
- **Croix de fermeture de `DialogContent`** : 44 px, et nom accessible fourni par une prop
  `closeLabel: string` **obligatoire**, à la place du « Close » en dur.
- **Token `--destructive` assombri**, plus les autres tokens corrigés par la note
  [`docs/decisions/0002`](../decisions/0002-grandes-lignes-du-design-system.md).
- **Fenêtres ouvertes par `DialogTrigger`** et fermées par `DialogClose`, pour que Radix rende le
  focus au déclencheur.
- **`shadcn/tailwind.css` (MIT) copié**, sans installer le paquet `shadcn`.

**Résultat** : 0 violation axe, cibles de 44 px, focus rendu, aucune chaîne anglaise, 0 erreur de
lint strict sur le code copié, 98 paquets, +24,5 ko de JS et +7,0 ko de CSS gzip.

### Organisation

- **`libs/shared/ui`**, avec les tags `type:shared`, `context:none` et `scope:web`, contient :
  - `components.json`, la config du CLI, avec ses alias pointant dans la lib ;
  - `src/components/` : les composants copiés et retouchés, et ceux du dépôt qui complètent le
    design system (tout composant d'interface qui ne dépend d'aucune slice), chacun accompagné
    de sa spec ;
  - `src/lib/cn.ts` : `cn()`, le `lib/utils.ts` de shadcn/ui renommé (le dépôt n'a pas de module
    « utils ») ;
  - `src/styles/globals.css` : `@import "tailwindcss"`, `tw-animate-css`, la copie de
    `shadcn/tailwind.css` et les tokens du thème, en mode clair et en mode sombre ;
  - un `README.md` qui tient, pour chaque composant, la version du registre d'où il vient et la
    liste de nos retouches. C'est ce qui permet une mise à jour à la main sans rien perdre.
- **`apps/web`** ajoute `@tailwindcss/vite` à son `vite.config.mts`, importe la feuille globale de
  `shared/ui`, et déclare `@source` sur les sources de `libs/shared/ui`. Sans ce `@source`,
  Tailwind ne génère pas les classes utilisées dans la lib.
- **Les slices** importent les composants depuis la lib partagée. Elles écrivent leur mise en page
  en classes Tailwind.
- **Seule `libs/shared/ui` importe `radix-ui`** (et `@radix-ui/*`). La règle passe par le graphe
  Nx, comme les autres frontières : `bannedExternalImports: ['radix-ui', '@radix-ui/*']` sur la
  contrainte `type:app` de `@nx/enforce-module-boundaries` (`eslint.config.mjs`). On vérifie
  qu'elle opère comme les autres garde-fous : un import direct de `radix-ui` depuis `apps/web`
  doit faire échouer `yarn lint`.
- **`.oxlintrc.json`** reste inchangé. `import/no-unassigned-import` ne se déclenche pas : la
  feuille est importée depuis `index.html` et par des `@import` CSS, jamais depuis un fichier
  TypeScript. L'exception `allow: ['**/*.css']`, mesurée sur le banc, ne sert que si un composant
  importe un jour sa feuille en TypeScript.
- **`.oxfmtrc.json`** : `sortTailwindcss` est activé, avec `stylesheet` pointant sur la feuille
  globale de `shared/ui` et `functions: ['cn', 'cva']`. oxfmt 0.63 trie alors les classes avec
  l'algorithme de `prettier-plugin-tailwindcss` (vérifié : `p-4 flex text-red-500 mx-auto`
  devient `mx-auto flex p-4 text-red-500`). Un ordre non trié fait échouer `yarn format:check`,
  donc la CI. On n'ajoute pas d'outil : c'est le formateur déjà en place (ADR 0008).
- **Dépendances** : à l'exécution, `radix-ui`, `class-variance-authority`, `clsx`,
  `tailwind-merge` et `lucide-react` ; au build, `tailwindcss`, `@tailwindcss/vite` et
  `tw-animate-css`. Elles se déclarent dans le `package.json` de la lib qui les importe
  (`@nx/dependency-checks`).

### Conditions de bascule

- **Plus de 20 composants copiés**, ou **plus de deux correctifs** d'accessibilité ou de sécurité
  à reporter à la main depuis le registre sur un semestre : la maintenance du code copié dépasse
  ce qu'un seul mainteneur absorbe, et on bascule vers **MUI**. Les specs de contrat de
  `shared/ui` servent alors de filet de migration, et seule la lib change.
- **Radix cesse d'être maintenu** : shadcn/ui publie aussi ses composants sur Base UI. On reprend
  les composants depuis ce registre, sans changer d'ADR, et les specs de contrat valident le
  remplacement.
- **Une version majeure de Tailwind** qui casse la syntaxe de la feuille globale ou du code
  copié : on la mesure avant d'y passer. Rester sur la version en cours est une option tant
  qu'elle est maintenue.
- **React Spectrum 2 permet d'héberger sa police nous-mêmes**, et la licence le permet : il
  redevient candidat, puisqu'il gagne sur l'accessibilité et l'i18n sans retouche.

### Conséquences

- **Nous possédons ce code.** Chaque composant ajouté coûte une spec, une copie, des retouches et
  une ligne de `README`. C'est le prix accepté, et c'est la première condition de bascule.
- **oxfmt reformate le code copié** : guillemets simples, points-virgules, largeur de 100. La
  comparaison avec le registre se fait donc sur le fond et non ligne à ligne, d'où le `README` des
  retouches.
- **Retouches systématiques à l'import** : taille tactile de 44 px, libellés en props obligatoires
  (aucune chaîne en dur), `Spinner` décoratif, contraste des tokens vérifié. Les specs de contrat
  les rendent vérifiables, et un test axe sur l'écran de `photo-upload` empêche la régression.
- **Fenêtres de dialogue par `DialogTrigger`** : c'est ce qui permet à Radix de rendre le focus au
  déclencheur. Une fenêtre pilotée uniquement par état doit gérer `onCloseAutoFocus` elle-même.
- **Nouvelle règle de frontière et nouvelle façon d'écrire le style**, à reporter dans `CLAUDE.md` ›
  Architecture et Conventions, et dans la constitution (`/speckit-constitution`), à l'acceptation
  de cet ADR : « Radix ne s'importe que depuis `shared/ui` » ; « le style s'écrit en classes
  Tailwind sur les tokens du thème, pas de nouveau CSS Module ».
- **La slice `photo-upload` est à migrer**, et c'est le premier chantier de `shared/ui`. Ses
  éléments natifs deviennent des composants de la lib (`Button`, `Alert`, `Spinner`), son CSS
  Module devient des classes Tailwind, et ses couleurs écrites en dur deviennent des tokens. Ses
  specs existantes, qui interrogent par rôle et par texte, servent de filet : elles doivent
  passer sans changement de comportement. Le choix du fichier sans `capture` est conservé.

## Question ouverte

- **Ordre avec l'i18n (#58)** : les deux chantiers migrent la même slice, `photo-upload`. On peut
  les mener en une seule passe, composant par composant (`shared/ui` et `t()` ensemble), ou l'un
  après l'autre. Dans les deux cas, les props de libellé des composants de `shared/ui` reçoivent
  les messages du catalogue, sans chaîne par défaut.
- ~~**Identité visuelle**~~ : tranchée dans la note de niveau inférieur
  [`docs/decisions/0002`](../decisions/0002-grandes-lignes-du-design-system.md). Elle retient la
  palette neutre corrigée pour AA, Literata pour les titres de livres, et un mode sombre qui suit
  le système. La note se révise sans nouvel ADR.
