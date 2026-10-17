---
paths:
  - "apps/web/**"
  - "libs/shared/i18n/**"
  - "libs/shared/ui/**"
---

# Interface de `apps/web`

## Textes et traductions

Pourquoi : [ADR 0011](../../docs/adr/0011-internationalisation-de-l-interface.md).

- **Aucun texte affiché à l'utilisateur n'est écrit dans le code.** Il passe par le catalogue
  i18next de sa slice, `features/<slice>/i18n/{fr,en}.json` (celui du shell dans `app/i18n/`). Le
  français est la langue source.
- **Une clé s'ajoute dans les deux langues, dans le même commit.**
- Une slice lit ses messages par `useMessages('<slice>')`, la façade de `libs/shared/i18n`. **Seule
  cette lib importe `i18next`, `react-i18next` et `i18next-browser-languagedetector`**
  (`bannedExternalImports` sur `type:app`).
- `model/` et `api/` rendent un **type d'échec**, jamais une phrase. L'UI le traduit par une **table
  explicite**, jamais par une clé construite (`` t(`failure.${kind}`) ``), qui échapperait au typage.
- L'API ne renvoie jamais de texte destiné à l'utilisateur.
- `yarn nx translations web` signale une traduction absente ou un texte en dur.

## Design system

Pourquoi : [ADR 0012](../../docs/adr/0012-design-system-de-l-interface.md),
[note 0002](../../docs/decisions/0002-grandes-lignes-du-design-system.md).

- **L'interface se compose avec `libs/shared/ui`.** Les composants shadcn/ui y sont copiés, et
  **tout composant d'interface qui ne dépend d'aucune slice y vit aussi** (`PhotoPicker`,
  `PhotoPreview`, `BookTitle`). La slice ne garde que ce qui connaît son métier, et lie ces
  composants à son catalogue.
- **Seule `libs/shared/ui` importe `radix-ui`** (`bannedExternalImports` sur `type:app`).
- **Style en classes Tailwind sur les tokens du thème** : pas de CSS Module, pas de couleur écrite
  en dur. oxfmt trie les classes (`sortTailwindcss`) ; un ordre non trié fait échouer `yarn check`.
- **Un composant copié entre par une spec de contrat écrite d'abord** (rôle, nom accessible, cible de
  44 px, `motion-reduce`), puis reçoit les retouches minimales qui la font passer. Le `README.md` de
  la lib en tient la liste.
- **Aucune chaîne en dur dans un composant de `libs/shared/ui`** : un libellé qu'il exige est une
  prop, remplie par le catalogue de la slice.
