# shared-ui

Le design system du front ([ADR 0012](../../../docs/adr/0012-design-system-de-l-interface.md)) :
les composants de [shadcn/ui](https://ui.shadcn.com), **copiés dans cette lib et mis aux normes du
dépôt**, les **composants écrits ici** qui les complètent, et la feuille globale qui porte Tailwind 4 et les tokens de la note
[`docs/decisions/0002`](../../../docs/decisions/0002-grandes-lignes-du-design-system.md).

Lib partagée (`type:shared`, `context:none`, `scope:web`). **C'est la seule du dépôt autorisée à
importer Radix** : une app qui importerait `radix-ui` directement fait échouer `yarn lint`
(`bannedExternalImports` sur `type:app`, `eslint.config.mjs`). Aucun composant actuel n'en a
besoin, et `radix-ui` n'est donc pas encore une dépendance : il le deviendra avec le premier
composant qui l'importe (une fenêtre de dialogue, par exemple).

## Contenu

| Chemin | Rôle |
|---|---|
| `src/components/` | Les composants, chacun avec sa spec de contrat. |
| `src/lib/cn.ts` | `cn()`, qui joint les classes et résout les conflits Tailwind. C'est le `lib/utils.ts` de shadcn/ui, renommé parce que le dépôt n'a pas de module « utils ». |
| `src/styles/globals.css` | La feuille unique, exportée en `@pick-a-book/shared-ui/styles.css` : Tailwind, `tw-animate-css`, Literata, tokens clairs et sombres. |
| `src/styles/shadcn-tailwind.css` | Copie de `shadcn/tailwind.css` (paquet `shadcn` 4.21.0, MIT). Copiée pour que le paquet `shadcn`, qui est le CLI, ne soit jamais une dépendance. |
| `components.json` | La config du CLI shadcn, pour `yarn dlx`. |

L'app importe la feuille une fois, depuis `apps/web/src/styles.css`. La feuille déclare `@source`
sur les sources de cette lib : sans cela, Tailwind ne générerait pas les classes des composants,
qui vivent hors de l'app.

## Composants copiés de shadcn/ui, et leurs retouches

Les sources viennent du registre `new-york-v4` du dépôt `shadcn-ui/ui`, relevées le 2026-09-27.
Chaque retouche est motivée par une clause de la spec du composant, qui échouait sur le code copié
tel quel.

| Composant | Retouches |
|---|---|
| `Button` | `type="button"` par défaut (un bouton ne soumet plus un formulaire par accident) ; tailles `default` à 44 px (`h-11`) et `lg` à 48 px, les tailles plus petites (`xs`, `sm`, `icon-*`) retirées ; `motion-reduce:transition-none` ; `asChild` retiré, faute d'usage, ce qui retire aussi Radix de ce composant. |
| `Alert` | Le texte de la variante `destructive` est à pleine opacité (`text-destructive` au lieu de `/90`), comme mesuré dans la note 0002. |
| `Spinner` | Décoratif : `aria-hidden`, sans `role="status"` ni `aria-label="Loading"` en dur. Le texte qui l'accompagne passe par le catalogue de la slice (ADR 0011). `motion-reduce:animate-none`. |
| `Input` | 44 px (`h-11` au lieu de `h-9`), bouton de fichier à `file:h-9`. |

Le code copié est reformaté par oxfmt (guillemets simples, points-virgules) : la comparaison avec
le registre se fait sur le fond, d'où ce tableau.

## Composants du dépôt

**Tout composant d'interface qui ne dépend d'aucune slice vit ici**, à côté de ceux de shadcn/ui :
ce que plusieurs écrans pourraient réutiliser, et ce qui porte une règle du design system. Une
slice ne garde que ce qui connaît son métier (la formulation de ses échecs, ses formats acceptés,
son parcours), et lie les composants d'ici à son catalogue par une prop.

| Composant | Rôle |
|---|---|
| `PhotoPicker` | Choix d'une photo : appareil photo **ou** galerie sur un téléphone, faute d'attribut `capture` ; un sélecteur de fichier sur un ordinateur. Libellé et types acceptés en props. |
| `PhotoPreview` | Aperçu d'une photo choisie, par une URL locale libérée dès que la photo change ; un texte de repli quand le navigateur ne sait pas l'afficher (HEIC hors Safari). Hauteur bornée à la moitié de l'écran. |
| `BookTitle` | Le titre d'un livre en Literata 600, seule police serif du design system (note 0002). En ligne, pour s'insérer dans une phrase. |

## Ajouter un composant

Un composant du dépôt s'écrit en TDD, comme le reste du code, dans `src/components/`. Pour un
composant de shadcn/ui :

1. **Rouge** : écrire `src/components/<nom>.spec.tsx`, qui fixe notre contrat (rôle, nom
   accessible, libellés obligatoires, 44 px, clavier, `motion-reduce`) et échoue faute de
   composant.
2. **Vert** : copier le composant, à la version exacte du CLI :
   `yarn dlx shadcn@4.21.0 add <nom> --path libs/shared/ui/src/components`. Remplacer l'import de
   `cn` par `../lib/cn.js`, puis faire les retouches minimales qui font passer la spec.
3. Exporter le composant depuis `src/index.ts`, formater (`yarn format`) et compléter le tableau
   ci-dessus.

Aucune chaîne en dur dans un composant : un libellé qu'il exige est une prop obligatoire, que la
slice remplit avec son catalogue.
