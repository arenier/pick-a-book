# Feature Specification: Upload d'une photo d'étagère

**Feature Branch**: `[001-photo-upload]`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "upload d'une photo"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prendre une photo et voir les livres détectés (Priority: P1)

En ressourcerie, devant une étagère, l'utilisateur ouvre l'application sur son téléphone, prend
une photo de l'étagère (ou en choisit une déjà prise), l'envoie, et voit apparaître la liste des
livres détectés (auteur, titre) pendant que l'analyse se fait.

**Why this priority**: C'est le seul point d'entrée de tout le produit — sans lui, aucune des
fonctionnalités en aval (réconciliation, curation) n'est atteignable. C'est aussi la première
brique frontend du projet : l'interface n'existe pas encore.

**Independent Test**: Peut être testée seule en soumettant une photo depuis un téléphone (ou son
équivalent en émulation d'écran mobile) et en constatant qu'une liste de livres détectés s'affiche,
sans dépendre d'aucune autre fonctionnalité de l'application.

**Acceptance Scenarios**:

1. **Given** l'utilisateur est sur l'écran d'accueil, **When** il prend une photo avec l'appareil
   photo de son téléphone et l'envoie, **Then** l'application affiche un état de chargement pendant
   l'analyse puis la liste des livres détectés (auteur si connu, titre, sans doublon d'affichage).
2. **Given** l'utilisateur est sur l'écran d'accueil, **When** il choisit une photo existante dans
   sa galerie et l'envoie, **Then** le même comportement s'applique que pour une photo prise sur
   l'instant.
3. **Given** une photo envoyée dont l'étagère ne contient aucun livre reconnaissable, **When**
   l'analyse se termine, **Then** l'application indique clairement qu'aucun livre n'a été détecté
   et propose de réessayer avec une autre photo.

---

### User Story 2 - Être prévenu quand la photo est refusée (Priority: P2)

L'utilisateur envoie un fichier que le système ne peut pas traiter (mauvais format, poids excessif,
fichier vide ou corrompu) et comprend immédiatement pourquoi, sans page blanche ni message
technique.

**Why this priority**: Sans ce garde-fou, un envoi refusé silencieusement ou avec une erreur brute
casse la confiance dans l'outil dès le premier usage. C'est secondaire au chemin heureux (US1) mais
nécessaire avant toute mise en usage réel.

**Independent Test**: Peut être testée seule en soumettant un fichier non conforme (par exemple un
PDF, une image de plus de 20 Mo, ou un fichier vide) et en constatant qu'un message compréhensible
s'affiche sans que l'application ne plante ni ne reste bloquée en chargement.

**Acceptance Scenarios**:

1. **Given** l'utilisateur choisit un fichier qui n'est pas une image (ex. PDF), **When** il tente
   de l'envoyer, **Then** l'application refuse l'envoi avant ou après soumission et affiche un
   message expliquant que le format n'est pas pris en charge.
2. **Given** l'utilisateur choisit une image de plus de 20 Mo, **When** il tente de l'envoyer,
   **Then** l'application affiche un message expliquant que le fichier est trop volumineux.
3. **Given** l'analyse échoue côté serveur (panne du service de reconnaissance), **When** la
   réponse d'erreur arrive, **Then** l'application affiche un message invitant à réessayer plus
   tard, distinct du message "aucun livre détecté".

---

### User Story 3 - Reprendre après une erreur ou changer de photo (Priority: P3)

L'utilisateur qui a reçu une erreur, ou qui n'est pas satisfait de la photo envoyée (floue,
mauvais angle), peut immédiatement recommencer avec une nouvelle photo sans recharger la page ni
perdre le fil.

**Why this priority**: Confort d'usage plutôt que fonctionnalité bloquante — améliore la
récupération sur erreur mais l'outil reste utilisable sans, en rechargeant la page.

**Independent Test**: Peut être testée seule en déclenchant une erreur ou en obtenant un résultat,
puis en vérifiant qu'un bouton ou une action ramène à l'état initial prêt pour un nouvel envoi.

**Acceptance Scenarios**:

1. **Given** un résultat (liste de livres ou erreur) est affiché, **When** l'utilisateur choisit de
   recommencer, **Then** l'application revient à l'état initial, prête à recevoir une nouvelle
   photo.

### Edge Cases

- Que se passe-t-il si l'utilisateur envoie une photo alors qu'une analyse précédente est encore en
  cours ? (une seule analyse à la fois : le nouvel envoi remplace ou est bloqué tant que la
  précédente n'est pas terminée — voir FR-007)
- Que se passe-t-il si la connexion réseau est interrompue pendant l'envoi ou l'analyse ?
- Que se passe-t-il si l'utilisateur quitte l'écran (navigation, mise en veille du téléphone)
  pendant l'analyse ?
- Que se passe-t-il si l'appareil de l'utilisateur ne dispose pas d'appareil photo (ordinateur de
  bureau) ? L'envoi depuis un fichier existant doit rester possible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT permettre à l'utilisateur de fournir une photo soit en la prenant
  directement avec l'appareil photo du téléphone, soit en choisissant un fichier existant.
- **FR-002**: Le système DOIT n'accepter qu'une seule photo par envoi (le contrat existant de
  reconnaissance, `ShelfScannerPort.scan`, traite une image à la fois).
- **FR-003**: Le système DOIT valider côté interface le type de fichier (image) avant envoi, pour
  éviter un aller-retour réseau inutile sur un fichier manifestement non conforme.
- **FR-004**: Le système DOIT afficher un état de chargement visible pendant toute la durée de
  l'analyse, l'utilisateur étant informé qu'un traitement est en cours.
- **FR-005**: Le système DOIT afficher, à l'issue d'une analyse réussie, la liste des livres
  détectés avec leur titre et, quand il est connu, leur auteur.
- **FR-006**: Le système DOIT distinguer clairement trois issues à l'utilisateur : livres détectés,
  aucun livre détecté, et échec de l'analyse (panne du service en amont) — chacune avec un message
  propre à sa cause.
- **FR-007**: Le système DOIT empêcher l'envoi d'une nouvelle photo tant qu'une analyse est en
  cours pour la même session d'utilisation.
- **FR-008**: Le système DOIT permettre à l'utilisateur de revenir à l'état initial après un
  résultat ou une erreur, pour envoyer une nouvelle photo sans recharger la page.
- **FR-009**: Le système DOIT refuser, avec un message compréhensible sans jargon technique, un
  fichier dont le format n'est pas prix en charge (formats pris en charge : JPEG, PNG, WebP, HEIC)
  ou dont le poids dépasse 20 Mo — limites déjà appliquées côté serveur (`ShelfPhoto`), reprises
  côté interface pour un retour immédiat.
- **FR-010**: Le système DOIT rester utilisable sur un appareil sans appareil photo (l'envoi d'un
  fichier existant suffit alors).

### Key Entities

- **Photo soumise** : la photo d'étagère fournie par l'utilisateur pour un envoi — ses attributs
  significatifs pour cette feature sont son format et son poids ; son contenu visuel est traité
  par la reconnaissance (hors scope de cette spec).
- **Résultat d'analyse** : ce que l'utilisateur voit après un envoi — une liste de livres détectés
  (auteur optionnel, titre), ou l'indication qu'aucun livre n'a été détecté, ou un message d'échec.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un utilisateur nouveau peut envoyer une photo et voir un résultat (livres détectés,
  aucun livre, ou erreur) sans explication préalable, en moins de 30 secondes du lancement de
  l'application à l'affichage du résultat (hors temps d'analyse du service de reconnaissance).
- **SC-002**: 100 % des fichiers non conformes (mauvais format, poids excessif) déclenchent un
  message d'erreur compréhensible, jamais une page blanche ou un blocage silencieux.
- **SC-003**: Un utilisateur peut enchaîner l'envoi de deux photos successives (avec ou sans
  résultat entre les deux) sans recharger la page.
- **SC-004**: L'écran d'envoi et le résultat restent utilisables sur un écran de la taille d'un
  téléphone (largeur 360px et plus), sans défilement horizontal.

## Assumptions

- Usage mono-utilisateur, une photo à la fois, sans compte ni authentification (cohérent avec
  l'usage personnel décrit pour le projet) — pas de file d'attente ni d'historique multi-appareil
  à gérer dans cette feature.
- La photo n'est pas persistée par cette feature : elle est envoyée pour analyse et le résultat
  s'affiche, cohérent avec le comportement déjà en place côté API (`ScanController` : « éphémère
  en V1 »).
- Les formats acceptés et la taille maximale (JPEG/PNG/WebP/HEIC, 20 Mo) reprennent une contrainte
  déjà actée côté domaine (`ShelfPhoto`, contexte `recognition`) plutôt que d'en introduire une
  nouvelle pour cette feature.
- La réconciliation bibliographique et l'affichage enrichi des livres (couverture, résumé) sont
  hors scope : cette feature s'arrête à l'affichage des couples (auteur, titre) tels que retournés
  par la reconnaissance.
- Le réseau du téléphone est disponible mais peut être lent ou instable — la feature affiche un
  message d'erreur réseau plutôt que de rester bloquée indéfiniment, sans exigence de nouvelle
  tentative automatique.
