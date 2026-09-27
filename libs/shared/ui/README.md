# shared-ui

Le design system du front ([ADR 0012](../../../docs/adr/0012-design-system-de-l-interface.md)) :
les composants de [shadcn/ui](https://ui.shadcn.com), **copiés dans cette lib et mis aux normes du
dépôt**, et la feuille globale qui porte Tailwind 4 et les tokens de la note
[`docs/decisions/0002`](../../../docs/decisions/0002-grandes-lignes-du-design-system.md).

Lib partagée (`type:shared`, `context:none`, `scope:web`). **C'est la seule du dépôt qui importe
Radix** : une app qui importerait `radix-ui` directement fait échouer `yarn lint`
(`bannedExternalImports` sur `type:app`, `eslint.config.mjs`).

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

## Composants et retouches

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

## Ajouter un composant

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
