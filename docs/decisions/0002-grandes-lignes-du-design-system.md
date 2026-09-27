# Décision — grandes lignes du design system

> **Niveau inférieur, pas un ADR.** L'ADR [0012](../adr/0012-design-system-de-l-interface.md)
> tranche le *quoi* : shadcn/ui sur Radix et Tailwind 4, dans `libs/shared/ui`. Il renvoie
> l'identité visuelle à un choix de produit. Cette note est ce choix : elle fixe les tokens, la
> typographie, le mode sombre et les règles d'usage. Elle se révise sans nouvel ADR.

## Statut

**Décidé le 2026-09-27.** Les trois choix de produit viennent de l'auteur :

- **palette neutre de shadcn/ui**, sans couleur d'accent pour l'instant ;
- **serif pour les titres de livres**, police système pour l'interface ;
- **mode sombre dès le MVP**, qui suit le réglage du système.

Le reste en découle : c'est le contexte d'usage et WCAG 2.2 AA qui le fixent. Chaque valeur de
cette note a été **mesurée** sur l'écran modèle du banc de l'ADR 0012, construit d'après #23 et
décrit dans l'issue #59 : Chromium en 360 × 740, axe-core 4.11, en clair et en sombre. Résultat : **0 violation dans
les deux thèmes**, écran et fenêtre de dialogue ouverte.

## Le contexte qui dicte les règles

L'interface se consulte **au téléphone, debout, souvent d'une main**, dans une ressourcerie où la
lumière va du néon au coin sombre, entre deux rayonnages. On y fait une chose : photographier une
étagère, puis parcourir vite une liste de livres pour décider lesquels prendre. D'où cinq
principes, qui tranchent les cas que cette note ne prévoit pas :

1. **Lisible d'un coup d'œil.** Le titre du livre prime sur tout le reste de l'écran.
2. **Atteignable au pouce.** Cibles de 44 px, et actions principales en pleine largeur.
3. **Jamais la couleur seule.** Toute information portée par une couleur l'est aussi par un texte.
4. **Sobre.** Le neutre laisse la place aux titres et aux trois couleurs de confiance, qui sont
   les seules couleurs de l'écran.
5. **Rien depuis le réseau hors de l'API.** Pas de police ni d'icône chargées depuis un CDN.

## Couleurs

Ce sont les tokens neutres de shadcn/ui, **corrigés là où ils échouent** à WCAG 2.2 AA. Les
valeurs sont en `oklch`, déclarées une fois dans la feuille globale de `libs/shared/ui`.

| Token | Clair | Sombre | Pourquoi |
|---|---|---|---|
| `--muted-foreground` | **0.52** (au lieu de 0.556) | 0.708, inchangé | 4,34:1 sur `--muted` en clair : échec AA. Corrigé à 5,05:1. |
| `--ring` | **0.6** (au lieu de 0.708) | 0.556, inchangé | Anneau de focus à 2,59:1 en clair : échec de 1.4.11 (3:1). Corrigé à 3,95:1. |
| `--input` | **0.64** (au lieu de 0.922) | **0.52** (au lieu de blanc à 15 %) | Bordure de champ à 1,26:1 en clair et 1,47:1 en sombre : champ invisible. Corrigé à 3,36:1 et 3,59:1. |
| `--destructive` | **0.5 0.22 27.3** (au lieu de 0.577) | inchangé | 4,49:1 mesuré par axe sur le texte d'alerte. Corrigé à 6,39:1. |
| `--border` | inchangé | inchangé | Décoratif (cartes). Aucun sens ne repose sur lui. |

Tous les autres tokens sont conservés. Le texte principal atteint 19,8:1 en clair et 19,0:1 en
sombre.

**Pas de couleur d'accent pour le MVP.** `--primary` reste quasi noir en clair et quasi blanc en
sombre. Quand un accent sera choisi, il ira dans `--primary` et nulle part ailleurs, à condition
de tenir 4,5:1 avec `--primary-foreground` dans les deux thèmes.

### Couleurs de confiance

Ce sont les seules couleurs fonctionnelles ajoutées. Elles servent au badge de confiance de chaque
livre détecté (ADR 0005). Chaque niveau a un texte et un fond doux.

| Niveau | Clair : texte / fond | Sombre : texte / fond | Contraste clair / sombre |
|---|---|---|---|
| `--confidence-high` | `0.42 0.11 150` / `0.96 0.04 150` | `0.85 0.12 150` / `0.3 0.06 150` | 7,3:1 / 8,8:1 |
| `--confidence-medium` | `0.46 0.095 65` / `0.965 0.035 85` | `0.87 0.12 85` / `0.32 0.06 80` | 6,6:1 / 8,6:1 |
| `--confidence-low` | `0.5 0.17 27` / `0.965 0.015 25` | `0.82 0.1 25` / `0.3 0.08 25` | 5,9:1 / 7,8:1 |

Toutes les valeurs sont dans le gamut sRGB, vérifié par calcul : un téléphone sans écran large
gamut les rend telles quelles. Tailwind les expose en utilitaires (`bg-confidence-high-soft`,
`text-confidence-high`) par `@theme inline`.

**Le niveau de confiance s'écrit toujours en toutes lettres** (« Confiance élevée »). La couleur
redouble le texte, elle ne le remplace jamais (principe 3).

**Ces tokens attendent la spec qui affichera la confiance.** Aujourd'hui, `photo-upload` reçoit la
confiance de l'API sans l'afficher (`specs/001-photo-upload/data-model.md`). Les tokens sont
déclarés et vérifiés dès maintenant, pour qu'une spec qui les utilisera n'ait pas à rouvrir la
palette.

## Typographie

- **Interface : la police système** (`system-ui`), c'est-à-dire San Francisco sur iOS et Roboto
  sur Android. Elle ne pèse rien et ne fait aucune requête.
- **Titres de livres : Literata 600**, et rien d'autre en serif. Literata a été dessinée pour la
  lecture de livres sur écran (Google Play Books). Elle est sous licence OFL, auto-hébergée par
  `@fontsource/literata` : Vite l'embarque dans le build, sans CDN. On n'utilise qu'une graisse,
  la 600, dans une utilité Tailwind `font-book` (`"Literata", ui-serif, Georgia, serif`).
- **Poids mesuré** : 21,9 ko de woff2 pour le jeu latin, accents français et « œ » compris. Le jeu
  latin étendu (18,3 ko) est déclaré avec son `unicode-range` : il ne se télécharge que si un
  titre contient, par exemple, un « ł » ou un « ș ».
- **`font-display: swap`** (réglage par défaut de Fontsource) : le titre s'affiche d'abord dans la
  serif du système, puis Literata la remplace. Aucun texte n'est invisible pendant le chargement.
- **Tailles** :
  - 16 px pour le texte courant ;
  - **jamais moins de 14 px** (`text-sm`) pour un texte qu'on doit lire. Le `Badge` de shadcn/ui,
    à 12 px, passe à `text-sm` à l'import ;
  - les champs de saisie gardent 16 px sur mobile (`text-base`), sans quoi Safari iOS zoome à la
    mise au point.

## Mode sombre

- **L'interface suit `prefers-color-scheme`, sans JavaScript.** La ligne
  `@custom-variant dark (&:is(.dark *))` de shadcn/ui est **supprimée** : la variante `dark:`
  retrouve alors son comportement par défaut dans Tailwind 4, fondé sur la media query. Les tokens
  sombres se déclarent dans `@media (prefers-color-scheme: dark) { :root { … } }`. Il n'y a ni
  classe `.dark` à poser, ni flash au chargement, ni préférence à stocker.
- **Pas de sélecteur manuel dans le MVP.** Il reviendrait à rétablir une classe et un stockage :
  c'est à rouvrir si un besoin apparaît.
- **Chaque vérification de contraste se fait dans les deux thèmes** : les specs axe de `shared/ui`
  et de `photo-upload` tournent en `colorScheme: 'light'` puis `'dark'`.

## Forme, espace, mouvement

- **Espacements** : l'échelle de Tailwind (pas de 4 px), sans valeurs arbitraires (`p-[13px]`).
  Gouttière latérale de 16 px (`px-4`) à 360 px.
- **Rayon** : `--radius` à 0,625 rem, la valeur par défaut de shadcn/ui, dont découlent tous les
  arrondis.
- **Cibles tactiles** : **44 px au minimum** pour tout élément interactif (`h-11`, `size-11`),
  mesurées sur l'écran modèle. Les actions principales de l'écran (choisir la photo, analyser)
  prennent toute la largeur, comme dans la slice `photo-upload`.
- **Une seule action primaire par écran** (variante `default`). Les autres sont en `outline` ou
  `ghost`.
- **Icônes** : `lucide-react`, déjà dépendance de shadcn/ui, en 16 ou 20 px. Une icône est
  **décorative** (`aria-hidden="true"`), sauf si elle est seule dans un bouton : le bouton porte
  alors un nom accessible, passé en prop obligatoire.
- **Mouvement** : les animations de `tw-animate-css` restent courtes (ouverture et fermeture des
  fenêtres). Tout composant animé reçoit `motion-reduce:animate-none`.

## États de l'interface

Chaque attente, chaque absence de résultat et chaque échec a sa forme, pour que `photo-upload` et les
features suivantes ne la réinventent pas :

| État | Forme |
|---|---|
| Chargement | `Spinner` décoratif et texte dans un `<output>` (« Analyse en cours… »). Jamais un spinner seul. |
| Vide | Un texte qui dit ce qui s'est passé et ce qu'on peut faire (« Aucun livre détecté. Reprenez la photo de plus près. »). |
| Erreur | `Alert` en variante `destructive`, avec un titre, une explication et une action (« Réessayer »). La croix de fermeture a un nom accessible obligatoire. |
| Succès | Pas de bannière : le résultat affiché suffit. |

Les textes restent en français et passent par le catalogue de leur slice dès que l'ADR
d'internationalisation (#58) est en place.

## Ce que cette note ne fixe pas

- **La couleur d'accent**, choisie plus tard, dans les conditions de la section *Couleurs*.
- **Un logo ou une marque** : il n'y en a pas pour l'instant.
- **La présentation détaillée des résultats de `photo-upload`** (ordre, filtrage des détections faibles) :
  c'est du comportement, qui relève de `specs/001-photo-upload`.
