# Mode d'emploi — Spec-driven development (Spec Kit)

`CLAUDE.md` liste les commandes Spec Kit disponibles ; ce document est le mode d'emploi concret :
dans quel ordre les enchaîner, ce que chacune attend en entrée et produit en sortie, et comment
s'articuler avec les ADR et les issues GitHub. Toute feature non triviale passe par ce pipeline
avant le code — `specs/NNN-nom-feature/` en reste la source de vérité durable.

## Vue d'ensemble

```
/speckit-constitution   (rare — principes projet, déjà posés dans .specify/memory/constitution.md)
        │
/speckit-specify        crée specs/NNN-nom-feature/spec.md
        │
/speckit-clarify        (optionnel) désambiguïse spec.md — à faire avant /speckit-plan
        │
/speckit-plan           crée plan.md (+ artefacts de conception) à partir de spec.md
        │
/speckit-tasks          découpe plan.md en tasks.md, ordonné par dépendance
        │
/speckit-analyze        (optionnel) vérifie la cohérence spec.md / plan.md / tasks.md
        │
/speckit-implement       exécute tasks.md — TDD, une tâche à la fois
        │
/speckit-taskstoissues   (optionnel) convertit tasks.md en issues GitHub, pour un suivi partagé
```

Chaque flèche est un passage de relais entre documents, pas seulement entre commandes : une étape
lit le document produit par la précédente, jamais la conversation qui l'a précédée. C'est ce qui
permet de reprendre le pipeline à froid (nouvelle session, autre contributeur) à n'importe quelle
étape.

## Étape par étape

### 1. `/speckit-constitution` — rarement rejoué

Établit ou amende `.specify/memory/constitution.md`, qui reflète les principes de `CLAUDE.md` (TDD,
hexagonal, bounded contexts, pas de `as`, outillage unique, français/anglais). Ne pas y toucher au
fil d'une feature : un principe qui doit changer se discute et se versionne pour lui-même, avec bump
sémantique (MAJOR/MINOR/PATCH — voir la section *Governance* de la constitution).

### 2. `/speckit-specify` — le point d'entrée d'une feature

Prend une description en langage naturel de la feature et écrit ou met à jour
`specs/NNN-nom-feature/spec.md` : comportement attendu, scope, critères d'acceptation. C'est la
**source de vérité** du *quoi* — pas du *comment*, ni du *pourquoi transverse* (ça, c'est un ADR).

Si la feature bute sur une décision d'architecture non tranchée (un nouveau choix de stockage, un
changement de bounded context...), la spec ne tranche pas à sa place : elle le signale, et un ADR se
rédige séparément (voir [`docs/adr/README.md`](adr/README.md)) — le plan qui suit vérifie ensuite sa
conformité aux ADR actés.

### 3. `/speckit-clarify` — optionnel, mais avant `/speckit-plan`

Pose jusqu'à 5 questions ciblées sur les zones sous-spécifiées de `spec.md`, et encode les réponses
dans le document. Utile dès que la spec a été écrite vite ou par quelqu'un d'autre que celui qui va
la planifier — une clarification tardive (après `/speckit-plan`) coûte un aller-retour en plus.

### 4. `/speckit-plan` — traduit la spec en conception

Lit `spec.md`, vérifie sa conformité à `.specify/memory/constitution.md` et aux ADR actés, et
produit `plan.md` : découpage technique, contextes touchés, interfaces/DTO de frontière si
plusieurs bounded contexts sont impliqués. C'est ici que la règle « un contexte n'importe jamais un
autre contexte » (ADR 0002/0010) se traduit en conception concrète — pas seulement en code a
posteriori.

### 5. `/speckit-tasks` — découpe en travail exécutable

Transforme `plan.md` en `tasks.md` : une liste de tâches ordonnées par dépendance, chacune assez
petite pour un cycle TDD complet (rouge/vert/refactor). Une tâche qui ne tient pas dans un cycle
TDD est probablement encore un morceau de plan, pas une tâche.

### 6. `/speckit-analyze` — optionnel, avant d'implémenter

Relit `spec.md`, `plan.md` et `tasks.md` ensemble et signale les incohérences (une tâche qui ne
couvre aucun critère d'acceptation, un critère sans tâche, une contradiction entre spec et plan).
Non destructif — il ne corrige rien, il pointe. À faire sur une feature dont les artefacts ont
été écrits ou amendés par des passes séparées.

### 7. `/speckit-implement` — exécute `tasks.md`

Traite les tâches dans l'ordre, en TDD systématique (test rouge d'abord, code minimal, refactor —
`CLAUDE.md` § Conventions). Respecte l'architecture hexagonale et les frontières de bounded context
au fil de l'exécution, pas en rattrapage après coup.

### 8. `/speckit-taskstoissues` — optionnel

Convertit `tasks.md` en issues GitHub, quand le suivi doit être visible en dehors du repo (plusieurs
contributeurs, suivi externe). L'issue référence la spec, elle ne la duplique pas — voir
l'articulation ci-dessous.

## Articulation avec les ADR et les issues

Trois documents, trois portées, à ne pas confondre :

| Document | Portée | Fréquence de révision |
|---|---|---|
| **ADR** (`docs/adr/`) | Décision d'architecture transverse, applicable au-delà d'une feature | Rare — un ADR actif l'emporte sur une spec qui le contredirait |
| **Spec** (`specs/NNN-.../spec.md`) | Comportement et scope d'une feature précise | Repasse par la spec à chaque évolution de cette feature |
| **Issue GitHub** | Entrée de discussion et suivi | Référence la spec, ne la duplique jamais |

Une spec qui révèle un besoin de décision transverse renvoie vers l'écriture d'un ADR — elle ne
tranche jamais à sa place. Le détail de cette articulation est acté dans
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md) (section *Articulation avec
les ADR et les issues*) ; ce document-ci n'en est que le mode d'emploi pratique.

## Repartir d'une feature existante

`specs/NNN-nom-feature/` est gardé durablement dans le repo, pas nettoyé une fois la feature livrée
— c'est la référence à relire avant toute évolution ultérieure de cette feature. Faire évoluer une
feature déjà spécifiée :

1. Rouvrir `specs/NNN-nom-feature/spec.md`, pas repartir d'une conversation.
2. `/speckit-specify` avec la description du changement, pour mettre `spec.md` à jour.
3. Reprendre le pipeline à partir de `/speckit-plan` (ou `/speckit-clarify` si le changement rouvre
   une ambiguïté).

Ne jamais coder un changement de comportement sur une feature spécifiée sans repasser par sa spec —
c'est la règle actée dans `CLAUDE.md` (« Toute évolution ultérieure de cette feature repasse par la
spec avant le code, jamais l'inverse »).
