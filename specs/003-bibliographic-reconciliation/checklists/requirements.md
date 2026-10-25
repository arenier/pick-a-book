# Specification Quality Checklist: Réconciliation bibliographique des livres détectés

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-27
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

- **Dépendance bloquante pour le plan, pas pour la spec** : le choix du référentiel (BnF,
  OpenLibrary, chaîne de repli…) et la stratégie d'appariement fine relèvent de l'ADR
  d'enrichissement bibliographique à écrire (#20). La spec est volontairement agnostique du
  référentiel ; `/speckit-plan` pourra concevoir le domaine, les statuts, la conservation et
  l'affichage, mais pas fixer l'adaptateur du référentiel avant cet ADR.
- La tolérance de FR-003 (casse, accents, ponctuation, une ou deux lettres) est décrite en termes
  observables ; les seuils chiffrés relèvent de l'ADR #20 et du plan. `libs/shared/text-match`
  existe déjà pour ce geste, mais n'est pas cité dans les exigences.
- SC-001 et SC-002 reprennent les conditions de bascule de l'ADR 0005 (taux de résolution ≥ 80 %,
  faux positifs à haute similarité) et se mesurent sur le jeu de référence du bench (#10).
- Trois marqueurs [NEEDS CLARIFICATION] ont été posés au premier jet, puis tranchés avec le porteur
  du projet le 27/09/2026 : (1) un livre ambigu se lève par choix de l'utilisateur parmi les
  candidats, ou « aucun ne correspond » — jamais d'office (US2, FR-010) ; (2) les livres non
  trouvés restent dans la liste, marqués (FR-011) ; (3) la correction manuelle d'un livre non
  trouvé est hors scope (Assumptions).
- Validation : une seule itération, tous les points passent après intégration des réponses.
- Mise à jour du 27/09/2026 : le porteur du projet veut pouvoir, à terme, analyser où
  l'interprétation se trompe le plus. Décision : conserver les faits dès cette feature (US5,
  FR-015 à FR-018, SC-007), reporter leur exploitation. Au passage, US2 et US4 supposaient de
  « revenir plus tard » sur une analyse alors qu'aucun historique n'existe : elles sont bornées à
  l'écran de résultat affiché, l'historique étant mis au parking. Les hors-scope de la spec sans
  issue ni ADR sont reportés dans `docs/parking.md`.
- **Révision du 17/10/2026**, après le merge de la spec 002 (PR #82) et de l'ADR 0014 (PR #84) :
  - la dépendance bloquante est levée : l'ADR 0014 a choisi le catalogue général de la BnF et posé
    les principes d'appariement. La spec reprend les comportements observables qui en découlent
    (segments, tome, formes rejetées des autorités, rapprochement partiel, regroupement, notice
    représentative, score distinct de la confiance, attribution : FR-003, FR-004, FR-007,
    FR-019 à FR-023) ; les réglages chiffrés sont dans `research.md` ;
  - l'historique existe : US1, US2 et US4 s'étendent au détail d'un envoi (FR-024), décision du
    porteur du projet du 17/10/2026 ; les hypothèses « pas d'historique » et « pas de reprise des
    analyses antérieures » sont remplacées ;
  - l'enrichissement (Google Books, état par source) part dans une spec 004, décision du porteur
    du projet du 17/10/2026 ;
  - « ADR », « BnF », « ARK » et « catalogue » apparaissent désormais dans la spec : c'est le
    vocabulaire du domaine fixé par l'ADR, pas un détail d'implémentation. Tous les points restent
    cochés.
