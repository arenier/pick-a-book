# Specification Quality Checklist: Upload d'une photo d'étagère

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-19
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Le format (JPEG/PNG/WebP/HEIC) et la taille maximale (20 Mo) cités dans les hypothèses ne sont
  pas une décision produit nouvelle : ils reprennent une contrainte déjà en place côté domaine
  (`ShelfPhoto`, contexte `recognition`), citée ici comme donnée de contexte plutôt qu'un détail
  d'implémentation à trancher.
- Aucun marqueur [NEEDS CLARIFICATION] : les zones d'incertitude (formats, taille, un envoi à la
  fois) avaient toutes une réponse déjà actée dans le code existant (`ScanController`, `ShelfPhoto`,
  `ShelfScannerPort`) ou dans l'ADR 0005, reprise en hypothèse plutôt qu'en question ouverte.
- Mise à jour du 21/09/2026 : le porteur du projet a demandé d'étendre le scope à la persistance
  de la photo (bucket) et de sa référence (Postgres) — US3, FR-011 à FR-013, SC-005. Deux points
  sans réponse déjà actée dans le code ont été tranchés directement avec lui (pas de marqueur
  [NEEDS CLARIFICATION], la question ayant été posée et répondue dans l'échange plutôt que
  laissée dans le document) : conserver aussi en cas d'échec du service de reconnaissance (502),
  et ne mettre en place aucune politique de rétention pour l'instant (cohérent avec la question
  déjà ouverte de l'ADR 0006).
- Deuxième mise à jour le même jour : le porteur du projet a proposé de séparer l'envoi de la
  photo et le déclenchement de l'analyse (question, pas un [NEEDS CLARIFICATION] — reformulée en
  garantie côté produit, FR-014, sans exposer le découpage en deux appels réseau dans `spec.md`,
  qui reste au niveau du comportement observable). Le détail technique du découpage (deux
  endpoints, deux use cases) vit dans `plan.md`/`research.md` §7, pas dans la spec.
- Troisième mise à jour le même jour : le porteur du projet a demandé (1) une référence Postgres
  complète pour chaque fichier du bucket (emplacement, type, poids), (2) un sous-dossier par
  utilisateur dans le bucket, et (3) que le nom de fichier d'origine n'apparaisse jamais tel quel
  dans le stockage. Un point (le (2), qui suppose un identifiant utilisateur alors que la spec
  assume « sans compte ») a été posé comme question à choix ([AskUserQuestion], pas un
  [NEEDS CLARIFICATION] dans le document) et tranché avec lui : identifiant fixe pour l'instant,
  aucune authentification introduite (FR-015, Assumptions). Les détails de schéma (colonnes,
  nommage de la clé bucket) vivent dans `research.md` §10 et `data-model.md`, pas dans la spec.
