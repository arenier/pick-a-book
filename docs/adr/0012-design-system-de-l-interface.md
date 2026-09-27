# ADR 0012 — Design system de l'interface : MUI, encapsulé dans `libs/shared/ui`

Statut : proposé · Date : 2026-09-27 · Phase 1 · Couplé aux ADR [0002](0002-ddd-et-architecture-hexagonale.md) (feature-slice), [0007](0007-vite-et-vitest-outillage-unique.md) (outillage), [0008](0008-lint-et-format-oxlint-oxfmt.md) (lint) et à l'ADR d'internationalisation de l'interface (#58)

## Contexte

`apps/web` n'a aucun design system : `styles.css` fixe une pile de polices `system-ui`,
`app.module.css` une largeur maximale et un gris `#6b6b6b` écrit en dur. La première feature
(#23, `specs/001-photo-upload`) apporte les premiers composants : sélection ou capture d'une photo,
aperçu, bouton d'envoi, états d'attente et d'erreur, liste des livres détectés avec leur confiance,
fenêtre de détail. Le cadrage est dans l'issue #59. Plusieurs points y sont déjà fixés et ne sont
pas rediscutés ici :

- on **adopte** un design system publié et maintenu, on n'en conçoit pas un. Notre travail se
  limite à le thémer et à l'encapsuler ;
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

## Solutions proposées

**A — MUI (Material UI) 9, avec Emotion.**
- Pour : typage le plus strict des bibliothèques installées (5 sondes sur 5). Rien à ajouter à la
  chaîne : ni plugin, ni polyfill. Chaînes intégrées remplaçables par prop ou par thème, avec des
  packs `frFR` et `enUS` fournis. Fenêtre de dialogue correcte (focus, Échap, retour du focus).
  Bibliothèque la plus répandue du lot, mise à jour par npm.
- Contre : +54 ko gzip, c'est le double de shadcn/ui. Styles calculés au runtime par Emotion. Le
  style idiomatique (`sx` inline) heurte `react-perf/jsx-no-new-object-as-prop`. Palette par défaut
  imparfaite : chip `warning` à 3,11:1. Boutons à 37 px et croix d'alerte à 30 px. Esthétique
  Material marquée.

**B — shadcn/ui : composants copiés dans le dépôt, sur Radix et Tailwind 4.**
- Pour : le plus léger (+30 ko). Typage parfait (5 sur 5). Code copié propre : 1 erreur de lint
  strict en 439 lignes, aucun `as`. Le code est à nous, donc chaque chaîne l'est aussi. Pas de
  CSS-in-JS au runtime.
- Contre : **le code copié devient notre code de production.** Or la convention exige que tout
  code de production soit motivé par un test écrit d'abord ; 439 lignes arrivent sans test, et
  chaque composant ajouté en apporte d'autres. Mises à jour à la main, en recopiant. Le CLI dépend
  du réseau. Tailwind entre dans la chaîne, avec un plugin Vite et une seconde façon d'écrire le
  style à côté des CSS Modules. Le paquet `shadcn` tire 300 paquets de plus pour une seule feuille
  CSS. Les chaînes en dur sont à reprendre avant #58.

**C — React Spectrum 2 (Adobe).**
- Pour : meilleure accessibilité mesurée (0 violation axe, fenêtre de dialogue irréprochable).
  **Chaînes intégrées déjà traduites** en français et en anglais selon la locale. Typage à 5 sur 5.
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

**Solution A : MUI 9 avec Emotion**, encapsulé dans `libs/shared/ui`.

1. **Composants finis (🔴)** : alerte refermable, fenêtre de dialogue, indicateur de
   progression, chip et bouton porteur d'un `<input type="file">` sont livrés stylés et utilisables
   tels quels. Il n'y a ni code à copier ni composant à repasser par-dessus.
2. **Compatibilité avec la chaîne (🔴)** : rien n'est ajouté. Pas de plugin Vite, pas de Tailwind,
   pas de polyfill jsdom, pas de config Vitest particulière, pas d'accès réseau au build ni au
   runtime. Les deux specs passent sans aménagement, et le typecheck sans `as`.
3. **i18n (🔴)** : les chaînes intégrées se remplacent par prop et, globalement, par le thème.
   Le pack `frFR` fournit déjà `closeText: 'Fermer'` pour `Alert`, ainsi que les textes de
   Pagination, Autocomplete, Rating et Breadcrumbs. Les textes de #58 s'y branchent par le thème,
   sans toucher chaque appel.
4. **Accessibilité (🔴)** : la fenêtre de dialogue piège le focus, se ferme par Échap et rend le
   focus au déclencheur. Les deux violations relevées se corrigent dans `shared/ui` : le nom de la
   barre de progression devient une prop obligatoire du wrapper, et la couleur `warning` s'ajuste
   dans le thème.
5. **Typage (🟠)** : 5 sondes sur 5, seul avec shadcn/ui et Spectrum. Une variante, une taille ou
   une couleur hors du thème échoue au typecheck.

shadcn/ui gagne sur le poids (🟠), de 24 ko. Mais il le paie par du code de production non testé,
qui contredit la convention TDD, et par des mises à jour à la main : c'est précisément le travail
de maintenance qu'exclut le refus du headless. React Spectrum 2 gagne sur l'accessibilité et
l'i18n, mais fait dépendre chaque affichage d'un CDN tiers.

### Organisation

- **`libs/shared/ui`**, avec les tags `type:shared`, `context:none` et `scope:web`, porte le thème
  (palette, typographie, formes, `components.*.defaultProps`) et des **wrappers fins**, un par
  composant utilisé, qui fixent nos règles : nom accessible obligatoire sur l'indicateur de
  progression et la croix de fermeture, taille tactile minimale, variantes restreintes à celles
  que nous utilisons.
- **Seule `libs/shared/ui` importe `@mui/*` et `@emotion/*`.** Les slices, qui sont des dossiers
  de `apps/web` (`specs/001-photo-upload/research.md` §1), importent la lib partagée. La règle
  passe par le graphe Nx, comme les autres frontières : `bannedExternalImports: ['@mui/*',
  '@emotion/*']` sur la contrainte `type:app` de `@nx/enforce-module-boundaries`
  (`eslint.config.mjs`). On vérifie qu'elle opère comme les autres garde-fous : un import direct de
  `@mui/material` depuis `apps/web` doit faire échouer `yarn lint`.
- **Le style passe par le thème**, puis par `styled()` ou par des constantes `sx` hors du rendu,
  jamais par un objet `sx` inline : `react-perf/jsx-no-new-object-as-prop` reste active.
- **Les CSS Modules restent** pour la mise en page propre à une slice. Leurs couleurs et
  espacements viennent des variables CSS du thème MUI (`cssVariables: true`), jamais d'une valeur
  en dur.

### Conditions de bascule

- **Le JS gzip de `apps/web` dépasse 200 ko**, ou le premier affichage sur un téléphone d'entrée
  de gamme en 4G dépasse 3 s (mesure à instrumenter quand #23 sera déployée) : on essaie d'abord
  la variante sans Emotion au runtime (`@mui/material-pigment-css`, non mesurée ici), puis on
  bascule vers shadcn/ui. Grâce à l'encapsulation, seule `libs/shared/ui` change.
- **La convention TDD accepte du code vendu non testé** (un dossier `vendor/` exempté, par
  exemple) : l'argument principal contre shadcn/ui tombe, et la question se rouvre sur le poids.
- **React Spectrum 2 permet d'héberger sa police nous-mêmes**, et la licence le permet : il redevient
  candidat, puisqu'il gagne sur l'accessibilité et l'i18n.
- **MUI cesse d'être maintenu pour la version de React en cours** plus de six mois après sa
  sortie : on bascule, par le même chemin que pour le poids.

### Conséquences

- **Emotion au runtime.** Les styles se calculent au rendu. C'est acceptable pour quelques écrans ;
  c'est aussi la première piste si le poids ou la fluidité deviennent un problème.
- **Une nouvelle règle de frontière** : l'interdiction d'importer MUI hors de `shared/ui`. Elle
  s'ajoute à `CLAUDE.md` › Architecture et à la constitution (`/speckit-constitution`), à
  l'acceptation de cet ADR. Elle ne couvre que `type:app`. Si une autre lib `scope:web` (autre que
  `shared/ui`) voulait importer MUI, il faudrait l'étendre par un tag dédié. Aucune n'est prévue.
- **`import/no-unassigned-import`** n'est pas touchée : MUI ne demande aucun import de feuille
  CSS.
- **Les wrappers de `shared/ui` s'écrivent en TDD**, comme le reste. Leurs specs vérifient les
  noms accessibles et les tailles, pas le rendu de MUI.
- **Cibles tactiles à relever dans le thème** : les boutons font 37 px par défaut et la croix
  d'alerte 30 px. Le thème fixe une hauteur minimale de 44 px pour les actions principales et au
  moins 24 px partout.
- **La palette par défaut n'est pas acceptée telle quelle** : `warning` (3,11:1) est ajustée dans le
  thème. Un test axe sur l'écran de #23 empêche la régression.
- **Esthétique Material** : c'est le prix accepté. L'identité visuelle propre à `pick-a-book`
  passe par le thème, pas par la réécriture des composants.

## Question ouverte

- **Pigment CSS** (MUI sans Emotion au runtime) : non mesuré. On le mesure si la première condition
  de bascule approche.
- **Ordre avec #23 et #58** : si #23 passe avant #58, ses textes s'écrivent en attendant dans un
  module unique par slice, pour que la migration vers le catalogue reste mécanique. Le thème
  branche les chaînes intégrées de MUI sur la locale active dès que #58 existe.
- **Identité visuelle** (palette, typographie) : c'est un choix de produit, pas d'architecture. Il
  se règle dans le thème et se documente dans `libs/shared/ui`.
