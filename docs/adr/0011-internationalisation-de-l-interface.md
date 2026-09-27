# ADR 0011 — Internationalisation de l'interface : catalogue typé maison sur `Intl`

Statut : proposé · Date : 2026-09-27 · Couplé aux ADR [0002](0002-ddd-et-architecture-hexagonale.md) (feature-slice), [0007](0007-vite-et-vitest-outillage-unique.md) (outillage) et [0008](0008-lint-et-format-oxlint-oxfmt.md) (lint)

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

Le moment est bon : le front ne contient encore qu'un écran d'attente (`app.tsx`), et la première
feature qui affiche des messages (#23, `specs/001-photo-upload`) n'est pas codée. Aujourd'hui, la
constitution (§V) et `CLAUDE.md` imposent que le texte de `apps/web` soit **écrit en français dans
le code**. Rien ne le rend traduisible.

Le [README des ADR](README.md) range une « bibliothèque interchangeable » parmi les choix qui ne
méritent pas d'ADR. Ce qui justifie celui-ci est ailleurs :

- le **contrat de l'API** : des codes, pas du texte ;
- la **place des catalogues** par rapport aux slices (ADR 0002) ;
- un **garde-fou** qui touche au lint (ADR 0008) ;
- un **amendement de la constitution**.

Le choix de la librairie y est traité parce qu'il décide du typage, donc du garde-fou.

## Problématique

Où placer le coût de l'i18n : dans une **dépendance**, qui apporte un format standard, des outils
d'extraction et une communauté, mais pèse sur un bundle mobile et type plus ou moins bien ? Ou dans
**du code maison**, minimal et typé de bout en bout, mais à maintenir et sans format que connaîtrait
un traducteur ?

Le corollaire tient au garde-fou. Le repo refuse les règles seulement écrites (« pas de `as` »,
frontières par `tags`). Une traduction manquante doit donc faire **échouer `yarn check`**, et non
s'afficher en production sous forme de clé brute ou de repli silencieux.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible · ⚪ à clarifier

| Critère | Poids | Motif |
|---|---|---|
| Typage de bout en bout, sans `as` | 🔴 | Une clé absente, mal orthographiée ou un paramètre oublié échoue au typecheck. C'est la forme que prend ici « appliqué, pas seulement écrit ». |
| Compatibilité avec la chaîne de build | 🔴 | Vite 8, Vitest et `@vitejs/plugin-react` (ADR 0007). Pas de plugin Babel ou SWC en plus, pas d'accès réseau au build (CI, images Docker). |
| Pluriels et formatage corrects | 🟠 | « 0 livre détecté » en français, « 0 books detected » en anglais : la concaténation à la main est fausse dans l'une des deux langues. |
| Poids du bundle | 🟠 | L'usage se fait au téléphone, en ressourcerie, sur un réseau quelconque. |
| Nombre de choses à connaître | 🟠 | Un seul mainteneur ([0001](0001-stack-et-monorepo-nx.md)). |
| Format standard pour des traducteurs | 🟢 | Deux langues, tenues par l'auteur. Aucun traducteur externe n'est prévu. |
| Chargement paresseux des locales | 🟢 | Deux locales et des catalogues de quelques kilo-octets : les charger toutes deux dès le départ ne coûte rien de mesurable. |

## Mesurer avant de choisir

Même méthode que pour l'[ADR 0008](0008-lint-et-format-oxlint-oxfmt.md) : les candidats ne sont pas
jugés sur leur documentation. Chacun est monté sur la **même mini-app**, dans un bac à sable hors
du repo, avec les versions du repo (Vite 8, `@vitejs/plugin-react` 6, React 19, TypeScript 6.0).
La mini-app contient trois messages : un libellé, un pluriel et un message à paramètre, en deux
locales.

### Poids

Chunk JS de production, compressé en gzip -9. L'écart est mesuré par rapport à la même app sans
i18n (67 461 o).

| Candidat | Écart gzip |
|---|---|
| Catalogue typé maison sur `Intl` | **+0,3 ko** |
| Paraglide JS 2.25 (messages compilés) | +1,3 ko |
| Lingui 6.8 (runtime seul, catalogue précompilé chargé à la main) | +2,4 ko |
| react-intl 12.1 (FormatJS, messages ICU analysés au runtime) | +14,0 ko |
| i18next 26.4 + react-i18next 17.0 | +15,8 ko |

Lingui est mesuré **sans ses macros** : c'est son poids minimal. Les macros apportent l'extraction
des messages, mais demandent un plugin Babel ou SWC en plus de la chaîne de build. Ce montage n'a
pas été fait.

### Typage

Chaque ligne est une sonde : une erreur est introduite délibérément, et on relève si `tsc` échoue.
Toutes les variantes passent `tsc` avant les sondes.

| Sonde | Maison | i18next | react-intl | Paraglide | Lingui (sans macro) |
|---|---|---|---|---|---|
| Clé absente du catalogue anglais | ✅ | ✅ ¹ | ✅ ¹ | ❌ ² | — |
| Clé mal orthographiée à l'appel | ✅ | ✅ ³ | ❌, ✅ ⁴ | ✅ | ❌ |
| Paramètre oublié | ✅ | ❌ | ❌ | ✅ | non mesuré |
| Paramètre mal typé (`count: 'x'`) | ✅ | non mesuré | non mesuré | ❌ ⁵ | non mesuré |

1. Détecté grâce à notre propre typage du catalogue (`satisfies` sur les clés du catalogue
   français), pas grâce à la librairie.
2. **Repli silencieux sur le français** : le code généré contient `en_unsupported =
   fr_unsupported`, sans aucun avertissement du compilateur.
3. Avec la déclaration de module `CustomTypeOptions`.
4. Non détecté par défaut ; détecté si on déclare les identifiants dans
   `FormatjsIntl.Message`.
5. Le paramètre est typé `NonNullable<unknown>` dans le code généré.

### Trois constats que la documentation ne donnait pas

- **Par défaut, Paraglide télécharge son plugin de format depuis un CDN à la compilation.** Le
  proxy de l'environnement de mesure bloque jsDelivr, et le plugin échoue à se charger (« Couldn't
  import the plugin »). La compilation se déclare pourtant réussie. On contourne en pointant le
  plugin installé depuis npm par un chemin local, ce qui a été vérifié. Mais le montage par défaut
  fait dépendre le build du réseau.
- **`react/jsx-no-literals` est bien implémentée par oxlint 1.78**, mais **sans options**. Elle se
  déclenche sur le texte nu dans le JSX (vérifié avec une règle témoin, `react/jsx-key`, qui se
  déclenche dans la même config). Elle laisse en revanche passer `{'…'}`, les gabarits de chaîne et
  les attributs (`alt`, `aria-label`). La version ESLint a les options `noStrings` et
  `noAttributeStrings`, mais `eslint-plugin-oxlint`, placé en dernier (ADR 0008), l'éteint
  justement parce qu'oxlint la connaît.
- **jsdom annonce `en-US`** (`navigator.languages` vaut `["en-US","en"]`). Une app qui suit le
  navigateur s'affiche donc **en anglais dans les tests** si la locale n'est pas fixée
  explicitement. Et `apps/web/index.html` déclare déjà `lang="en"` sur une page écrite en français.

## Solutions proposées

**A — i18next + react-i18next.**
- Pour : la plus répandue, riche en extensions (détection de langue, backends, ICU en option).
- Contre : la plus lourde (+15,8 ko). Les paramètres ne sont pas typés. Les pluriels passent par
  des suffixes de clés (`detected_one`, `detected_other`) que le typage voit comme des clés
  distinctes.

**B — react-intl (FormatJS).**
- Pour : format ICU standard, compris par les outils de traduction. Pluriels et formatage complets.
- Contre : +14,0 ko quand les messages sont analysés au runtime. Pour s'en passer, il faut
  précompiler, avec un outil de plus. Les clés ne sont typées qu'après une déclaration globale, et
  les paramètres ne le sont pas.

**C — Paraglide JS (inlang).**
- Pour : très léger (+1,3 ko), messages compilés en fonctions, clés et paramètres typés, format
  JSON standard.
- Contre : une traduction manquante **retombe en silence sur le français**, ce qui contredit le
  critère 🔴 sans un contrôle ajouté. Le plugin est tiré d'un CDN par défaut. Il faut une étape de
  compilation et du code généré dans l'arbre. Le typage des paramètres est faible.

**D — Catalogue typé maison sur `Intl`.** Pour chaque slice, un catalogue français (la langue
source) donne son type au catalogue anglais, déclaré avec `satisfies`. Un message est soit une
chaîne, soit une fonction à paramètres typés qui rend une chaîne. Pluriels, nombres et dates
passent par `Intl.PluralRules`, `Intl.NumberFormat` et `Intl.DateTimeFormat`, fournis par le
navigateur.
- Pour : les quatre sondes détectent l'erreur, sans `as` ni déclaration globale. +0,3 ko. Aucune
  dépendance, aucun plugin, aucune étape de build.
- Contre : du code à écrire et à tester (fournisseur de contexte, aide aux pluriels, résolution de
  la locale). Pas de format que connaîtrait un traducteur externe. Pas d'outil d'extraction : c'est
  le typecheck qui en tient lieu.

**E — Lingui avec macros.** Écartée : ses macros exigent un plugin Babel ou SWC en plus de la chaîne
Vite 8 / `@vitejs/plugin-react` 6. C'est une dépendance de build, contraire au critère 🔴, pour un
bénéfice (l'extraction) que le critère 🟢 ne réclame pas.

**F — typesafe-i18n.** Écartée : une seule version publiée depuis août 2023 (la 5.27.1, en février
2026). C'est trop incertain pour une brique dont on fait dépendre le garde-fou, et elle repose elle
aussi sur un générateur de code.

## Solution retenue

**Solution D**, pour le français et l'anglais.

1. **Typage (🔴)** — c'est le seul candidat pour lequel les quatre sondes échouent au typecheck :
   clé absente, clé mal orthographiée, paramètre oublié, paramètre mal typé. Le garde-fou repose
   sur un `satisfies`, c'est-à-dire l'outil que la convention « pas de `as` » désigne déjà pour
   contraindre un type.
2. **Chaîne de build (🔴)** — rien n'est ajouté : pas de plugin, pas d'étape de compilation, pas de
   code généré, pas d'accès réseau. Vite, Vitest et SWC restent tels quels.
3. **Pluriels et formatage (🟠)** — `Intl.PluralRules` applique les règles CLDR, que la mesure
   confirme : en français, 0 et 1 sont au singulier (`one`) ; en anglais, 0 est au pluriel
   (`other`). C'est exactement l'écart qu'une concaténation manquerait.
4. **Poids (🟠)** — +0,3 ko, contre 14 à 16 ko pour les deux librairies les plus répandues.

### Organisation

- **`libs/shared/i18n`**, avec les tags `type:shared`, `context:none` et `scope:web`, porte la
  mécanique : le type `Locale` (`'fr' | 'en'`), la résolution de la locale depuis
  `navigator.languages` (une fonction pure), l'aide aux pluriels et au formatage, le fournisseur
  React et les hooks. C'est une lib et non un dossier de `apps/web`, parce qu'une slice ne peut
  rien partager avec une autre autrement que par une lib (ADR 0002). Elle est `scope:web` parce
  qu'elle dépend de React.
- **Un catalogue par slice** : `features/<slice>/i18n/fr.ts` et `en.ts`. Le shell de l'app a le
  sien. Un message appartient à la slice qui l'affiche : aucun catalogue global où tout
  s'accumulerait.
- **Choix de la locale** : on parcourt `navigator.languages` et on retient la première langue dont
  le sous-tag principal est pris en charge. Sinon, c'est `fr`. `<html lang>` suit la locale active.
  Le sélecteur manuel et la persistance du choix relèvent de la spec, pas de cet ADR.
- **Erreurs de l'API** : l'API renvoie des codes stables. Le front associe chaque code à un
  message de son catalogue, et un code inconnu à un message générique. La forme de l'erreur et
  l'endroit où elle est traduite en HTTP relèvent de #24 et #26. Cet ADR fixe seulement qu'elle ne
  contient pas de texte destiné à l'utilisateur.

### Garde-fou

- **Typecheck** : `en.ts` se déclare avec `satisfies` sur le type du catalogue français. Une
  traduction manquante fait échouer `yarn typecheck`, donc `yarn check` et la CI.
- **Lint** : `react/jsx-no-literals` est activée dans oxlint, limitée au code de production de
  `apps/web` (les specs en sont exclues). Elle attrape le cas le plus courant, le texte nu dans le
  JSX. Les chaînes entre accolades et les attributs restent à la charge de la revue, faute
  d'options dans oxlint (voir *Conditions de bascule*).

### Conditions de bascule

- **Une troisième langue, ou un traducteur qui n'est pas développeur** : le catalogue en TypeScript
  cesse d'être un avantage, et il faut un format standard. Le candidat de repli est **Paraglide**
  (léger, compilé, JSON), à deux conditions : un contrôle qui fait échouer la CI sur une traduction
  manquante, et le plugin chargé depuis npm plutôt que depuis le CDN.
- **Des catalogues qui dépassent 10 ko gzip au total** : on charge chaque locale par un `import()`
  dynamique. Cela reste dans D, ce n'est pas une bascule.
- **Oxlint ajoute `noStrings` et `noAttributeStrings` à `react/jsx-no-literals`** : on les active,
  et la part du garde-fou laissée à la revue disparaît.

### Conséquences

- **Code maison, donc testé.** `libs/shared/i18n` s'écrit en TDD comme le reste. Sa surface est
  volontairement étroite : résolution de la locale, pluriels, formatage, contexte React. Au-delà
  (rich text, pluriels imbriqués, sélecteurs de genre), la question se rouvre au lieu de gonfler la
  lib.
- **Amendement de la constitution et de `CLAUDE.md`**, à faire à l'acceptation de cet ADR
  (`/speckit-constitution`, bump MINOR). Le §V passe de « texte écrit en français dans le code » à
  « texte affiché passant par le catalogue de sa slice, le français étant la langue source ». Les
  identifiants, commentaires et messages d'erreur internes restent en anglais.
- **`specs/001-photo-upload` à ajuster** quand #23 se code. Le `message: string` de
  `data-model.md` devient un code, et le plan ne dit plus que le texte est écrit en français dans
  le code.
- **Les specs de `apps/web` fixent leur locale.** jsdom annonce `en-US` : une spec qui vérifie un
  texte doit rendre sous une locale explicite, sinon elle dépend de l'environnement de test.
- **Les messages sont du code.** Les fonctions à paramètres sont ce qui rend le typage complet ;
  elles rendent aussi le catalogue illisible pour quelqu'un qui ne programme pas. C'est le prix
  accepté, et c'est précisément la première condition de bascule.
- **La forme `many` du français** (« 1 000 000 **de** livres ») retombe sur `other` quand un
  message ne la fournit pas. Pour un nombre de livres sur une étagère, c'est sans conséquence.

## Question ouverte

- **Sélecteur manuel et persistance** (`localStorage` ou profil) : c'est du comportement, renvoyé à
  la spec de la feature.
- **Liste des codes d'erreur de l'API et leur forme** : renvoyées à #24 et #26. Cet ADR n'exige que
  leur stabilité et l'absence de texte destiné à l'utilisateur.
