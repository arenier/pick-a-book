# Feature Specification: Historique des photos envoyées

**Feature Branch**: `[002-upload-history]`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Pouvoir accéder à sa bibliothèque d'uploads : l'utilisateur retrouve
les photos d'étagère qu'il a déjà envoyées et les résultats de reconnaissance associés."

> **Vocabulaire.** Ce que le porteur du projet appelle ici « bibliothèque d'uploads » est nommé
> **historique des envois** dans cette spec. Le mot **bibliothèque** est déjà pris : dans le langage
> du contexte `curation` ([ADR 0010](../../docs/adr/0010-decoupage-bounded-contexts.md)), il désigne
> les livres que l'utilisateur possède. Garder deux sens au même mot brouillerait les deux features.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Parcourir ses envois passés (Priority: P1)

De retour chez lui, ou quelques jours après un passage en ressourcerie, l'utilisateur ouvre
l'historique de ses envois et voit la liste des photos d'étagère qu'il a déjà envoyées, les plus
récentes en premier, chacune avec sa date, une vignette de la photo et un résumé de ce que la
reconnaissance en a tiré (nombre de livres détectés, aucun livre, analyse en échec ou jamais lancée).

**Why this priority**: Aujourd'hui, chaque photo et son résultat sont conservés (spec 001, US3)
mais l'utilisateur n'a aucun moyen de les revoir : une fois l'écran de résultat fermé, tout est
perdu pour lui. La liste est la porte d'entrée de tout le reste de cette feature.

**Independent Test**: Peut être testée seule en envoyant quelques photos (avec des issues
différentes : livres détectés, aucun livre, échec) puis en ouvrant l'historique et en constatant
qu'elles y figurent toutes, dans l'ordre antéchronologique, avec la bonne date et le bon résumé.

**Acceptance Scenarios**:

1. **Given** l'utilisateur a déjà envoyé plusieurs photos, **When** il ouvre l'historique, **Then**
   il voit une entrée par photo envoyée, la plus récente en premier, chacune avec sa date d'envoi,
   une vignette de la photo et le résumé de son issue.
2. **Given** l'utilisateur n'a encore envoyé aucune photo, **When** il ouvre l'historique, **Then**
   un message l'indique et l'invite à prendre une première photo.
3. **Given** l'utilisateur vient d'envoyer une photo depuis l'écran d'envoi, **When** il ouvre
   ensuite l'historique, **Then** cette photo y apparaît en tête, avec l'issue de son analyse.
4. **Given** un historique qui contient plus d'envois que l'écran ne peut en afficher d'un coup,
   **When** l'utilisateur fait défiler la liste, **Then** il peut atteindre les envois plus anciens,
   jusqu'au tout premier.

---

### User Story 2 - Revoir le détail d'un envoi (Priority: P1)

Depuis l'historique, l'utilisateur ouvre un envoi et retrouve la photo en grand à côté de la liste
des livres détectés (titre et, quand il est connu, auteur) — exactement ce qu'il avait vu à l'écran
de résultat au moment de l'envoi, pour pouvoir rapprocher les livres de l'étagère photographiée.

**Why this priority**: Voir qu'un envoi existe ne sert à rien sans pouvoir relire ce qu'il contient.
US1 et US2 forment ensemble le minimum utile ; séparées pour pouvoir être testées isolément.

**Independent Test**: Peut être testée seule en ouvrant directement un envoi connu (dont on sait
quels livres ont été détectés) et en constatant que la photo et la liste des livres s'affichent.

**Acceptance Scenarios**:

1. **Given** un envoi dont l'analyse a détecté des livres, **When** l'utilisateur l'ouvre, **Then**
   il voit la photo et la liste des livres détectés, avec les mêmes entrées et dans le même ordre
   qu'à l'écran de résultat.
2. **Given** un envoi dont l'analyse n'a détecté aucun livre, **When** l'utilisateur l'ouvre,
   **Then** il voit la photo et un message indiquant qu'aucun livre n'avait été détecté.
3. **Given** un envoi dont l'analyse a échoué, ou n'a jamais été lancée, **When** l'utilisateur
   l'ouvre, **Then** il voit la photo et un message propre à ce cas, distinct de « aucun livre
   détecté ».
4. **Given** le détail d'un envoi affiché, **When** l'utilisateur revient en arrière, **Then** il
   retrouve l'historique à l'endroit où il l'avait quitté.

---

### User Story 3 - Relancer l'analyse d'un envoi sans résultat (Priority: P3)

Un envoi dont l'analyse a échoué (panne du service de reconnaissance) ou n'a jamais été lancée
(coupure réseau entre l'envoi et l'analyse) apparaît dans l'historique sans liste de livres.
L'utilisateur peut relancer l'analyse depuis le détail de cet envoi, sans reprendre la photo — ce
qui était précisément la raison de la conserver (spec 001, US3).

**Why this priority**: Utile mais pas indispensable au premier usage de l'historique : les envois
sans résultat sont rares, et l'utilisateur peut toujours renvoyer la même photo depuis l'écran
d'envoi. Retenue dans cette feature, en dernière priorité — décision actée avec le porteur du
projet le 27/09/2026.

**Independent Test**: Peut être testée seule en ouvrant un envoi en échec, en relançant l'analyse
avec un service de reconnaissance de nouveau disponible, et en constatant que l'envoi porte
désormais la liste des livres détectés, dans le détail comme dans l'historique.

**Acceptance Scenarios**:

1. **Given** un envoi dont l'analyse a échoué ou n'a jamais été lancée, **When** l'utilisateur
   relance l'analyse et qu'elle aboutit, **Then** le détail affiche les livres détectés (ou « aucun
   livre détecté ») et le résumé de l'envoi dans l'historique est mis à jour.
2. **Given** une relance en cours, **When** l'analyse n'est pas terminée, **Then** un état de
   chargement est visible et une seconde relance du même envoi est impossible.
3. **Given** une relance qui échoue à nouveau, **When** l'échec est constaté, **Then** l'envoi reste
   en échec, un message invite à réessayer plus tard, et la relance reste possible.
4. **Given** un envoi dont l'analyse a abouti (avec ou sans livre), **When** l'utilisateur l'ouvre,
   **Then** aucune relance ne lui est proposée.

---

### Edge Cases

- Un envoi dont l'analyse est **en cours** au moment où l'historique est ouvert (depuis un autre
  onglet, par exemple) est présenté comme « analyse non lancée » (FR-005) : l'historique n'affiche
  pas d'état « en cours ». Le système, lui, sait qu'une analyse tourne : s'il est relancé (US3)
  pendant ce temps, la relance est refusée avec un message indiquant qu'une analyse de cette photo
  est déjà en cours, sans nouvel appel au service de reconnaissance — jamais deux résultats pour la
  même photo (FR-011). *(Précisé le 27/09/2026, après `/speckit-analyze`.)*
- Une photo dont l'image ne peut plus être affichée (format que le navigateur ne sait pas montrer,
  comme HEIC hors Safari ; photo introuvable côté stockage) : l'entrée reste listée avec sa date et
  son résumé, la vignette est remplacée par un indicateur neutre (FR-008).
- Un envoi dont l'identifiant n'existe pas (lien obsolète ou erroné vers un détail) : un message
  indique que l'envoi est introuvable et propose de revenir à l'historique.
- Coupure réseau pendant le chargement de l'historique ou d'un détail : un message d'erreur
  s'affiche plutôt qu'une liste vide, qui laisserait croire qu'aucun envoi n'existe.
- Un historique volumineux (plusieurs centaines d'envois, soit quelques mois d'usage) reste
  navigable sans ralentissement perceptible (SC-002).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT offrir un historique des envois, accessible depuis l'écran d'envoi,
  et permettre de revenir à l'écran d'envoi depuis l'historique.
- **FR-002**: L'historique DOIT lister chaque photo dont l'envoi a été accepté (spec 001, FR-011),
  quelle que soit l'issue de son analyse — et seulement celles-là : un fichier refusé avant envoi
  n'y figure jamais (spec 001, FR-013).
- **FR-003**: L'historique DOIT être trié du plus récent au plus ancien, selon la date d'envoi de la
  photo.
- **FR-004**: Chaque entrée de l'historique DOIT montrer la date d'envoi, une vignette de la photo
  et un résumé de l'issue de l'analyse.
- **FR-005**: Le résumé DOIT distinguer quatre issues, chacune avec un libellé propre : livres
  détectés (avec leur nombre), aucun livre détecté, analyse en échec, analyse non lancée.
- **FR-006**: L'historique DOIT permettre d'atteindre tous les envois, du plus récent au tout
  premier, sans que l'affichage des premiers attende le chargement de tous les autres.
- **FR-007**: Le détail d'un envoi DOIT montrer la photo en grand et, si l'analyse a abouti, la liste
  des livres détectés (titre et, quand il est connu, auteur) telle qu'elle avait été obtenue ; sinon,
  un message propre à l'issue (FR-005).
- **FR-008**: Une photo impossible à afficher DOIT être remplacée par un indicateur neutre, sans
  jargon technique, sans empêcher la consultation du reste de l'entrée ni de son détail.
- **FR-009**: L'historique ne DOIT jamais exposer le nom de fichier d'origine de la photo (spec 001,
  FR-015) : un envoi s'identifie par sa date et sa vignette.
- **FR-010**: Le système DOIT distinguer, à l'affichage, un historique vide d'un historique qui n'a
  pas pu être chargé.
- **FR-011**: Le système DOIT permettre de relancer l'analyse d'un envoi en
  échec ou non lancé, en réutilisant la photo conservée, et NE DOIT PAS la proposer pour un envoi dont
  l'analyse a abouti. Une photo ne porte jamais plus d'un résultat d'analyse abouti.
- **FR-012**: L'historique et le détail sont accessibles sans authentification, comme l'envoi
  aujourd'hui : quiconque connaît l'adresse de l'application peut les consulter. Risque assumé et
  consigné (Assumptions) ; il est borné par FR-014 à FR-016.
- **FR-013**: Cette feature NE DOIT modifier aucun envoi existant par elle-même : consulter
  l'historique ou un détail ne change ni la photo, ni son résultat, ni sa date. Seule la relance
  (FR-011) pose un résultat, et uniquement sur un envoi qui n'en avait pas.
- **FR-014**: Le système DOIT limiter le nombre de requêtes qu'une même source peut adresser à
  l'application sur une courte période, pour qu'un usage abusif ou automatisé (rafale, tentative de
  saturation) soit refusé au lieu d'être servi. Au-delà de la limite, l'utilisateur voit un message
  l'invitant à réessayer un peu plus tard, distinct d'une panne.
- **FR-015**: Le système DOIT plafonner le nombre d'analyses déclenchées par jour — envois et
  relances (FR-011) confondus, puisque chacune est facturée par le service de reconnaissance. Le
  plafond couvre largement l'usage attendu (Assumptions) ; une fois atteint, une nouvelle analyse
  est refusée avec un message explicite jusqu'au lendemain, et la photo envoyée reste conservée
  (spec 001, FR-014) pour pouvoir être relancée plus tard.
- **FR-016**: La liste de l'historique NE DOIT PAS transférer les photos dans leur taille d'origine
  (jusqu'à 20 Mo chacune) : les vignettes sont des versions allégées, la photo complète n'étant
  chargée qu'à l'ouverture du détail d'un envoi.

### Key Entities

- **Envoi** : une photo d'étagère dont l'envoi a été accepté, telle qu'elle est conservée depuis la
  spec 001 (« Scan conservé ») — sa date d'envoi, la photo elle-même, et l'issue de son analyse
  (livres détectés, aucun livre, échec, non lancée). Cette feature ne crée pas de nouvelle donnée :
  elle rend visibles celles que la spec 001 conserve déjà.
- **Historique des envois** : la liste ordonnée des envois de l'utilisateur, du plus récent au plus
  ancien. Distinct de la **bibliothèque** du contexte `curation` (les livres possédés, ADR 0010).
- **Livre détecté** : un couple (auteur éventuel, titre) tiré de la photo par la reconnaissance, tel
  qu'il a été obtenu au moment de l'analyse — sans réconciliation ni enrichissement (hors scope).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un utilisateur retrouve les livres détectés sur une photo envoyée plusieurs jours plus
  tôt en moins de 20 secondes depuis l'ouverture de l'application, sans avoir à renvoyer la photo.
- **SC-002**: À chaud (service déjà démarré), l'historique affiche ses premières entrées en moins de
  2 secondes, y compris quand il compte plusieurs centaines d'envois (soit plus d'un an d'usage au
  rythme de 20 à 200 photos par mois), et sans charger plus de 5 Mo de données pour une page de
  vignettes. Le premier affichage après une période d'inactivité (démarrage à froid du service et
  de la base) n'est pas couvert par ce critère : il relève de l'hébergement (ADR 0004).
- **SC-003**: 100 % des envois acceptés figurent dans l'historique, avec une issue affichée conforme
  à celle réellement obtenue (aucun envoi manquant, aucun envoi en double).
- **SC-004**: L'historique et le détail d'un envoi restent utilisables sur un écran de téléphone
  (largeur 360px et plus), sans défilement horizontal.
- **SC-005**: Un envoi en échec peut être ramené à un résultat en une seule
  action de l'utilisateur, sans ressaisie ni nouvel envoi de la photo.
- **SC-006**: Le coût mensuel du service de reconnaissance ne peut pas dépasser le coût de 30 jours
  au plafond d'analyses (FR-015), quel que soit le volume de requêtes reçues ; une rafale de requêtes
  depuis une même source est refusée dès qu'elle dépasse la limite (FR-014), sans dégrader l'usage
  normal de l'utilisateur.

## Assumptions

- Usage mono-utilisateur, toujours sans compte : l'historique est celui de l'identifiant technique
  fixe déjà posé par la spec 001, et contient donc tous les envois conservés à ce jour — y compris
  ceux faits avant la mise en service de cette feature.
- **Accès ouvert, risque assumé** — décision actée avec le porteur du projet le 27/09/2026. L'API
  est publique et sans authentification ; jusqu'ici
  une photo n'était atteignable qu'en connaissant son identifiant, l'historique les rend toutes
  consultables par quiconque connaît l'adresse de l'application. Le risque est jugé acceptable pour
  un usage personnel (adresse non publiée, photos d'étagères de ressourcerie, peu sensibles) ; il est
  à reconsidérer dès que des comptes utilisateurs réels existeront, ou avant toute diffusion de
  l'adresse. En contrepartie, l'exposition est bornée contre l'abus et la facturation excessive
  (FR-014 à FR-016).
- Le plafond d'analyses (FR-015) vaut par défaut **50 analyses par jour** — environ sept fois la
  moyenne haute de l'usage attendu (200 photos par mois), de quoi absorber une grosse journée en
  ressourcerie. Il s'applique aussi à l'envoi existant (spec 001) : c'est un garde-fou global sur la
  facturation, pas propre à l'historique. Le moyen de le faire respecter, comme la limite de
  requêtes par source (FR-014), relève du plan — et d'un ADR s'il s'avère transverse (infrastructure
  partagée par l'API et le front).
- Consultation seule, hors US3 : pas de suppression, de renommage, d'étiquetage, de recherche ni de
  filtre dans cette feature. La suppression d'un envoi rejoint la question de rétention laissée
  ouverte par la spec 001 et l'ADR 0006.
- Les livres affichés sont ceux obtenus au moment de l'analyse, tels quels : ni réconciliation ni
  enrichissement (contexte `bibliography`, à venir), ni correspondance avec la bibliothèque ou la
  liste de souhaits (contexte `curation`, à venir). Ces features viendront s'appuyer sur
  l'historique, pas l'inverse.
- Le score de confiance des livres détectés reste non affiché, comme dans la spec 001.
- La date affichée est celle de l'envoi de la photo, pas celle de l'issue de l'analyse — cohérent
  avec l'horodatage conservé par la spec 001.
- Le volume attendu (20 à 200 photos par mois) ne justifie ni recherche plein texte ni regroupement
  par période dans cette première version : un défilement antéchronologique suffit.
