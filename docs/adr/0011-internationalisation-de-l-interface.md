# ADR 0011 — Internationalisation de l'interface : i18next

Statut : accepté · Date : 2026-09-27 · Couplé aux ADR [0002](0002-ddd-et-architecture-hexagonale.md) (feature-slice), [0007](0007-vite-et-vitest-outillage-unique.md) (outillage) et [0008](0008-lint-et-format-oxlint-oxfmt.md) (lint)

## Contexte

L'interface de `apps/web` doit exister en **français et en anglais**. Elle **suit la langue du
navigateur** et retombe sur le **français** quand aucune des deux langues n'y figure. Le cadrage
est dans l'issue #58. Trois points y sont déjà tranchés et ne sont pas rediscutés ici :

- tout le texte de `apps/web` se traduit (libellés, messages d'état et d'erreur, textes
  d'accessibilité), ainsi que le formatage des dates, des nombres et des pluriels ;
- **l'API ne renvoie aucun texte destiné à l'utilisateur**, seulement des codes que le front
  traduit ;
- la reconnaissance des livres, les métadonnées bibliographiques et les préférences en texte libre
  de `curation` sont hors périmètre : l'i18n porte sur l'interface, pas sur les livres.

Le front compte aujourd'hui une slice, `features/photo-upload` (#55, `specs/001-photo-upload`), et
le shell de l'app. Leur texte est écrit en français directement dans le code, une dizaine de
chaînes réparties en trois couches :
- `model/photo-constraints.ts` : refus d'un fichier avant l'envoi ;
- `api/scan-shelf-photo.ts` : une table `MESSAGES`, un message par type d'échec ;
- `ui/` : libellés, état de chargement, « aucun livre détecté ».

Les deux premières produisent directement le `message` affiché, porté par `UploadState`. C'est
conforme à la constitution (§V) et à `CLAUDE.md`, qui imposent un texte **écrit en français dans le
code**. Mais rien ne le rend traduisible. Migrer maintenant coûte une slice ; chaque nouvelle slice
en ajoutera une.

Le [README des ADR](README.md) range une « bibliothèque interchangeable » parmi les choix qui ne
méritent pas d'ADR. Ce qui justifie celui-ci est ailleurs :

- le **contrat de l'API** : des codes, pas du texte ;
- la **place des catalogues** par rapport aux slices (ADR 0002) ;
- un **garde-fou** qui ajoute une cible à `yarn check` et à la CI ;
- un **amendement de la constitution**.

Le choix de la librairie y est traité parce qu'il décide de la forme de tout le reste.

## Problématique

Faut-il une librairie standard, ou un catalogue maison ? Une librairie apporte un format connu des
traducteurs et des outils, des cas difficiles déjà résolus et du code qu'on n'a pas à posséder. Elle
coûte du poids et type moins finement. Un catalogue maison est minimal et typé de bout en bout, mais
tout est à écrire, et son format n'est connu que de ce repo.

Une première version de cet ADR retenait le catalogue maison. Elle traitait le typage des paramètres
comme décisif et le poids comme important. En relisant, ni l'un ni l'autre ne tient face à un
projet open source, tenu par un seul mainteneur, dont le reste de l'outillage est standard (Nx,
oxlint, Spec Kit).

Le corollaire tient au garde-fou. Le repo refuse les règles seulement écrites. Il faut donc décider
**quelles erreurs bloquent, et avec quel outil**, la librairie n'en attrapant qu'une partie par
elle-même.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible · ⚪ à clarifier

| Critère | Poids | Motif |
|---|---|---|
| Standard et écosystème | 🔴 | Le projet est open source et a un seul mainteneur. Un format et une API connus, c'est moins de code à posséder, un contributeur qui s'y retrouve, et des outils de traduction qui s'y branchent. |
| Garde-fou exécutable | 🔴 | Une clé mal orthographiée ou une traduction absente fait échouer `yarn check` et la CI. Appliqué, pas seulement écrit. |
| Compatibilité avec la chaîne de build | 🔴 | Vite 8, Vitest et `@vitejs/plugin-react` (ADR 0007). Pas de plugin Babel ou SWC en plus, pas d'accès réseau au build (CI, images Docker). |
| Pluriels et formatage corrects | 🟠 | « 0 livre détecté » en français, « 0 books detected » en anglais : la concaténation à la main est fausse dans l'une des deux langues. |
| Typage des paramètres à l'appel | 🟠 | Un paramètre oublié affiche un texte troué. C'est grave, mais les tests l'attrapent quand le chemin est exercé (voir *Garde-fou*). |
| Poids du bundle | 🟢 | React pèse déjà 67 ko gzip. Quelques kilo-octets de plus ne changent rien de mesurable pour une app personnelle à 20–200 photos par mois. |

## Étude des candidats

Six options ont été montées sur la **même mini-app**, avec les versions d'outils du repo : un
libellé, un pluriel et un message à paramètre, en deux locales. On a mesuré pour chacune :
- le poids gzip ;
- des sondes de typage ;
- le comportement à l'exécution ;
- les outils de contrôle des catalogues et du texte en dur.

La méthode, les mesures, les constats et l'analyse de chaque candidat sont consignés dans l'issue
**#58**. Cet ADR n'en retient que ce qui fonde la décision.

## Solution retenue

**Solution A : i18next + react-i18next**, avec i18next-browser-languagedetector pour la détection et
`i18next-cli` pour le contrôle.

1. **Standard (🔴)** — c'est la librairie d'i18n la plus répandue de l'écosystème React. Ses
   catalogues JSON se branchent sur les outils de traduction sans conversion. Une troisième langue
   ou un traducteur externe devient un ajout de fichiers, pas un changement d'architecture.
2. **Garde-fou (🔴)** — les clés et namespaces sont typés nativement. Ce qui échappe aux types est
   couvert par l'outil officiel (`i18next-cli`) et par un test ciblé (voir *Garde-fou*). Chaque
   trou mesuré a son contrôle.
3. **Chaîne de build (🔴)** — ce ne sont que des dépendances d'exécution : pas de plugin, pas de
   compilation, pas de code généré, pas d'accès réseau. `i18next-cli` s'exécute en local, hors du
   build.
4. **Pluriels et formatage (🟠)** — les pluriels suivent le CLDR par suffixes de clés. Dates et
   nombres passent par les formateurs intégrés, fondés sur `Intl`.

### Organisation

- **Un namespace par slice** : `apps/web/src/features/<slice>/i18n/fr.json` et `en.json`. Un
  message appartient à la slice qui l'affiche : aucun catalogue global où tout s'accumulerait. Le
  shell de l'app a son propre namespace ; son emplacement exact est laissé au plan, pourvu qu'il
  suive le même motif que les slices, que lit `i18next-cli`.
- **i18next est encapsulé dans `libs/shared/i18n`**, avec les tags `type:shared`, `context:none`
  et `scope:web`, sur le modèle de `libs/shared/ui` pour `radix-ui`
  ([ADR 0012](0012-design-system-de-l-interface.md)). La lib porte toute la mécanique et expose une
  façade que le reste du front utilise seule :
  - `createI18n(catalogues, { language, strict })` : l'instance, la détection et le repli ;
    `strict` fait lever les handlers de clé et de paramètre manquants, pour les specs ;
  - `I18nProvider` et `setDefaultI18n` : l'instance fournie à React, par contexte ou par défaut ;
  - `useMessages('<namespace>')`, qui rend `{ t }` typé : c'est la seule API que voient les slices ;
  - `syncDocumentLanguage` et `catalogProblems` (le test de parité).
- **Seule `libs/shared/i18n` importe `i18next`, `react-i18next` et
  `i18next-browser-languagedetector`.** La règle passe par le graphe Nx, comme les autres
  frontières : `bannedExternalImports` sur la contrainte `type:app` de
  `@nx/enforce-module-boundaries` (`eslint.config.mjs`). Un import direct depuis `apps/web` fait
  échouer `yarn lint`.
- **La composition vit dans `apps/web`**, à côté de `main.tsx`. C'est le seul endroit qui connaît
  tous les namespaces : il importe les catalogues, les passe à `createI18n`, et déclare
  `CustomTypeOptions` à partir des JSON français. Cette déclaration de types est la seule mention
  d'i18next hors de la lib ; elle n'importe rien à l'exécution. Les slices n'importent que la
  façade (`useMessages('<slice>')`), jamais une autre slice.
- **Ce que la façade isole, et ce qu'elle n'isole pas.** Changer de librairie ne touche plus les
  slices ni la composition : c'est l'intérieur de `libs/shared/i18n` qui change. Restent liés à
  i18next, et à reprendre dans ce cas : le format des catalogues (suffixes de pluriel `_one`,
  placeholders `{{x}}`), le typage des clés (`CustomTypeOptions`) et l'outillage (`i18next-cli`,
  qui reconnaît `useMessages` par son option `useTranslationNames`).
- **Choix de la locale** : détection sur `navigator` seul, sans persistance (`caches: []`). Les
  réglages sont `order: ['navigator']`, `supportedLngs: ['fr','en']`, `nonExplicitSupportedLngs`,
  `load: 'languageOnly'` et `fallbackLng: 'fr'`. Mesuré dans #58 : `["de-DE","en-GB"]` donne `en`,
  et `["pt-BR","fr-FR","en"]` donne `fr`, conformément à la décision de #58. `<html lang>` suit l'événement `languageChanged`. Le sélecteur
  manuel et la persistance du choix relèvent de la spec ; le détecteur sait déjà lire et écrire
  `localStorage` si elle le demande.
- **Erreurs de l'API** : l'API ne renvoie pas de texte destiné à l'utilisateur. Le front le
  pratique déjà : `scan-shelf-photo.ts` choisit son message d'après le statut HTTP (400 et 413 :
  photo refusée, 502 : service en panne, réseau coupé, autre : inattendu), jamais d'après le
  `message` technique de la réponse (FR-009). Cet ADR généralise la règle : si un statut ne suffit
  plus à distinguer deux cas à afficher différemment, l'API ajoute un **code stable** dans le
  corps. Le front associe chaque statut ou code à une clé de son catalogue par une table
  explicite, plutôt que par une clé construite (`` t(`errors.${code}`) ``) qui échapperait au
  typage. Un code inconnu donne un message générique. La forme de l'erreur et l'endroit où elle
  est traduite en HTTP relèvent de #24 et #26.
- **Les messages se traduisent dans l'UI, pas dans `model/` ni `api/`.** Ces couches rendent un
  type d'échec, que l'UI traduit avec `t()`. Elles ne rendent plus une phrase : sinon, elles
  devraient connaître la langue active.

### Garde-fou

Deux comportements d'i18next, mesurés dans #58, **ne se voient pas à l'exécution** et
fondent ce garde-fou :
- une traduction anglaise absente affiche la phrase française, sans appeler `missingKeyHandler` ;
- en français, un pluriel sans forme `_many` affiche la clé brute à 1 000 000, puisque le CLDR
  attribue `many` aux multiples exacts du million.

Chaque erreur a son contrôle, et tous font échouer `yarn check` et la CI.

| Erreur | Contrôle | Quand |
|---|---|---|
| Clé ou namespace mal orthographié | Typecheck (`CustomTypeOptions` tiré des JSON français) | `yarn typecheck`, et dans l'éditeur |
| Traduction absente d'une locale | `i18next-cli status` (code de sortie 1) | Cible Nx de `web` |
| Texte en dur dans le JSX (nu, `{'…'}`, `alt`, `aria-label`) | `i18next-cli lint` | Même cible |
| Forme de pluriel manquante (dont `_many` en français), placeholders différents entre `fr` et `en` | Test Vitest de parité des catalogues, fondé sur `Intl.PluralRules(locale).resolvedOptions().pluralCategories` | `yarn test` |
| Paramètre oublié, clé inconnue à l'exécution | `missingInterpolationHandler` et `missingKeyHandler` qui **lèvent** dans `test-setup.ts` | Quand un test exerce le chemin |

Ce qui reste à la revue : le gabarit de chaîne dans le JSX, un paramètre oublié sur un chemin
qu'aucun test n'exerce, et une traduction recopiée sans être traduite.

Les autres outils sondés pour le texte en dur sont comparés dans #58. `i18next-cli lint` est
retenu parce que `i18next-cli` est de toute façon requis pour `status`.

### Conditions de bascule

- **Un budget de poids du bundle initial est instauré et la pile i18n l'empêche d'être tenu** :
  Paraglide (+1,3 ko mesuré) devient le candidat. Il faut alors un contrôle de traduction manquante
  et son plugin chargé depuis npm.
- **Un paramètre oublié passe en production** malgré les handlers de test : c'est le signal que le
  typage des paramètres mérite d'être 🔴. On rouvre la question entre Paraglide et un typage des
  interpolations.
- **Un changement de librairie** (l'une des deux conditions ci-dessus) se fait dans
  `libs/shared/i18n`, derrière la façade, plus les catalogues et l'outillage : les slices ne
  changent pas.
- **`i18next-cli` cesse d'être maintenu ou régresse** : `status` se remplace en étendant le test de
  parité à la présence des clés, et `lint` par eslint-plugin-i18next (sondé dans #58).

Une troisième langue ou un traducteur externe **n'est pas** une condition de bascule : c'est
précisément ce que ce choix rend simple.

### Conséquences

- **Quatre dépendances nouvelles**, épinglées selon les conventions du repo :
  - `i18next`, `react-i18next` et `i18next-browser-languagedetector` à l'exécution ;
  - `i18next-cli` en développement.
- **`i18next-cli` tire son propre `@swc/core` (^1.16)**, alors que le repo épingle 1.15.8 : deux
  binaires SWC coexistent dans l'arbre. C'est sans effet sur le build (ADR 0007), mais à surveiller
  aux montées de version (#21).
- **+17,7 ko gzip** acceptés sur le bundle initial.
- **Une lib de plus, `libs/shared/i18n`** *(amendé le 27/09/2026, à la mise en œuvre)*. La
  première version de cet ADR faisait importer `react-i18next` directement par les slices, faute
  de rien à partager. L'encapsulation est retenue pour deux raisons : la frontière devient
  appliquée par le lint au lieu d'être une convention, comme pour `radix-ui` (ADR 0012), et la
  configuration (détection, repli, handlers stricts) a un seul propriétaire. Les dépendances
  i18next se déclarent dans le `package.json` de la lib, contrôlé par `@nx/dependency-checks`.
- **Une cible Nx ajoutée à `web`** pour `i18next-cli status` et `lint`. Le garde-fou de la CI
  « check and CI verify the same targets » impose de l'ajouter **des deux côtés** (`yarn check` et
  `ci.yml`), et il échouera si l'un des deux est oublié. Ce garde-fou lit les listes avec
  l'expression `[a-z ]*[a-z]`. Une cible dont le nom contient un chiffre ou un tiret (`i18n`,
  `i18n-check`) y serait tronquée, et la comparaison porterait sur des listes coupées. La cible se
  nomme donc en lettres seules (par exemple `translations`), ou l'expression du garde-fou s'élargit
  dans la même PR.
- **Les specs de `apps/web` fixent leur locale.** jsdom annonce `en-US` : `test-setup.ts`
  crée l'instance en `fr` explicitement et en mode `strict`, où les deux handlers lèvent. Une spec qui teste
  l'anglais change de langue explicitement.
- **Le français porte trois formes de pluriel** (`_one`, `_many`, `_other`) sur chaque clé
  comptée. Le test de parité l'exige : sans `_many`, un million afficherait la clé brute.
- **Amendement de la constitution et de `CLAUDE.md`**, à faire à l'acceptation de cet ADR
  (`/speckit-constitution`, bump MINOR). Le §V passe de « texte écrit en français dans le code » à
  « texte affiché passant par le catalogue de sa slice, le français étant la langue source ». Les
  identifiants, commentaires et messages d'erreur internes restent en anglais.
- **La slice `photo-upload` est à migrer**, avec la spec qui la décrit. Le `message: string`
  d'`UploadState` (et de `data-model.md`) devient un type d'échec. `MESSAGES` et les phrases de
  `photo-constraints.ts` passent dans `features/photo-upload/i18n/`. Le plan de
  `specs/001-photo-upload` ne dit plus que le texte est écrit en français dans le code. Ses specs,
  qui vérifient des textes français, rendent sous la locale `fr` fixée par `test-setup.ts`.

## Question ouverte

- **Sélecteur manuel et persistance** (`localStorage` ou profil) : c'est du comportement, renvoyé à
  la spec de la feature.
- **Liste des codes d'erreur de l'API et leur forme** : renvoyées à #24 et #26. Cet ADR n'exige que
  leur stabilité et l'absence de texte destiné à l'utilisateur.
- **Types générés ou écrits à la main** : `i18next-cli types` sait générer les définitions
  TypeScript. La déclaration écrite à la main (`typeof` des JSON importés) tient en quelques lignes
  et ne peut pas se désynchroniser. C'est un choix de mise en œuvre, laissé au plan.
