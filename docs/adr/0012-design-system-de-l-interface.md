# ADR 0012 — Design system de l'interface : shadcn/ui et Tailwind, dans `libs/shared/ui`

Statut : proposé · Date : 2026-09-27 · Phase 1 · Couplé aux ADR [0002](0002-ddd-et-architecture-hexagonale.md) (feature-slice), [0007](0007-vite-et-vitest-outillage-unique.md) (outillage), [0008](0008-lint-et-format-oxlint-oxfmt.md) (lint) et à l'ADR d'internationalisation de l'interface (#58)

## Contexte

`apps/web` n'a aucun design system : `styles.css` fixe une pile de polices `system-ui`,
`app.module.css` une largeur maximale et un gris `#6b6b6b` écrit en dur. La première feature
(#23, `specs/001-photo-upload`) apporte les premiers composants : sélection ou capture d'une photo,
aperçu, bouton d'envoi, états d'attente et d'erreur, liste des livres détectés avec leur confiance,
fenêtre de détail. Le cadrage est dans l'issue #59. Plusieurs points y sont déjà fixés et ne sont
pas rediscutés ici :

- on **adopte** un design system publié et maintenu, on n'en conçoit pas un. Notre travail se
  limite à le thémer, à l'encapsuler et, pour un système copié, à le mettre aux normes du dépôt ;
- les **bibliothèques headless** (React Aria Components, Radix Primitives, Base UI, Ark UI) sont
  **écartées** : elles apportent le comportement et l'accessibilité mais aucun style, et tout
  repasser par-dessus coûte trop cher pour un seul mainteneur ;
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
| Mode sombre | 🟢 | Tous les candidats l'offrent, le critère ne départage personne. |

## Mesurer avant de choisir

Même méthode que pour l'[ADR 0008](0008-lint-et-format-oxlint-oxfmt.md) et l'ADR
d'internationalisation : les candidats ne sont pas jugés sur leur documentation. Chacun implémente
**le même écran**, dans un bac à sable hors du repo, avec les versions du repo : React 19.2.8,
Vite 8.1.5, `@vitejs/plugin-react` 6.0.4, TypeScript 6.0.3, Vitest 4.1.10, jsdom 27.4.0, Testing
Library 16.3, oxlint 1.78 avec `oxlint-tsgolint`.

L'écran est celui de #23 : titre ; bouton de capture (`accept="image/*"`,
`capture="environment"`) ; aperçu ; bouton d'analyse ; indicateur « Analyse en cours… » ; alerte
d'erreur refermable ; liste de trois livres, chacun avec son titre, son auteur, un badge de
confiance et un bouton « Détails » ; fenêtre de détail avec un bouton « Fermer ». Une **version de
référence** en HTML natif et CSS Modules sert d'étalon. Elle passe le lint strict avec 0 erreur,
et chaque candidat reprend sa structure (composants courts, gestionnaires en `useCallback`), si
bien que ce que le lint relève ensuite est imputable à la bibliothèque.

Mesures relevées pour chaque candidat :

- **poids** : JS et CSS de production, gzip -9, en écart à la référence (60,3 ko de JS, presque
  entièrement React) ;
- **dépendances** : paquets installés par la bibliothèque, React étant fourni à part ;
- **typage** : cinq sondes, chacune étant une erreur introduite délibérément dont on relève si
  `tsc` la détecte ;
- **lint** : la config `.oxlintrc.json` du repo, `--type-aware`, sur le code de l'écran (et sur le
  code copié quand il y en a) ;
- **tests** : deux specs Vitest et Testing Library, identiques pour tous : la liste s'affiche ; la
  fenêtre s'ouvre, puis se ferme par notre bouton ;
- **navigateur** : Chromium en 360 × 740, mode mobile tactile. On relève le débordement
  horizontal, la plus petite cible tactile, les violations axe-core 4.11 (règles WCAG 2.0 à
  2.2 A et AA) sur l'écran et fenêtre ouverte, le focus à l'ouverture de la fenêtre, la fermeture
  par Échap et le retour du focus, ainsi que les chaînes injectées par la bibliothèque et non par
  nous.

### Poids et dépendances

| Candidat | Version | JS gzip | CSS gzip | Total | Paquets |
|---|---|---|---|---|---|
| shadcn/ui (Radix + Tailwind 4) | sources du 2026-09-27 | +24,5 ko | +5,2 ko | **+29,7 ko** | 98 ¹ |
| MUI (Material UI) + Emotion | 9.4.0 | +54,4 ko | 0 ² | **+53,9 ko** | 80 |
| Konsta UI (Tailwind 4) | 5.4.0 | +42,3 ko | +13,7 ko | +56,0 ko | 21 |
| React Spectrum 2 | 1.7.1 | +57,5 ko | +7,2 ko | +64,7 ko | 15 |
| Mantine | 9.6.3 | +32,1 ko | +33,3 ko ³ | +65,4 ko | 20 |
| Chakra UI | 3.37.0 | +88,7 ko | 0 ² | +88,2 ko | 152 |
| Ant Design | 6.6.5 | +148,4 ko | 0 ² | +147,9 ko | 67 |
| Ionic React | 9.0.5 | +234,8 ko | +2,9 ko | +237,7 ko | 33 |

1. 98 paquets pour les dépendances du code copié (`radix-ui`, `class-variance-authority`, `clsx`,
   `tailwind-merge`, `lucide-react`) et pour Tailwind et son plugin Vite. Le thème par défaut
   importe aussi `shadcn/tailwind.css`, ce qui oblige à installer le paquet `shadcn`, qui est le CLI :
   on monte alors à **404 paquets**.
2. Styles injectés au runtime par du CSS-in-JS (Emotion pour MUI et Chakra, `@ant-design/cssinjs`
   pour Ant Design). Le CSS de la référence disparaît, d'où le léger négatif.
3. Mantine importe ici sa feuille globale `styles.css`. L'import composant par composant la
   réduirait, mais n'a pas été mesuré.

### Typage

✅ : `tsc` échoue sur l'erreur introduite. ❌ : l'erreur passe.

| Sonde | shadcn/ui | MUI | React Spectrum 2 | Chakra | Ant Design | Konsta | Ionic | Mantine |
|---|---|---|---|---|---|---|---|---|
| Variante inconnue (`variant="nope"`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Prop inconnue (`colour="red"`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gestionnaire mal typé (`(n: number) => n`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Couleur hors du thème | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Taille inconnue (`size="huge"`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

Aucun candidat n'a demandé de `as` pour que l'écran passe le typecheck. Chez Mantine, `variant`,
`size` et `color` acceptent n'importe quelle chaîne. Chez MUI, les props système supprimées en v9
(`fontWeight` posé directement sur `Typography`) font échouer le typecheck : il faut passer par
`sx`.

### Lint, tests, navigateur

| Candidat | Lint strict, hors frictions d'usage ³ | Specs dans jsdom | axe (écran + fenêtre) | Fenêtre : focus, Échap, retour | Plus petite cible |
|---|---|---|---|---|---|
| shadcn/ui | 1 dans les 439 lignes copiées ¹ | 2/2 | 1 contraste (4,49:1) | oui, oui, **non** ² | 36 px |
| MUI | 0 | 2/2 | barre de progression sans nom ⁴, 1 contraste | oui, oui, oui | 30 px |
| React Spectrum 2 | 0 | 2/2 après config ⁵ | **0** | oui, oui, oui | 32 px |
| Chakra UI | 0 | 2/2 | **0** | oui, oui, oui | 40 px |
| Mantine | 0 | 2/2 **avec polyfill** `matchMedia` | 5 contrastes ⁶ | oui, oui, oui | **20 px** |
| Ant Design | 0 | 2/2 | 5 contrastes | oui, oui, oui | **12 × 13 px** |
| Konsta UI | 0 | **1/2** ⁷ | élément interactif imbriqué | **non, non**, oui ⁷ | 34 px |
| Ionic React | 0 | **1/2** ⁸ | barre de progression sans nom | **non**, oui, non | non mesurable ⁸ |

Aucun candidat ne déborde à 360 px : le critère ne départage personne. Aucun n'atteint 44 px par
défaut sur ses boutons, sauf Konsta en taille `large`.

1. `prefer-tag-over-role` sur `spinner.tsx`. Aucun `as` dans le code copié.
2. La fenêtre pilotée par état, sans `DialogTrigger`, ne rend pas le focus au bouton qui l'a
   ouverte.
3. Des frictions, dues à l'usage idiomatique de la bibliothèque et non à un défaut, sont
   comptées à part. Notre code les contourne quand c'est possible (constantes hors du rendu) :
   l'import de feuille CSS (`import '…/styles.css'`) déclenche
   `import/no-unassigned-import` (Mantine, Ionic, Konsta, Spectrum, shadcn/ui) ; les objets
   inline du style MUI (`sx={{ … }}`) et des props de Mantine et Ant Design déclenchent
   `react-perf/jsx-no-new-object-as-prop` ; les props qui attendent du JSX (`footer` d'Ant
   Design, `content` de Konsta) déclenchent `react-perf/jsx-no-jsx-as-prop`. Chez Konsta enfin,
   le `role="dialog"` ajouté pour compenser la bibliothèque déclenche
   `jsx-a11y/prefer-tag-over-role`.
4. `CircularProgress` porte `role="progressbar"` sans nom par défaut. C'est à nous de lui donner un
   `aria-label`.
5. Il faut `test.server.deps.inline` pour `@react-spectrum`, `react-aria` et `react-stately`, sans
   quoi Vitest refuse les `.css` importés depuis `node_modules`.
6. Texte blanc sur le bleu primaire (3,55:1) et sur les badges (1,86 à 3,28:1). `primaryShade: 8`
   corrige les boutons, pas les badges : un réglage du thème est nécessaire, il n'y a pas de
   correction automatique.
7. Le `Dialog` de Konsta n'a ni rôle `dialog`, ni piège de focus, ni fermeture par Échap. Une fois
   fermé, il reste dans le DOM, simplement masqué.
8. Des web components (Stencil, shadow DOM) : dans jsdom, `ion-button` n'expose pas de rôle
   `button`. Nos sélecteurs ne traversent pas le shadow DOM, d'où la mesure impossible des cibles.

### Chaînes intégrées

C'est ce qui s'affiche ou s'annonce sans que nous l'ayons écrit, un critère 🔴 au regard de #58.

| Candidat | Relevé | Remplaçable |
|---|---|---|
| React Spectrum 2 | « Erreur » (icône d'alerte), « Rejeter » (fermeture de fenêtre) | **Traduit d'office** selon la `locale` du `Provider`, français et anglais compris |
| MUI | `closeText="Close"` par défaut sur `Alert` | Oui : par prop, ou globalement par le thème, avec des packs `frFR` et `enUS` fournis |
| Chakra UI | `aria-label="Close"` sur `CloseButton` | Oui, par prop |
| Mantine | **Aucune chaîne**, donc boutons de fermeture **sans nom** (axe `button-name`) si on oublie `closeButtonLabel` | Oui, par prop, mais l'oubli n'est détecté ni au typecheck ni au lint |
| shadcn/ui | « Close » et « Loading » en dur dans le code copié | Oui : c'est notre code |
| Ant Design | `aria-label="close"` et `"close-circle"` sur les icônes | **Non** : les noms d'icônes sont figés, en anglais |
| Konsta, Ionic | aucune relevée sur cet écran | — |

### Quatre constats que la documentation ne donnait pas

- **Le CLI de shadcn/ui dépend du réseau.** `shadcn add` télécharge les composants depuis
  ui.shadcn.com, que le proxy de l'environnement de mesure bloque. Les sources ont été reprises
  du dépôt `shadcn-ui/ui` (registre `new-york-v4`). Les alias d'import, `utils.ts` et le thème ont
  été réécrits à la main, comme le CLI l'aurait fait. Le build, lui, ne dépend pas du réseau.
- **React Spectrum 2 charge sa police depuis Adobe Typekit au runtime** (`use.typekit.net`), depuis
  le téléphone de l'utilisateur. Hors ligne ou derrière un proxy, la police ne se charge pas et
  l'interface retombe sur une police système. La police Adobe Clean n'est pas couverte par la
  licence Apache-2.0 du code, et son usage hors produits Adobe n'a pas été vérifié. Par ailleurs, la
  prop `styles` n'accepte que la sortie de la macro `style()`, qui demande un plugin de build
  (`unplugin-parcel-macros`) : on peut s'en passer tant qu'on ne personnalise pas les composants.
- **`Dialog isDismissible` de Spectrum masque les boutons du pied de fenêtre** : la fenêtre ne garde
  que sa croix. Un « Fermer » explicite suppose de renoncer à la croix.
- **jsdom n'implémente pas `window.matchMedia`** : Mantine échoue au premier rendu sans polyfill.
  MUI, Chakra, Ant Design, shadcn/ui et Spectrum (une fois configuré) n'en demandent aucun sur cet
  écran.

### shadcn/ui retouché : ce que coûte la mise en conformité

Le code de shadcn/ui étant le nôtre, il a été repris une seconde fois, avec les retouches qu'exige
le dépôt, puis mesuré de nouveau avec les mêmes outils :

- boutons à `h-11` (44 px) au lieu de `h-9`, et boutons-icônes à `size-11` ;
- `Spinner` en `aria-hidden` : c'est l'`<output>` qui l'entoure qui porte le texte, et ni
  `role="status"` ni `aria-label="Loading"` ne sont plus en dur ;
- croix de fermeture de `DialogContent` rendue à 44 px, et nom accessible fourni par une prop
  `closeLabel: string` **obligatoire** à la place de l'`sr-only` « Close » en dur ;
- token `--destructive` assombri, de `oklch(0.577 …)` à `oklch(0.5 …)` ;
- fenêtre ouverte par `DialogTrigger` et fermée par `DialogClose`, pour que Radix rende le focus au
  déclencheur ;
- `shadcn/tailwind.css` (16 ko de CSS, licence MIT) **copié** dans le code, et le paquet `shadcn`
  désinstallé.

| Mesure | shadcn/ui tel que copié | shadcn/ui retouché |
|---|---|---|
| JS / CSS gzip ajoutés | +24,5 / +5,2 ko | +24,5 / +7,0 ko |
| Paquets installés | 404 | **98** |
| Lint strict sur le code copié | 1 | **0** |
| Sondes de typage | 5/5 | 5/5 |
| Specs dans jsdom | 2/2 | 2/2, sans polyfill |
| axe, écran et fenêtre | 1 contraste (4,49:1) | **0** |
| Plus petite cible | 36 px | **44 px** |
| Focus : piégé, Échap, rendu | oui, oui, non | **oui, oui, oui** |
| Chaînes anglaises injectées | « Loading », « Close » | **aucune** |

Il reste une seule friction de lint : l'import de la feuille CSS déclenche
`import/no-unassigned-import`. Elle se lève par l'option `allow: ['**/*.css']` de la règle, qui
continue de viser tout import non CSS (vérifié sur un import `.js` témoin). Les retouches touchent
une vingtaine de lignes sur les quelque 440 du code copié.

## Solutions proposées

**A — shadcn/ui : composants copiés dans le dépôt, sur Radix et Tailwind 4.**
- Pour : le plus léger (+31,5 ko après retouches). Typage parfait (5 sondes sur 5). Code copié
  propre, aucun `as`, 0 erreur de lint après retouches. Après une vingtaine de lignes retouchées :
  0 violation axe, cibles de 44 px, focus rendu. Le code est à nous, donc chaque chaîne l'est
  aussi, et un libellé oublié devient une **erreur de typecheck** (prop obligatoire), là où une
  bibliothèque retombe en silence sur son anglais par défaut. Pas de CSS-in-JS au runtime.
  Identité visuelle entièrement à nous, par les tokens.
- Contre : le code copié devient notre code de production, à tester et à maintenir. Les mises à
  jour se font à la main, en comparant avec le registre. Tailwind entre dans la chaîne (un plugin
  Vite) et devient la façon d'écrire le style. Le CLI dépend du réseau (ui.shadcn.com), mais
  seulement au moment d'ajouter un composant, jamais au build.

**B — MUI (Material UI) 9, avec Emotion.**
- Pour : rien à ajouter à la chaîne, ni plugin ni polyfill. 5 sondes sur 5. Chaînes intégrées
  remplaçables par prop ou par thème, avec un pack `frFR` fourni. Aucune ligne tierce dans le
  dépôt : on met à jour par `yarn up`.
- Contre : +54 ko gzip, c'est-à-dire +22 ko par rapport à A. Styles calculés au runtime par
  Emotion. Le style idiomatique (`sx` inline) heurte `react-perf/jsx-no-new-object-as-prop`.
  Palette par défaut imparfaite (chip `warning` à 3,11:1). Boutons à 37 px. Un `closeText` oublié
  s'affiche en anglais sans que rien ne le signale. Esthétique Material marquée.

**C — React Spectrum 2 (Adobe).**
- Pour : meilleure accessibilité mesurée sans retouche (0 violation axe, fenêtre de dialogue
  irréprochable). **Chaînes intégrées déjà traduites** en français et en anglais selon la locale.
  Typage à 5 sur 5.
- Contre : police chargée depuis un CDN tiers au runtime, avec une licence à vérifier. Personnaliser
  les composants demande un plugin de macros. Config Vitest particulière. Identité visuelle d'Adobe
  très marquée. 151 Mo de `node_modules`.

**D — Chakra UI 3.**
- Pour : 0 violation axe, specs vertes sans polyfill, lint propre, typage à 4 sur 5, boutons à
  40 px.
- Contre : le plus lourd des candidats viables (+88 ko) et le plus de dépendances (152 paquets),
  avec lui aussi du CSS-in-JS au runtime.

**E — Mantine 9.**
- Pour : styles statiques (CSS), aucune chaîne anglaise, peu de dépendances (20 paquets).
- Contre : typage lâche (2 sur 5) ; polyfill `matchMedia` obligatoire dans jsdom ; contrastes
  WCAG en échec par défaut ; croix de fermeture à 20 px, sous le seuil AA ; boutons de fermeture
  sans nom si on oublie leur libellé.

**F — Ant Design 6.** Écartée : c'est le plus lourd des candidats de bureau (+148 ko), ses icônes
annoncent des `aria-label` anglais impossibles à remplacer (critère 🔴 i18n), et sa croix
d'alerte mesure 12 × 13 px.

**G — Ionic React 9.** Écartée : +238 ko, et des web components que jsdom ne rend pas, ce qui fait
échouer les specs et casse le critère 🔴 de chaîne.

**H — Konsta UI 5.** Écartée : sa fenêtre de dialogue n'a ni rôle, ni piège de focus, ni fermeture
par Échap, ce qui casse le critère 🔴 d'accessibilité. C'est pourtant le seul candidat avec des
cibles de 44 px par défaut.

**I — Pico CSS ou Open Props (feuille sans classes, ou tokens seuls).** Écartée sans mesure : ni
fenêtre de dialogue ni alerte interactive. On retrouve le travail du headless.

## Solution retenue

**Solution A : shadcn/ui, sur Radix et Tailwind 4**, dont le code copié vit dans
`libs/shared/ui`.

1. **Composants finis (🔴)** : alerte, fenêtre de dialogue, indicateur de chargement, badge,
   carte et bouton arrivent stylés. On ne repasse pas le style par-dessus : les retouches mesurées
   tiennent en une vingtaine de lignes, et elles portent sur l'accessibilité et les chaînes, pas
   sur l'apparence.
2. **Accessibilité (🔴)** : le comportement vient de Radix (focus piégé, Échap, rôles). Après
   retouches : 0 violation axe, cibles de 44 px partout, focus rendu au déclencheur.
3. **Compatibilité avec la chaîne (🔴)** : un seul ajout, `@tailwindcss/vite`, qui est un plugin
   Vite. L'ADR 0007 n'est donc pas rouvert. Pas de polyfill jsdom, pas de config Vitest
   particulière, aucun `as`, 0 erreur de lint strict sur le code copié. Le build ne dépend pas du
   réseau.
4. **i18n (🔴)** : aucune chaîne n'est imposée par une bibliothèque. Chaque libellé que les
   composants exigent (croix de fermeture, par exemple) est une **prop obligatoire**, si bien
   qu'un oubli fait échouer le typecheck. C'est le même garde-fou que le catalogue de #58, et c'est
   plus strict que MUI, dont le `closeText` retombe en silence sur « Close ».
5. **Poids (🟠)** : le plus léger des candidats, +31,5 ko contre +54 ko pour MUI.

MUI reste l'alternative documentée : il gagne sur un seul point, l'absence de code tiers à
maintenir. Ce coût est chiffré plus bas, et il a une condition de bascule.

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
`apps/web` et `libs/shared/ui`, au lieu de s'ajouter à côté des CSS Modules : deux façons de
faire, c'est deux choses à connaître pour un seul mainteneur. `app.module.css` migre quand
`shared/ui` arrive, et aucun nouveau `*.module.css` ne s'écrit. Les couleurs, rayons et
espacements sont les variables CSS du thème (`--primary`, `--destructive`, `--radius`…),
déclarées une fois dans la feuille globale de `shared/ui`. Aucune couleur en dur dans une classe
arbitraire (`bg-[#…]`) : c'est à la revue d'y veiller, comme pour les textes laissés à la revue
par l'ADR d'i18n.

**`shadcn/tailwind.css` et le CLI.** La feuille est copiée dans `libs/shared/ui`, comme le reste
du code. Le paquet `shadcn` n'est **jamais une dépendance** du workspace. Le CLI s'utilise
ponctuellement, par `yarn dlx shadcn@<version exacte> add <composant>`, épinglé à l'exact comme le
reste de l'outillage, pour ajouter un composant ou comparer avec une nouvelle version. Le build et
la CI n'en dépendent pas, ce qui épargne 306 paquets.

### Organisation

- **`libs/shared/ui`**, avec les tags `type:shared`, `context:none` et `scope:web`, contient :
  - `components.json`, la config du CLI, avec ses alias pointant dans la lib ;
  - `src/components/` : les composants copiés et retouchés, chacun accompagné de sa spec ;
  - `src/lib/utils.ts` : `cn()` ;
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
- **`.oxlintrc.json`** : `import/no-unassigned-import` reçoit `allow: ['**/*.css']`. C'est la
  seule règle touchée.
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
  les rendent vérifiables, et un test axe sur l'écran de #23 empêche la régression.
- **Fenêtres de dialogue par `DialogTrigger`** : c'est ce qui permet à Radix de rendre le focus au
  déclencheur. Une fenêtre pilotée uniquement par état doit gérer `onCloseAutoFocus` elle-même.
- **Nouvelle règle de frontière et nouvelle façon d'écrire le style**, à reporter dans `CLAUDE.md` ›
  Architecture et Conventions, et dans la constitution (`/speckit-constitution`), à l'acceptation
  de cet ADR : « Radix ne s'importe que depuis `shared/ui` » ; « le style s'écrit en classes
  Tailwind sur les tokens du thème, pas de nouveau CSS Module ».
- **`specs/001-photo-upload/plan.md`** mentionne des composants en CSS Modules : il faudra
  l'ajuster quand #23 se code.

## Question ouverte

- **Ordre avec #23 et #58** : si #23 passe avant #58, ses textes s'écrivent en attendant dans un
  module unique par slice, pour que la migration vers le catalogue reste mécanique. Les props de
  libellé des composants de `shared/ui` reçoivent alors directement les messages du catalogue.
- ~~**Identité visuelle**~~ : tranchée dans la note de niveau inférieur
  [`docs/decisions/0002`](../decisions/0002-grandes-lignes-du-design-system.md). Elle retient la
  palette neutre corrigée pour AA, Literata pour les titres de livres, et un mode sombre qui suit
  le système. La note se révise sans nouvel ADR.
