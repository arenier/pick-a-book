# shared-i18n

La façade d'internationalisation du front ([ADR 0011](../../../docs/adr/0011-internationalisation-de-l-interface.md)) :
**la seule lib du dépôt qui importe `i18next`, `react-i18next` et
`i18next-browser-languagedetector`**. Une app qui les importerait directement fait échouer
`yarn lint` (`bannedExternalImports` sur `type:app`, `eslint.config.mjs`).

Lib partagée (`type:shared`, `context:none`, `scope:web`) : elle porte la mécanique (détection,
repli, handlers stricts, React), jamais les catalogues. Ceux-ci restent dans chaque slice de
`apps/web`, qui les assemble et les passe à `createI18n`.

## API

| Export | Rôle |
|---|---|
| `createI18n(catalogues, { language?, strict? })` | Une instance neuve, chargée de tous les catalogues. Suit `navigator.languages` (`fr-CA` → `fr`), retombe sur le français. `language` fixe la langue ; `strict` fait lever sur une clé inconnue ou un paramètre d'interpolation manquant — pour les specs. |
| `useMessages('<namespace>')` | `{ t }` pour un namespace : la seule API que voient les slices. Les clés sont typées par la déclaration `CustomTypeOptions` de l'app. |
| `I18nProvider` | Fournit une instance aux `useMessages` en dessous. |
| `setDefaultI18n(i18n)` | L'instance utilisée sans provider — ce que fait `test-setup.ts` du front. |
| `syncDocumentLanguage(i18n, html)` | Tient `<html lang>` sur la langue active. |
| `catalogProblems(catalogues)` | Ce que `i18next-cli status` ne vérifie pas : formes de pluriel CLDR par langue (dont `_many` en français), placeholders identiques d'une langue à l'autre. |
| `SUPPORTED_LANGUAGES`, `FALLBACK_LANGUAGE` | `['fr', 'en']`, `'fr'`. |

## Ce que la façade n'isole pas

Changer de librairie se fait ici, sans toucher aux slices. Restent liés à i18next : le format des
catalogues (suffixes de pluriel, placeholders `{{x}}`), le typage des clés (`CustomTypeOptions`,
déclaré par l'app) et l'outillage (`i18next-cli`, qui reconnaît `useMessages` par son option
`useTranslationNames`).
