# Feature Specification: Réconciliation bibliographique des livres détectés

**Feature Branch**: `[003-bibliographic-reconciliation]`

**Created**: 2026-09-27

**Updated**: 2026-10-17 — réalignée sur l'[ADR 0014](../../docs/adr/0014-referentiel-bibliographique-bnf.md)
(référentiel BnF, appariement en cascade, score de réconciliation) et sur la spec
[002](../002-upload-history/spec.md) (historique des envois, PR #82)

**Status**: Draft

**Input**: User description: "Réconciliation bibliographique"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Savoir quels livres détectés existent vraiment (Priority: P1)

Après l'analyse d'une photo d'étagère, l'utilisateur ne voit plus seulement ce que la reconnaissance
a *lu* sur les tranches : chaque livre détecté est confronté au catalogue général de la BnF
(ADR 0014), et l'écran indique pour chacun s'il est **confirmé** (une notice du catalogue lui
correspond — son auteur et son titre de référence s'affichent), **ambigu** (plusieurs œuvres
pourraient correspondre) ou **non trouvé** (aucune notice ne correspond). Les mêmes statuts
s'affichent quand il rouvre l'envoi plus tard, depuis l'historique (spec 002, US2).

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
   catalogue (titre halluciné ou illisible), **When** la réconciliation se termine, **Then** le
   livre est marqué non trouvé et n'est jamais présenté comme confirmé.
4. **Given** une analyse qui détecte un titre sans auteur (« La Peste »), **When** une seule œuvre
   du catalogue porte ce titre, **Then** le livre est confirmé, son auteur de référence s'affiche,
   et l'écran signale que la confirmation repose sur le titre seul ; **When** plusieurs œuvres
   d'auteurs différents portent ce titre, **Then** le livre est marqué ambigu.
5. **Given** le catalogue indisponible au moment de l'analyse, malgré les nouvelles tentatives,
   **When** la reconnaissance a abouti, **Then** les livres détectés restent affichés, marqués
   « non vérifiés », avec un message distinct de « non trouvé » ; l'analyse elle-même n'est pas
   présentée comme un échec.
6. **Given** une tranche qui porte la série et le tome avec le titre (« Percy Jackson - La Mer des
   Monstres »), **When** une notice du tome nomme la série lue dans son contexte, **Then** le livre
   est confirmé sur ce tome ; **When** seul un segment de la lecture correspond et que le reste ne
   s'explique pas par la notice, **Then** le livre est ambigu, jamais confirmé.
7. **Given** un auteur lu sous une forme que la notice n'emploie pas (« Alaa El Aswany » pour
   « Aswānī, ʿAlāʾ al- »), **When** le titre correspond, **Then** le livre est confirmé si la
   forme lue figure parmi les formes rejetées de la notice d'autorité BnF de l'auteur.
8. **Given** un envoi déjà réconcilié, **When** l'utilisateur l'ouvre depuis l'historique, **Then**
   il voit les statuts conservés, sans nouvelle interrogation du catalogue.

---

### User Story 2 - Lever une ambiguïté (Priority: P2)

Quand un livre est marqué ambigu, l'utilisateur voit les œuvres candidates et choisit lui-même la
bonne en regardant l'étagère devant lui — ou la photo, quand il rouvre l'envoi depuis l'historique ;
le livre devient alors confirmé. S'il ne reconnaît aucun des candidats, il peut l'indiquer, et le
livre devient non trouvé.

**Why this priority**: L'ambiguïté touche surtout les livres dont l'auteur n'est pas lisible sur la
tranche (~6 % du jeu de référence, amendement de l'ADR 0005), les titres courts ou génériques, et
la confusion entre une série et son tome. L'étude de l'ADR 0014 montre que le bon livre est presque
toujours parmi les candidats : le choix est un coût d'usage, pas un risque pour le filet. Sans lui,
ces livres restent inexploitables pour la suite de la chaîne.

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
   ambigu, et c'est ce statut qui est conservé avec l'analyse.
5. **Given** un livre resté ambigu, **When** l'utilisateur rouvre l'envoi depuis l'historique,
   **Then** il peut lever l'ambiguïté depuis le détail de l'envoi, comme depuis l'écran de résultat.

---

### User Story 3 - Conserver le résultat de la réconciliation avec l'analyse (Priority: P2)

Le résultat de la réconciliation de chaque livre (statut, notice retenue, forme de référence) est
conservé avec l'analyse de la photo dont il provient (spec 001, US3), pour que l'historique
l'affiche (spec 002), et que l'enrichissement (spec 004) et la correspondance avec la bibliothèque
de l'utilisateur, à venir, partent de livres identifiés sans réinterroger le catalogue.

**Why this priority**: Sans elle, chaque réconciliation est perdue dès l'écran fermé, et
l'historique ne pourrait montrer les statuts qu'en rappelant le catalogue — ce que l'ADR 0014
exclut : un livre déjà réconcilié ne rappelle personne.

**Independent Test**: Peut être testée seule en analysant une photo puis en constatant,
indépendamment de l'interface, que l'enregistrement de l'analyse porte pour chaque livre détecté
son statut de réconciliation et, s'il est confirmé, l'identifiant stable (ARK) de la notice retenue.

**Acceptance Scenarios**:

1. **Given** une analyse dont la réconciliation s'est terminée, **When** on consulte
   l'enregistrement de cette analyse, **Then** chaque livre détecté porte son statut, et chaque
   livre confirmé l'ARK de sa notice et sa forme de référence (auteur, titre).
2. **Given** une analyse dont la réconciliation n'a pas pu avoir lieu (catalogue indisponible),
   **When** on consulte son enregistrement, **Then** les livres détectés y figurent avec le statut
   « non vérifié », et ce qu'avait lu la reconnaissance est intact.

---

### User Story 4 - Relancer la vérification quand le catalogue était indisponible (Priority: P3)

L'utilisateur dont les livres sont restés « non vérifiés » (catalogue en panne, réseau coupé)
peut relancer la réconciliation, depuis l'écran de résultat ou plus tard depuis le détail de
l'envoi dans l'historique, sans renvoyer la photo ni refaire la reconnaissance.

**Why this priority**: Confort de récupération sur erreur. La reconnaissance est l'étape lente et
coûteuse (de l'ordre de 27 s, `docs/decisions/0001`, et plafonnée par jour, spec 002 FR-015) : la
refaire pour une panne survenue après elle serait un gaspillage, mais l'outil reste utilisable
sans, en renvoyant la photo.

**Independent Test**: Peut être testée seule en rendant le catalogue indisponible pendant une
analyse, puis disponible, et en constatant que la relance fait passer les livres « non vérifiés »
à un statut définitif sans nouvel appel à la reconnaissance.

**Acceptance Scenarios**:

1. **Given** une analyse dont des livres sont « non vérifiés », **When** l'utilisateur relance la
   vérification et que le catalogue répond, **Then** ces livres reçoivent un statut confirmé,
   ambigu ou non trouvé, et les livres qui avaient déjà un statut définitif ne changent pas.
2. **Given** une analyse dont tous les livres ont un statut définitif, **When** l'utilisateur la
   consulte, **Then** aucune relance n'est proposée.
3. **Given** un envoi dont des livres sont « non vérifiés », **When** l'utilisateur l'ouvre depuis
   l'historique, **Then** la relance lui est proposée dans le détail de l'envoi.

---

### User Story 5 - Garder de quoi comprendre où le système se trompe (Priority: P2)

Le porteur du projet veut pouvoir, à terme, analyser où l'interprétation d'une photo se trompe le
plus — lecture de la tranche, auteur manquant, ambiguïté, classement des candidats, étape de la
cascade, couverture du catalogue — pour savoir quoi corriger. Cette feature ne produit pas cette
analyse, mais conserve dès maintenant, pour chaque livre, les faits qui la rendront possible : ils
naissent au moment de la réconciliation et ne pourraient pas être reconstitués après coup (la
reconnaissance ne relit pas deux fois une photo de la même façon, et le catalogue évolue).

**Why this priority**: Invisible pour l'utilisateur et sans effet sur le parcours, mais c'est le seul
moment où ces faits existent : chaque analyse faite sans les conserver est perdue pour l'analyse
d'erreurs. Le coût est marginal, puisque ces faits sont déjà produits par la réconciliation (US1,
US2) — il s'agit de ne pas les jeter. C'est aussi ce qui permettra au bench de vérifier les
conditions de bascule de l'ADR 0014.

**Independent Test**: Peut être testée seule en réalisant un lot d'analyses couvrant chaque statut
(dont un ambigu levé par l'utilisateur, un ambigu rejeté et un non vérifié), puis en constatant,
à partir des seules données conservées et sans rappeler ni la reconnaissance ni le catalogue,
que chaque livre peut être rangé dans une catégorie d'écart (SC-007).

**Acceptance Scenarios**:

1. **Given** un livre confirmé dont la forme lue diffère de la forme de référence, **When** on
   consulte son enregistrement, **Then** on y trouve les deux formes, leur degré de correspondance
   et l'étape de la cascade qui a trouvé la notice.
2. **Given** un livre ambigu que l'utilisateur a levé en choisissant un candidat, **When** on
   consulte son enregistrement, **Then** on y trouve le résultat automatique d'origine (ambigu, avec
   ses candidats classés et leur degré de correspondance) **et** le choix de l'utilisateur, datés
   chacun — le rang du candidat choisi en découle.
3. **Given** un livre ambigu pour lequel l'utilisateur a indiqué qu'aucun candidat ne correspond,
   **When** on consulte son enregistrement, **Then** on y trouve l'ambiguïté d'origine et ce rejet.
4. **Given** un livre non vérifié, **When** on consulte son enregistrement, **Then** on y trouve la
   cause (catalogue indisponible, délai dépassé, réponse inexploitable).

### Edge Cases

- **Même œuvre, plusieurs éditions** (Folio, Livre de Poche, Pléiade) : ce n'est pas une
  ambiguïté. La réconciliation identifie l'œuvre ; déterminer l'édition exacte présente sur
  l'étagère est hors scope (FR-007). L'ARK retenu est celui d'une édition représentative, pas
  l'identifiant de l'œuvre.
- **Même livre détecté deux fois sur la photo** (deux exemplaires, ou une tranche lue deux fois) :
  chaque détection est réconciliée pour elle-même et garde sa ligne ; aucune fusion n'est faite
  ici — repérer un doublon avec la bibliothèque de l'utilisateur relève de `curation`.
- **Auteur lu différent de l'auteur de la notice** (pseudonyme, translittération, nom d'usage,
  initiales — « A. Camus ») : la forme abrégée d'un même nom correspond, de même qu'une forme
  rejetée de la notice d'autorité BnF ; un auteur franchement différent, sous toutes ses formes,
  empêche la confirmation, même si le titre correspond (FR-003).
- **Plusieurs noms lus** (« D. Pennac - J. Ferrandez ») : chaque nom est comparé à tous les auteurs
  de la notice, illustrateurs et traducteurs compris.
- **Titre de série ou de tome** (« Les Rougon-Macquart », « Tome 3 », « Percy Jackson - La Mer des
  Monstres ») : la mention de tome lue est comparée au numéro de la notice, jamais retirée ; une
  notice de tome qui nomme la série lue est préférée à la série seule (FR-019) ; sinon, ambigu.
- **Deux titres qui ne diffèrent que par un nombre** (« 17 lunes », « 18 lunes ») : ce sont deux
  œuvres distinctes, jamais regroupées (FR-007).
- **Une œuvre et son adaptation** (un roman et sa bande dessinée de même titre) : la notice
  représentative d'un livre confirmé est celle dont les auteurs principaux sont ceux qui ont été
  lus, jamais une adaptation cosignée par un dessinateur quand la lecture désigne l'original
  (FR-020).
- **Livre absent du catalogue mais bien réel** (autoédition, livre ancien, édition en langue
  originale, alphabet non latin) : il ressort « non trouvé ». Le statut dit « le catalogue ne le
  connaît pas », pas « ce livre n'existe pas » — l'écran ne doit pas laisser entendre le second
  (FR-009). Les éditions en langue originale sont hors du périmètre du MVP (ADR 0014).
- **Livre réel lu à la place d'un autre** (« Souviens-toi » lu pour « Douce nuit », même autrice) :
  le filet ne peut pas le détecter, quel que soit le référentiel (limite de construction, ADR 0014) ;
  le livre ressort confirmé.
- **Détection de faible confiance** (la reconnaissance expose une confiance par livre, ADR 0005) :
  elle est réconciliée comme les autres ; c'est la réconciliation, pas la confiance de lecture, qui
  décide du statut, et les deux ne sont jamais fusionnées (FR-021).
- **Catalogue lent ou qui répond pour une partie des livres seulement** : chaque livre reçoit son
  propre statut ; ceux pour lesquels aucune réponse n'a été obtenue dans le budget de temps sont
  « non vérifiés », sans bloquer l'affichage des autres.
- **Analyse sans aucun livre détecté** : rien à réconcilier, l'écran reste celui de la spec 001
  (« aucun livre détecté »), et le détail de l'envoi celui de la spec 002.
- **Envoi dont l'analyse a échoué, puis a été relancée depuis l'historique** (spec 002, US3) : la
  réconciliation s'enchaîne sur la relance qui aboutit, dans le détail de l'envoi, comme après un
  envoi.
- **Envoi analysé avant cette feature, ou dont la réconciliation n'a jamais été lancée** (écran
  quitté avant la réponse) : la réconciliation se lance à l'ouverture de son détail dans
  l'historique — à la demande, jamais en masse.
- **Limite de requêtes par source atteinte** (spec 002, FR-014) — par exemple en levant beaucoup
  d'ambiguïtés en peu de temps : le message de la spec 002 invite à réessayer un peu plus tard ;
  rien n'est perdu, le livre reste ambigu.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT réconcilier automatiquement, sans action de l'utilisateur, chaque
  livre détecté par une analyse aboutie contre le catalogue général de la BnF (ADR 0014).
- **FR-002**: Le système DOIT attribuer à chaque livre détecté exactement un statut parmi :
  **confirmé**, **ambigu**, **non trouvé**, **non vérifié** (le catalogue n'a pas pu être
  interrogé pour ce livre). Seule la BnF tranche ce statut : aucune autre source ne le crée, ne le
  change ni ne le confirme.
- **FR-003**: Le système NE DOIT marquer un livre confirmé que si le catalogue contient une
  notice dont le titre correspond au titre lu — en tolérant les différences qui ne changent pas le
  sens (casse, accents, ponctuation, espaces, mentions entre parenthèses, une ou deux lettres mal
  lues), et en comparant chaque segment d'une lecture composée (série, tome, titre) — et, quand un
  auteur a été lu, dont l'un des auteurs correspond aussi : formes abrégées, ordre du nom et
  formes rejetées de la notice d'autorité BnF compris.
- **FR-004**: Le système NE DOIT JAMAIS marquer un livre confirmé sur la seule foi de la détection :
  sans notice correspondante, le livre est non trouvé, quelle que soit la confiance de lecture. Un
  rapprochement partiel — un seul segment de la lecture correspond, et le reste ne s'explique pas
  par la notice (série, collection, tome, éditeur) — NE DOIT PAS confirmer seul : le livre est
  ambigu.
- **FR-005**: Pour un livre détecté sans auteur, le système DOIT réconcilier sur le titre seul :
  confirmé si le titre désigne une seule œuvre du catalogue, ambigu s'il en désigne plusieurs
  d'auteurs différents.
- **FR-006**: Un livre confirmé DOIT porter l'identifiant stable de la notice retenue (son ARK) et
  sa forme de référence (auteurs, titre), cette dernière pouvant compléter un auteur absent à la
  détection.
- **FR-007**: Plusieurs notices décrivant la même œuvre (éditions, rééditions) NE DOIVENT PAS rendre
  un livre ambigu : l'ambiguïté porte sur *quelle œuvre*, pas sur *quelle édition*. Le regroupement
  des notices par œuvre suit une règle du système, jamais l'identifiant d'œuvre du catalogue ; deux
  titres qui ne diffèrent que par un nombre désignent deux œuvres distinctes.
- **FR-008**: L'indisponibilité ou la lenteur du catalogue NE DOIT NI masquer les livres détectés,
  NI faire échouer l'analyse : l'appel est retenté dans le budget de temps (SC-003), puis les livres
  concernés sont affichés « non vérifiés » — jamais « non trouvés » —, avec un message distinct de
  « non trouvé » et de l'échec de la reconnaissance (spec 001, FR-006).
- **FR-009**: Le système DOIT afficher le statut de chaque livre de façon compréhensible sans jargon
  technique ; un livre confirmé affiche sa forme de référence, et ce qui a été lu sur la tranche
  reste consultable quand il en diffère ; un livre non trouvé est présenté comme « inconnu du
  catalogue », pas comme inexistant.
- **FR-010**: Pour un livre ambigu, le système DOIT montrer les œuvres candidates (auteur et titre
  de référence), classées de la plus à la moins vraisemblable, dans une limite de nombre raisonnable
  pour un écran de téléphone, et permettre à l'utilisateur de choisir l'un d'eux — le livre devient
  alors confirmé avec la notice choisie — ou d'indiquer qu'aucun ne correspond — le livre devient
  alors non trouvé. Le système NE DOIT JAMAIS lever une ambiguïté de lui-même.
- **FR-011**: Les livres non trouvés DOIVENT rester affichés dans la liste, à leur place, avec leur
  statut, au même titre que les autres : rien n'est masqué, car un livre réel peut être inconnu du
  catalogue.
- **FR-012**: Le système DOIT conserver durablement, avec l'analyse dont il provient, le résultat de
  la réconciliation de chaque livre détecté : statut, et pour un livre confirmé l'ARK de la notice,
  sa forme de référence et l'origine de la confirmation (automatique ou choix de l'utilisateur),
  pour un livre ambigu ses candidats, ainsi que la date de la réconciliation. Les notices retenues
  et candidates sont conservées telles que le catalogue les a rendues, avec leur date de
  consultation, pour que l'enrichissement (spec 004) n'ait pas à rappeler la BnF.
- **FR-013**: La réconciliation NE DOIT PAS modifier ce qu'a produit la reconnaissance : l'auteur et
  le titre lus sont conservés intacts à côté du résultat de la réconciliation.
- **FR-014**: Le système DOIT permettre de relancer la réconciliation des livres « non vérifiés »
  d'une analyse conservée, depuis l'écran de résultat comme depuis le détail de l'envoi dans
  l'historique, sans renvoyer la photo ni refaire la reconnaissance ; la relance ne touche pas les
  livres ayant déjà un statut définitif.
- **FR-015**: Le système DOIT conserver, pour chaque livre, le degré de correspondance entre ce qui a
  été lu et la notice retenue, et entre ce qui a été lu et chaque candidat d'un livre ambigu, sur
  une même échelle pour tous les livres, ainsi que l'étape de la recherche qui a trouvé la notice.
- **FR-016**: Une décision de l'utilisateur sur un livre ambigu (choix d'un candidat, aucun ne
  correspond) NE DOIT PAS effacer le résultat automatique qui la précédait : les deux sont conservés
  et datés.
- **FR-017**: Le système DOIT conserver quel catalogue a été interrogé pour chaque livre et, pour
  un livre non vérifié, la cause (catalogue indisponible, délai dépassé, réponse inexploitable).
- **FR-018**: Les informations conservées pour l'analyse des erreurs (FR-015 à FR-017) et la valeur
  du score de réconciliation (FR-021) NE SONT PAS affichées à l'utilisateur par cette feature : leur
  exploitation (rapport, tableau de bord, tri, alertes) est une feature ultérieure.
- **FR-019**: Quand la lecture porte une série et un titre de tome, le système DOIT préférer la
  notice du tome qui nomme la série lue dans son contexte, et comparer une mention de tome lue
  (« tome 3 », « 2e », « T2 ») au numéro de la notice.
- **FR-020**: La notice représentative d'une œuvre confirmée DOIT être choisie par une règle
  explicite du système, jamais d'après l'ordre de la réponse du catalogue : celle dont les auteurs
  principaux sont ceux qui ont été lus, plutôt qu'une adaptation cosignée par un dessinateur.
- **FR-021**: Le système DOIT calculer, pour chaque livre réconcilié, un **score de réconciliation**
  qui dit à quel point le livre retenu est sûr, distinct de la confiance de lecture de la
  reconnaissance et jamais fusionné avec elle. Une confirmation obtenue sans auteur lu a un score
  plus bas qu'une confirmation où l'auteur correspond ; le statut, lui, ne change pas.
- **FR-022**: Un livre confirmé sans qu'aucun auteur n'ait été lu DOIT être présenté comme tel
  (« confirmé sur le titre seul ») : c'est la preuve la plus faible du filet (ADR 0014).
- **FR-023**: Le système DOIT citer le catalogue général de la BnF partout où une forme de
  référence ou un candidat s'affiche (Licence Ouverte, ADR 0014).
- **FR-024**: Le détail d'un envoi dans l'historique (spec 002, FR-007) DOIT afficher le résultat
  conservé de la réconciliation de chaque livre, sans rappeler le catalogue, et y offrir la levée
  d'ambiguïté (FR-010) et la relance (FR-014). Un envoi abouti dont aucun livre n'a encore été
  réconcilié l'est à l'ouverture de son détail.
- **FR-025**: La réconciliation NE DOIT PAS compter dans le plafond d'analyses du jour (spec 002,
  FR-015) : elle n'appelle pas le service de reconnaissance. Elle reste soumise à la limite de
  requêtes par source (spec 002, FR-014), et ne concerne que les envois du propriétaire, comme
  l'historique.

### Key Entities

- **Livre détecté** : ce que la reconnaissance a lu sur une tranche (titre, auteur optionnel,
  confiance) — produit par le contexte `recognition` (spec 001), entrée de la réconciliation,
  jamais modifié par elle. Sa place dans la liste est stable : une analyse aboutie ne se refait
  pas (spec 002, FR-011).
- **Catalogue** : le catalogue général de la BnF, interrogé par son API SRU sur les textes imprimés
  (ADR 0014), seul juge de la réconciliation.
- **Notice** : la description d'une édition par le catalogue — ARK, titre (propre et complément),
  auteurs avec leur rôle (principaux, illustrateurs, traducteurs) et l'identifiant de leur notice
  d'autorité, contexte (série, tome, collection, éditeur). Donnée partagée, vraie pour tout le
  monde (ADR 0010).
- **Autorité** : la notice d'autorité BnF d'un auteur, dont les formes rejetées (translittérations,
  pseudonymes, variantes de prénom) permettent de reconnaître un nom lu autrement.
- **Résultat de réconciliation** : pour un livre détecté, son statut (confirmé, ambigu, non trouvé,
  non vérifié), la notice retenue s'il est confirmé, les candidats s'il est ambigu, son score de
  réconciliation, et la date de la réconciliation, et pour un livre confirmé l'origine de la
  confirmation (automatique ou choix de l'utilisateur, US2). Conservé avec l'analyse (US3), avec de
  quoi analyser les erreurs (US5) : le degré de correspondance de la notice retenue et de chaque
  candidat, l'étape de la recherche, le catalogue interrogé, la cause d'un « non vérifié », et,
  quand l'utilisateur a levé une ambiguïté, le résultat automatique d'origine à côté de sa décision.
- **Candidat** : une notice plausible pour un livre ambigu, représentant une œuvre, avec sa place
  dans le classement de vraisemblance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sur le jeu de référence de photos réelles (#10), au moins 80 % des livres présents et
  correctement lus par la reconnaissance ressortent confirmés — le seuil sous lequel l'ADR 0005
  prévoit de rouvrir le choix de la reconnaissance, et la première condition de bascule de
  l'ADR 0014.
- **SC-002**: Sur ce même jeu, moins de 2 % des livres confirmés ne correspondent à aucun livre
  réellement présent sur l'étagère (hallucination qui résout quand même — le cas qui invaliderait
  le filet, ADR 0005).
- **SC-003**: Pour une étagère de 30 livres, le statut de tous les livres est affiché au plus
  20 secondes après l'affichage de la liste des livres détectés.
- **SC-004**: 100 % des analyses dont le catalogue est indisponible affichent quand même leurs
  livres détectés, marqués « non vérifiés » — jamais une page blanche, un blocage ou un échec de
  l'analyse entière.
- **SC-005**: 100 % des réconciliations terminées sont retrouvables avec leur analyse après coup,
  dans le détail de l'envoi, sans nouvelle interrogation du catalogue.
- **SC-006**: Sur un écran de téléphone (largeur 360px et plus), l'utilisateur distingue d'un coup
  d'œil les quatre statuts, sans défilement horizontal, sur l'écran de résultat comme dans le
  détail d'un envoi.
- **SC-007**: À partir des seules données conservées, sans rappeler ni la reconnaissance ni le
  catalogue, 100 % des livres d'un lot d'analyses peuvent être rangés dans une catégorie d'écart :
  lu tel quel, lecture corrigée par le catalogue, auteur complété par le catalogue, ambiguïté
  levée par l'utilisateur (avec le rang du candidat choisi), ambiguïté rejetée, inconnu du
  catalogue, non vérifié (avec sa cause).

## Assumptions

- **Le référentiel est le catalogue général de la BnF** — ADR 0014 (statut : proposé). Les
  principes d'appariement (cascade de requêtes, seuil 0,85, formes rejetées des autorités, verdict
  et regroupement par une règle du domaine, rapprochement partiel qui ne confirme pas seul) y sont
  posés ; les réglages mesurés (séparateurs, taille des pages, pondération, marge, ordre détaillé
  de la cascade) sont reportés dans `research.md`, d'après l'étude de l'issue #20. OpenLibrary
  n'est pas interrogé : c'est le repli nommé par les conditions de bascule de l'ADR.
- **L'enrichissement est hors scope, et fait l'objet de la spec 004** — décision actée avec le
  porteur du projet le 17/10/2026. Cette feature s'arrête à l'identification. Google Books, le
  port d'enrichissement, l'état de l'enrichissement par source, les champs tirés de la notice BnF
  (éditeur, format, ISBN, prix, genre, résumé, couverture) et leur attribution relèvent de la
  spec 004. La spec 003 conserve les notices retenues telles que reçues (FR-012), pour que la
  spec 004 parte de la base sans rappeler la BnF.
- **La correspondance avec l'utilisateur est hors scope** : dire si un livre est déjà possédé,
  recherché ou conforme à une préférence relève du contexte `curation` (ADR 0010).
- **L'identification se fait au niveau de l'œuvre**, pas de l'édition : une tranche ne permet pas
  de savoir de quelle édition il s'agit de façon fiable. L'ARK retenu identifie une édition
  représentative : `curation` ne pourra pas détecter un doublon par égalité d'ARK (ADR 0014).
- **La réconciliation s'enchaîne sur la reconnaissance dans le même parcours**, sans action de
  l'utilisateur : la liste des livres détectés s'affiche dès que la reconnaissance a répondu
  (spec 001), les statuts la complètent ensuite.
- **La réconciliation s'appuie sur l'historique, pas l'inverse** — décision actée avec le porteur
  du projet le 17/10/2026, dans le droit fil de la spec 002 (Assumptions) : le détail d'un envoi
  affiche les statuts, et on y lève une ambiguïté ou relance une vérification comme sur l'écran de
  résultat (FR-024). Le résumé d'un envoi dans la liste de l'historique (spec 002, FR-005) ne
  change pas : il compte toujours les livres détectés, sans les statuts.
- **La correction manuelle d'un livre est hors scope** — décision actée avec le porteur du projet
  le 27/09/2026 : l'utilisateur ne ressaisit pas le titre ou l'auteur d'un livre non trouvé pour
  relancer la recherche ; si la lecture est mauvaise, il renvoie une photo. Feature ultérieure
  possible, qui repassera par cette spec.
- **Une ambiguïté se lève par l'utilisateur, jamais d'office** — décision actée avec le porteur du
  projet le 27/09/2026 (US2, FR-010) : retenir automatiquement le candidat le plus vraisemblable
  reviendrait à confirmer un livre sans preuve, contraire au rôle de filet de la réconciliation.
- **Les livres non trouvés restent dans la liste** — décision actée avec le porteur du projet le
  27/09/2026 (FR-011) : les masquer ferait disparaître sans trace un livre réel absent du
  catalogue.
- **Conserver maintenant, analyser plus tard** — décision actée avec le porteur du projet le
  27/09/2026 (US5, FR-015 à FR-018) : les faits utiles à l'analyse des erreurs sont conservés dès
  cette feature, parce qu'ils ne se reconstituent pas après coup ; leur exploitation est reportée.
  Limite assumée : sans retour explicite de l'utilisateur sur un livre confirmé ou non trouvé
  (« ce livre n'est pas sur l'étagère », « ce livre existe bien »), ces données ne distinguent pas
  une hallucination confirmée à tort d'un vrai livre, ni un titre halluciné d'un livre absent du
  catalogue — ce retour est au parking (`docs/parking.md`).
- **Le score de réconciliation qualifie, il ne décide pas** (ADR 0014) : cette feature le calcule
  et le conserve (FR-021), et n'en montre que la conséquence la plus nette, la confirmation sur le
  titre seul (FR-022). Trier, filtrer ou alerter sur le score est une feature ultérieure.
- **Les analyses conservées avant cette feature ne sont pas réconciliées en masse** : chacune
  l'est à la demande, à l'ouverture de son détail dans l'historique (FR-024).
- Usage mono-utilisateur, sans compte, isolé par l'identifiant technique fixe déjà en place
  (spec 001) — la réconciliation ne manipule que des données partagées et n'introduit rien de
  propre à l'utilisateur ; ses routes vérifient, comme celles de l'historique, que l'envoi
  appartient au propriétaire.
- Le fonds visé est l'édition française, traductions comprises (ADR 0014) ; un livre en langue
  originale ou dans un alphabet non latin est réconcilié de la même façon, sans garantie de
  couverture.
- **Usage poli d'un service public** : 4 requêtes en parallèle au plus vers la BnF, et un
  `User-Agent` qui identifie le projet (ADR 0014).
