# pick-a-book Constitution

## Core Principles

### I. TDD non-négociable
Tout code de production s'écrit en cycle rouge/vert/refactor : le test qui échoue d'abord, puis le
code minimal qui le fait passer, puis refactor. Aucun code de production sans un test qui le
motive — correctifs inclus (test de non-régression avant le fix). Vaut aussi pour l'infrastructure
as code : modules Terraform testés, assertions écrites d'abord. `domain` et `application` se
testent sans infra ; les adapters se testent contre la vraie techno, sur réponses enregistrées pour
la reconnaissance (la non-régression sur photos réelles reste un test séparé et manuel).

### II. Hexagonal et bounded contexts étanches
Architecture DDD complète, hexagonale au back (`domain` → `application` → `infrastructure`),
feature-slice au front. `domain` ne dépend de rien (ni framework, ni ORM, ni HTTP, ni autre
contexte) ; `application` dépend de `domain` seul et parle aux ports, jamais aux adapters ;
personne ne dépend d'`infrastructure` hors de la composition root. Un contexte n'importe jamais un
autre contexte — le croisement se fait uniquement dans l'orchestrateur d'`apps/api`, via des DTO de
frontière, jamais des objets de domaine. Au front, l'interface de `apps/web` passe par les
composants de `libs/shared/ui` : ceux de shadcn/ui, copiés et mis aux normes du dépôt, dont chacun
entre par une spec de contrat écrite d'abord (principe I). Seule cette lib importe `radix-ui` et
`@radix-ui/*` ([ADR 0012](../../docs/adr/0012-design-system-de-l-interface.md)). Ces règles sont
vérifiées par les tags Nx et `@nx/enforce-module-boundaries` (`bannedExternalImports` sur
`type:app`), pas seulement documentées.

### III. Typage prouvé, jamais affirmé
TypeScript strict, pas de `any` implicite, pas d'assertion `as` (`assertionStyle: 'never'`) : pour
contraindre un type sans perdre l'inférence, `satisfies` ; quand le type n'est réellement pas connu
à la compilation, un type guard ou une vérification explicite. Pas de primitives nues dans le
domaine — value objects validant à la construction. Assertions de test strictes (`toStrictEqual`,
`toBe(true)`) plutôt que les matchers flous.

### IV. Outillage unique, pas de choix locaux
Vite et Vitest partout ([ADR 0007](../../docs/adr/0007-vite-et-vitest-outillage-unique.md)), oxlint
et oxfmt pour le lint et le format ([ADR 0008](../../docs/adr/0008-lint-et-format-oxlint-oxfmt.md)),
lint type-aware via `oxlint-tsgolint`. Au front, le style s'écrit en classes Tailwind 4 sur les
tokens du thème de `libs/shared/ui` ([note 0002](../../docs/decisions/0002-grandes-lignes-du-design-system.md)),
jamais en CSS Module ni en couleur écrite en dur ; oxfmt trie les classes (`sortTailwindcss`), et
un ordre non trié fait échouer `yarn check`. Un nouveau projet ou une nouvelle feature n'introduit pas un
second outil de build, de test ou de lint pour un besoin ponctuel : le désaccord avec l'outillage
acté passe par un nouvel ADR, pas par une exception locale.

### V. Français dans la doc, anglais dans le code
Commentaires, messages d'erreur, logs, descriptions de tests et commits : en anglais. Documentation
et ADR : en français. Le texte affiché à l'utilisateur dans `apps/web` n'est jamais écrit dans le
code : il passe par le catalogue i18next de la slice qui l'affiche
(`features/<slice>/i18n/{fr,en}.json`, celui du shell dans `app/i18n/`), le français étant la langue
source et l'anglais la seconde langue ([ADR 0011](../../docs/adr/0011-internationalisation-de-l-interface.md)).
`model/` et `api/` rendent un type d'échec, jamais une phrase : l'UI le traduit. Le titre d'une PR
est un message de commit (squash sur `main`) : toujours en anglais ; son corps, doc de revue, reste
en français.

## Contraintes techniques

Stack Node/TypeScript, NestJS + React, monorepo Nx, Yarn (ligne 4.x). Node et Yarn épinglés à
l'exact (champ `volta`), jamais en plage. Hébergement Cloud Run + bucket, persistance Postgres
managé (Neon). Reconnaissance des livres par VLM seul pour le MVP, derrière `ShelfScannerPort` — le
filet anti-hallucination est la réconciliation en aval, pas l'OCR. Ces choix sont actés par ADR
([docs/adr/](../../docs/adr/)) et ne se rouvrent pas au fil d'une spec ou d'un plan Spec Kit : une
spec qui buterait sur l'un d'eux propose un ADR, elle ne le contourne pas.

## Articulation avec les ADR et les issues

- **ADR** (`docs/adr/`) tranche une décision d'architecture transverse, une fois, rarement révisée.
- **Spec** Spec Kit (`specs/NNN-nom-feature/`) décrit le comportement et le scope d'une feature
  précise, et reste la source de vérité de cette feature : toute évolution repasse par la spec
  avant de toucher au code, jamais l'inverse.
- **Issue GitHub** reste le point d'entrée de discussion et de suivi ; elle référence la spec plutôt
  que de la dupliquer.
- Une spec qui révèle un besoin de décision transverse renvoie vers l'écriture d'un ADR au lieu de
  trancher dans le plan de la feature.

## Governance

Cette constitution prévaut sur les préférences individuelles de mise en œuvre, mais pas sur un ADR
actif ni sur `docs/adr/README.md` : en cas de conflit, l'ADR gagne et cette constitution est mise à
jour pour refléter la décision. Toute modification de cette constitution est un changement versionné
(`/speckit-constitution`), avec bump sémantique (MAJOR : suppression/redéfinition incompatible ;
MINOR : ajout de principe ; PATCH : clarification). `/speckit-plan` et `/speckit-implement` vérifient
la conformité à ces principes avant de produire ou d'exécuter un plan.

**Version**: 1.2.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-27
