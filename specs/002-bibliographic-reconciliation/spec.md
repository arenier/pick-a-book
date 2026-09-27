# Feature Specification: Réconciliation bibliographique des livres détectés

**Feature Branch**: `[002-bibliographic-reconciliation]`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Réconciliation bibliographique"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Savoir quels livres détectés existent vraiment (Priority: P1)

Après l'analyse d'une photo d'étagère, l'utilisateur ne voit plus seulement ce que la reconnaissance
a *lu* sur les tranches : chaque livre détecté est confronté à un référentiel bibliographique, et
l'écran indique pour chacun s'il est **confirmé** (une notice du référentiel lui correspond — son
auteur et son titre de référence s'affichent), **ambigu** (plusieurs œuvres pourraient
correspondre) ou **non trouvé** (aucune notice ne correspond).

**Why this priority**: C'est le filet anti-hallucination du produit (ADR 0005) : la reconnaissance
peut compléter un titre à moitié lisible en une œuvre plausible mais absente de l'étagère, et rien
dans sa sortie ne permet de le détecter. Sans réconciliation, l'utilisateur ne sait pas à quelles
lignes de la liste il peut se fier. C'est aussi le prérequis de tout ce qui suit dans la chaîne
produit : l'enrichissement et la correspondance avec la bibliothèque de l'utilisateur ont besoin
d'un livre identifié, pas d'une chaîne lue sur une tranche (ADR 0010).

**Independent Test**: Peut être testée seule en envoyant une photo dont on connaît les livres (le
jeu de référence du bench, #10) et en constatant que chaque livre détecté porte un statut, que les
livres réellement présents et bien lus sont confirmés avec leur forme de référence, et qu'un titre
inventé n'est jamais confirmé.

**Acceptance Scenarios**:

1. **Given** une analyse qui détecte « Albert Camus — La Peste », **When** la réconciliation se
   termine, **Then** le livre est marqué confirmé et affiche l'auteur et le titre de la notice
   correspondante.
2. **Given** une analyse qui détecte un titre lu avec une petite erreur (« La Pest », une lettre
   manquante) et un auteur correct, **When** la réconciliation se termine, **Then** le livre est
   confirmé, la forme de référence (« La Peste ») s'affiche, et ce qui a été lu sur la tranche
   reste consultable.
3. **Given** une analyse qui détecte un titre qui ne correspond à aucune œuvre connue du
   référentiel (titre halluciné ou illisible), **When** la réconciliation se termine, **Then** le
   livre est marqué non trouvé et n'est jamais présenté comme confirmé.
4. **Given** une analyse qui détecte un titre sans auteur (« La Peste »), **When** une seule œuvre
   du référentiel porte ce titre, **Then** le livre est confirmé et son auteur de référence
   s'affiche ; **When** plusieurs œuvres d'auteurs différents portent ce titre, **Then** le livre
   est marqué ambigu.
5. **Given** le référentiel indisponible au moment de l'analyse, **When** la reconnaissance a
   abouti, **Then** les livres détectés restent affichés, marqués « non vérifiés », avec un message
   distinct de « non trouvé » ; l'analyse elle-même n'est pas présentée comme un échec.

---

### User Story 2 - Lever une ambiguïté (Priority: P2)

Quand un livre est marqué ambigu, l'utilisateur voit les œuvres candidates et choisit lui-même la
bonne en regardant l'étagère devant lui ; le livre devient alors confirmé. S'il ne reconnaît aucun
des candidats, il peut l'indiquer, et le livre devient non trouvé.

**Why this priority**: L'ambiguïté touche surtout les livres dont l'auteur n'est pas lisible sur la
tranche (~6 % du jeu de référence, amendement de l'ADR 0005) et les titres courts ou génériques.
Moins fréquente que le cas confirmé/non trouvé (US1), mais sans elle ces livres restent
inexploitables pour la suite de la chaîne.

**Independent Test**: Peut être testée seule avec une détection sans auteur dont le titre est porté
par plusieurs œuvres d'auteurs différents, en constatant que les candidats s'affichent et que le choix de l'un d'eux rend le livre confirmé.

**Acceptance Scenarios**:

1. **Given** un livre marqué ambigu, **When** l'utilisateur consulte ce livre, **Then** il voit
   les œuvres candidates (auteur et titre de référence de chacune), au plus un nombre limité
   classées de la plus à la moins vraisemblable.
2. **Given** un livre marqué ambigu, **When** l'utilisateur choisit l'un des candidats, **Then** le
   livre est confirmé avec la notice choisie, et ce résultat est conservé avec l'analyse (US3) en
   gardant trace que la confirmation vient du choix de l'utilisateur.
3. **Given** un livre marqué ambigu, **When** l'utilisateur indique qu'aucun candidat ne
   correspond, **Then** le livre devient non trouvé, et ce résultat est conservé avec l'analyse.
4. **Given** un livre marqué ambigu, **When** l'utilisateur ne fait rien, **Then** le livre reste
   ambigu, y compris quand il revient plus tard sur l'analyse.

---

### User Story 3 - Conserver le résultat de la réconciliation avec l'analyse (Priority: P2)

Le résultat de la réconciliation de chaque livre (statut, notice retenue, forme de référence) est
conservé avec l'analyse de la photo dont il provient (spec 001, US3), pour que l'enrichissement et
la correspondance avec la bibliothèque de l'utilisateur, à venir, partent de livres identifiés sans
réinterroger le référentiel.

**Why this priority**: Invisible pour l'utilisateur dans l'instant, mais sans elle chaque
réconciliation est perdue dès l'écran fermé — exactement le raisonnement qui a fait conserver la
photo et les livres détectés dans la spec 001.

**Independent Test**: Peut être testée seule en analysant une photo puis en constatant,
indépendamment de l'interface, que l'enregistrement de l'analyse porte pour chaque livre détecté
son statut de réconciliation et, s'il est confirmé, l'identifiant stable de la notice retenue.

**Acceptance Scenarios**:

1. **Given** une analyse dont la réconciliation s'est terminée, **When** on consulte
   l'enregistrement de cette analyse, **Then** chaque livre détecté porte son statut, et chaque
   livre confirmé l'identifiant stable de sa notice et sa forme de référence (auteur, titre).
2. **Given** une analyse dont la réconciliation n'a pas pu avoir lieu (référentiel indisponible),
   **When** on consulte son enregistrement, **Then** les livres détectés y figurent avec le statut
   « non vérifié », et ce qu'avait lu la reconnaissance est intact.

---

### User Story 4 - Relancer la vérification quand le référentiel était indisponible (Priority: P3)

L'utilisateur dont les livres sont restés « non vérifiés » (référentiel en panne, réseau coupé)
peut relancer la réconciliation plus tard, sans renvoyer la photo ni refaire la reconnaissance.

**Why this priority**: Confort de récupération sur erreur. La reconnaissance est l'étape lente et
coûteuse (de l'ordre de 27 s, `docs/decisions/0001`) : la refaire pour une panne survenue après
elle serait un gaspillage, mais l'outil reste utilisable sans, en renvoyant la photo.

**Independent Test**: Peut être testée seule en rendant le référentiel indisponible pendant une
analyse, puis disponible, et en constatant que la relance fait passer les livres « non vérifiés »
à un statut définitif sans nouvel appel à la reconnaissance.

**Acceptance Scenarios**:

1. **Given** une analyse dont des livres sont « non vérifiés », **When** l'utilisateur relance la
   vérification et que le référentiel répond, **Then** ces livres reçoivent un statut confirmé,
   ambigu ou non trouvé, et les livres qui avaient déjà un statut définitif ne changent pas.
2. **Given** une analyse dont tous les livres ont un statut définitif, **When** l'utilisateur la
   consulte, **Then** aucune relance n'est proposée.

### Edge Cases

- **Même œuvre, plusieurs éditions** (Folio, Livre de Poche, Pléiade) : ce n'est pas une
  ambiguïté. La réconciliation identifie l'œuvre ; déterminer l'édition exacte présente sur
  l'étagère est hors scope (FR-007).
- **Même livre détecté deux fois sur la photo** (deux exemplaires, ou une tranche lue deux fois) :
  chaque détection est réconciliée pour elle-même et garde sa ligne ; aucune fusion n'est faite
  ici — repérer un doublon avec la bibliothèque de l'utilisateur relève de `curation`.
- **Auteur lu différent de l'auteur de la notice** (pseudonyme, nom d'usage, initiales —
  « A. Camus ») : la forme abrégée d'un même nom correspond ; un auteur franchement différent
  empêche la confirmation, même si le titre correspond (FR-003).
- **Titre de série ou de tome** (« Les Rougon-Macquart », « Tome 3 ») : traité comme n'importe
  quel titre — confirmé si une notice correspond sans ambiguïté, ambigu sinon.
- **Livre absent du référentiel mais bien réel** (autoédition, livre ancien, édition étrangère) :
  il ressort « non trouvé ». Le statut dit « le référentiel ne le connaît pas », pas « ce livre
  n'existe pas » — l'écran ne doit pas laisser entendre le second (FR-009).
- **Détection de faible confiance** (la reconnaissance expose une confiance par livre, ADR 0005) :
  elle est réconciliée comme les autres ; c'est la réconciliation, pas la confiance de lecture, qui
  décide du statut.
- **Référentiel lent ou qui répond pour une partie des livres seulement** : chaque livre reçoit son
  propre statut ; ceux pour lesquels aucune réponse n'a été obtenue dans un délai raisonnable sont
  « non vérifiés », sans bloquer l'affichage des autres.
- **Analyse sans aucun livre détecté** : rien à réconcilier, l'écran reste celui de la spec 001
  (« aucun livre détecté »).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT réconcilier automatiquement, sans action de l'utilisateur, chaque
  livre détecté par une analyse aboutie contre le référentiel bibliographique.
- **FR-002**: Le système DOIT attribuer à chaque livre détecté exactement un statut parmi :
  **confirmé**, **ambigu**, **non trouvé**, **non vérifié** (le référentiel n'a pas pu être
  interrogé pour ce livre).
- **FR-003**: Le système NE DOIT marquer un livre confirmé que si le référentiel contient une
  notice dont le titre correspond au titre lu — en tolérant les différences qui ne changent pas le
  sens (casse, accents, ponctuation, espaces, article initial, une ou deux lettres mal lues) — et,
  quand un auteur a été lu, dont l'auteur correspond aussi, formes abrégées comprises.
- **FR-004**: Le système NE DOIT JAMAIS marquer un livre confirmé sur la seule foi de la détection :
  sans notice correspondante, le livre est non trouvé, quelle que soit la confiance de lecture.
- **FR-005**: Pour un livre détecté sans auteur, le système DOIT réconcilier sur le titre seul :
  confirmé si le titre désigne une seule œuvre du référentiel, ambigu s'il en désigne plusieurs
  d'auteurs différents.
- **FR-006**: Un livre confirmé DOIT porter l'identifiant stable de la notice retenue et sa forme de
  référence (auteur, titre), cette dernière pouvant compléter un auteur absent à la détection.
- **FR-007**: Plusieurs notices décrivant la même œuvre (éditions, rééditions) NE DOIVENT PAS rendre
  un livre ambigu : l'ambiguïté porte sur *quelle œuvre*, pas sur *quelle édition*.
- **FR-008**: L'indisponibilité ou la lenteur du référentiel NE DOIT NI masquer les livres détectés,
  NI faire échouer l'analyse : les livres concernés sont affichés « non vérifiés », avec un message
  distinct de « non trouvé » et de l'échec de la reconnaissance (spec 001, FR-006).
- **FR-009**: Le système DOIT afficher le statut de chaque livre de façon compréhensible sans jargon
  technique ; un livre confirmé affiche sa forme de référence, et ce qui a été lu sur la tranche
  reste consultable quand il en diffère ; un livre non trouvé est présenté comme « inconnu du
  référentiel », pas comme inexistant.
- **FR-010**: Pour un livre ambigu, le système DOIT montrer les œuvres candidates (auteur et titre
  de référence), classées de la plus à la moins vraisemblable, dans une limite de nombre raisonnable
  pour un écran de téléphone, et permettre à l'utilisateur de choisir l'un d'eux — le livre devient
  alors confirmé avec la notice choisie — ou d'indiquer qu'aucun ne correspond — le livre devient
  alors non trouvé. Le système NE DOIT JAMAIS lever une ambiguïté de lui-même.
- **FR-011**: Les livres non trouvés DOIVENT rester affichés dans la liste, à leur place, avec leur
  statut, au même titre que les autres : rien n'est masqué, car un livre réel peut être inconnu du
  référentiel.
- **FR-012**: Le système DOIT conserver durablement, avec l'analyse dont il provient, le résultat de
  la réconciliation de chaque livre détecté : statut, et pour un livre confirmé l'identifiant de la
  notice, sa forme de référence et l'origine de la confirmation (automatique ou choix de
  l'utilisateur), pour un livre ambigu ses candidats, ainsi que la date de la réconciliation.
- **FR-013**: La réconciliation NE DOIT PAS modifier ce qu'a produit la reconnaissance : l'auteur et
  le titre lus sont conservés intacts à côté du résultat de la réconciliation.
- **FR-014**: Le système DOIT permettre de relancer la réconciliation des livres « non vérifiés »
  d'une analyse conservée, sans renvoyer la photo ni refaire la reconnaissance ; la relance ne
  touche pas les livres ayant déjà un statut définitif.

### Key Entities

- **Livre détecté** : ce que la reconnaissance a lu sur une tranche (titre, auteur optionnel,
  confiance) — produit par le contexte `recognition` (spec 001), entrée de la réconciliation,
  jamais modifié par elle.
- **Référentiel bibliographique** : la source externe de notices contre laquelle on réconcilie. Son
  choix (lequel, un seul ou une chaîne de repli) n'est pas tranché par cette spec — ADR à écrire
  (#20).
- **Notice** : la description d'une œuvre par le référentiel — identifiant stable propre au
  référentiel, auteur(s) et titre de référence. Donnée partagée, vraie pour tout le monde
  (ADR 0010).
- **Résultat de réconciliation** : pour un livre détecté, son statut (confirmé, ambigu, non trouvé,
  non vérifié), la notice retenue s'il est confirmé, les candidats s'il est ambigu, et la date de la
  réconciliation, et pour un livre confirmé l'origine de la confirmation (automatique ou choix de
  l'utilisateur, US2). Conservé avec l'analyse (US3).
- **Candidat** : une notice plausible pour un livre ambigu, avec sa place dans le classement de
  vraisemblance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sur le jeu de référence de photos réelles (#10), au moins 80 % des livres présents et
  correctement lus par la reconnaissance ressortent confirmés — le seuil sous lequel l'ADR 0005
  prévoit de rouvrir le choix de la reconnaissance.
- **SC-002**: Sur ce même jeu, moins de 2 % des livres confirmés ne correspondent à aucun livre
  réellement présent sur l'étagère (hallucination qui résout quand même — le cas qui invaliderait
  le filet, ADR 0005).
- **SC-003**: Pour une étagère de 30 livres, le statut de tous les livres est affiché au plus
  20 secondes après l'affichage de la liste des livres détectés.
- **SC-004**: 100 % des analyses dont le référentiel est indisponible affichent quand même leurs
  livres détectés, marqués « non vérifiés » — jamais une page blanche, un blocage ou un échec de
  l'analyse entière.
- **SC-005**: 100 % des réconciliations terminées sont retrouvables avec leur analyse après coup,
  sans nouvelle interrogation du référentiel.
- **SC-006**: Sur un écran de téléphone (largeur 360px et plus), l'utilisateur distingue d'un coup
  d'œil les quatre statuts, sans défilement horizontal.

## Assumptions

- **Le référentiel n'est pas choisi ici.** Le choix du ou des référentiels, la stratégie
  d'appariement (normalisation, seuils) et le traitement fin des homonymes relèvent de l'ADR
  d'enrichissement bibliographique à écrire (#20). Cette spec décrit le comportement attendu
  quel que soit ce choix ; le plan ne pourra pas fixer l'adaptateur du référentiel avant cet ADR,
  mais le reste (statuts, règles de correspondance, conservation, affichage) n'en dépend pas.
- **L'enrichissement est hors scope** : couverture, résumé, genre, éditeur, année — même si la
  notice les contient. Cette feature s'arrête à l'identification. Réconciliation et enrichissement
  vivent dans le même contexte `bibliography` (ADR 0010), mais sont deux features distinctes.
- **La correspondance avec l'utilisateur est hors scope** : dire si un livre est déjà possédé,
  recherché ou conforme à une préférence relève du contexte `curation` (ADR 0010).
- **L'identification se fait au niveau de l'œuvre**, pas de l'édition : une tranche ne permet pas
  de savoir de quelle édition il s'agit de façon fiable, et une notice représentative de l'œuvre
  suffit à l'enrichissement et à la curation à venir.
- **La réconciliation s'enchaîne sur la reconnaissance dans le même parcours**, sans action de
  l'utilisateur : la liste des livres détectés s'affiche dès que la reconnaissance a répondu
  (spec 001), les statuts la complètent ensuite.
- **La correction manuelle d'un livre est hors scope** — décision actée avec le porteur du projet
  le 27/09/2026 : l'utilisateur ne ressaisit pas le titre ou l'auteur d'un livre non trouvé pour
  relancer la recherche ; si la lecture est mauvaise, il renvoie une photo. Feature ultérieure
  possible, qui repassera par cette spec.
- **Une ambiguïté se lève par l'utilisateur, jamais d'office** — décision actée avec le porteur du
  projet le 27/09/2026 (US2, FR-010) : retenir automatiquement le candidat le plus vraisemblable
  reviendrait à confirmer un livre sans preuve, contraire au rôle de filet de la réconciliation.
- **Les livres non trouvés restent dans la liste** — décision actée avec le porteur du projet le
  27/09/2026 (FR-011) : les masquer ferait disparaître sans trace un livre réel absent du
  référentiel.
- **Les analyses conservées avant cette feature ne sont pas réconciliées rétroactivement** : pas de
  reprise en masse de l'historique dans ce scope.
- Usage mono-utilisateur, sans compte, isolé par l'identifiant technique fixe déjà en place
  (spec 001) — la réconciliation ne manipule que des données partagées et n'introduit rien de
  propre à l'utilisateur.
- Le fonds visé est d'abord l'édition française, de poche notamment (ADR 0005) ; un livre en langue
  étrangère est réconcilié de la même façon, sans garantie de couverture.
